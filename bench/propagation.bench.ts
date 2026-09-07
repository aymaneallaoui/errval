import { bench, do_not_optimize, group, summary } from "mitata"
import { type Result as NResult, err as nerr, ok as nok } from "neverthrow"
import { fail, ok, type Result, wrap } from "../src/index.ts"
import { NotFound, NotFoundError, RATES, rotate } from "./shared.ts"

// An error born five calls deep and handled at the top, with one line of context added
// per layer. This is the shape of most service code: repo -> service -> use case -> handler.

const DEPTH = 5

function errnilLeaf(id: string): Result<number, NotFound> {
  return id.startsWith("m") ? fail(new NotFound({ id })) : ok(id.length)
}
function errnilLayer(id: string, depth: number): Result<number, NotFound> {
  if (depth === 0) return errnilLeaf(id)
  const [err, value] = errnilLayer(id, depth - 1)
  if (err) return fail(wrap(err, `layer ${depth}`))
  return ok(value + 1)
}

function throwLeaf(id: string): number {
  if (id.startsWith("m")) throw new NotFoundError(id)
  return id.length
}
function throwLayer(id: string, depth: number): number {
  if (depth === 0) return throwLeaf(id)
  try {
    return throwLayer(id, depth - 1) + 1
  } catch (e) {
    throw new Error(`layer ${depth}`, { cause: e })
  }
}

function neverthrowLeaf(id: string): NResult<number, { id: string; context: string[] }> {
  return id.startsWith("m") ? nerr({ id, context: [] }) : nok(id.length)
}
function neverthrowLayer(
  id: string,
  depth: number,
): NResult<number, { id: string; context: string[] }> {
  if (depth === 0) return neverthrowLeaf(id)
  return neverthrowLayer(id, depth - 1)
    .map((v) => v + 1)
    .mapErr((e) => ({ id: e.id, context: [...e.context, `layer ${depth}`] }))
}

for (const rate of RATES) {
  const ids: string[] = []
  const failing = rate.miss + rate.invalid
  for (let i = 0; i < 1000; i++) ids.push(i / 1000 < failing ? `missing${i}` : `u${i}`)

  group(`propagate through ${DEPTH} layers, ${rate.label}`, () => {
    summary(() => {
      const next = rotate(ids)
      bench("errnil (wrap per layer)", () => {
        const [err, value] = errnilLayer(next(), DEPTH)
        do_not_optimize(err ? err.message.length : value)
      }).baseline(true)
      const next2 = rotate(ids)
      bench("throw/catch (rethrow with cause)", () => {
        try {
          do_not_optimize(throwLayer(next2(), DEPTH))
        } catch (e) {
          do_not_optimize((e as Error).message.length)
        }
      })
      const next3 = rotate(ids)
      bench("neverthrow (map/mapErr per layer)", () => {
        const r = neverthrowLayer(next3(), DEPTH)
        do_not_optimize(r.isErr() ? r.error.context.length : r.value)
      })
    })
  })
}
