import * as sb from "@superbuilders/errors"
import { bench, do_not_optimize, group, summary } from "mitata"
import { ResultAsync } from "neverthrow"
import { attempt } from "../src/index.ts"
import { NotFoundError, rotate } from "./shared.ts"

// Crossing an async boundary: a promise that resolves most of the time and rejects
// sometimes. Every approach awaits exactly one promise per iteration.

function makeSources(rejectRate: number): Array<() => Promise<number>> {
  const sources: Array<() => Promise<number>> = []
  for (let i = 0; i < 1000; i++) {
    const rejects = i / 1000 < rejectRate
    sources.push(
      rejects ? () => Promise.reject(new NotFoundError(`u${i}`)) : () => Promise.resolve(i),
    )
  }
  return sources
}

for (const rejectRate of [0, 0.1, 0.5]) {
  const sources = makeSources(rejectRate)
  group(`await one promise, ${rejectRate * 100}% rejections`, () => {
    summary(() => {
      const next = rotate(sources)
      bench("errval attempt(promise)", async () => {
        const [err, value] = await attempt(next()())
        do_not_optimize(err ? err.message.length : value)
      }).baseline(true)
      const next2 = rotate(sources)
      bench("try/await/catch", async () => {
        try {
          do_not_optimize(await next2()())
        } catch (e) {
          do_not_optimize((e as Error).message.length)
        }
      })
      const next3 = rotate(sources)
      bench("neverthrow ResultAsync.fromPromise", async () => {
        const r = await ResultAsync.fromPromise(next3()(), (e) => e as Error)
        do_not_optimize(r.isErr() ? r.error.message.length : r.value)
      })
      const next4 = rotate(sources)
      bench("@superbuilders/errors.try", async () => {
        const r = await sb.try(next4()())
        do_not_optimize(r.error ? r.error.message.length : r.data)
      })
    })
  })
}
