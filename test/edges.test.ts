import { Worker } from "node:worker_threads"
import { describe, expect, test } from "vitest"
import { attempt, Joined, join, match, TaggedError, Thrown, wrap } from "../src/index.ts"

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Timeout extends TaggedError("Timeout")<{ ms: number }> {}

describe("Thrown", () => {
  test("survives values whose toString throws", () => {
    const hostile = {
      toString() {
        throw new Error("nope")
      },
    }
    const [err] = attempt(() => {
      throw hostile
    })
    expect(err).toBeInstanceOf(Thrown)
    expect((err as Thrown).value).toBe(hostile)
    expect(err?.message).toBe("non-Error value thrown: object")
  })

  test("symbols, null and undefined", () => {
    const sym = Symbol("s")
    expect(
      attempt(() => {
        throw sym
      })[0]?.message,
    ).toContain("Symbol(s)")
    expect(
      attempt(() => {
        throw null
      })[0]?.message,
    ).toBe("non-Error value thrown: null")
    expect(
      (
        attempt(() => {
          throw undefined
        })[0] as Thrown
      ).value,
    ).toBeUndefined()
  })
})

describe("attempt with thenables", () => {
  test("a non-Promise thenable resolves through the async path", async () => {
    const thenable = {
      // biome-ignore lint/suspicious/noThenProperty: the test needs a bare thenable
      then(resolve: (v: number) => void) {
        resolve(7)
      },
    }
    const r = attempt(thenable as PromiseLike<number>)
    expect(r).toBeInstanceOf(Promise)
    expect(await r).toEqual([undefined, 7])
  })

  test("a thenable returned from a sync function is awaited", async () => {
    const thenable = {
      // biome-ignore lint/suspicious/noThenProperty: the test needs a bare thenable
      then(_resolve: (v: number) => void, reject: (e: unknown) => void) {
        reject(new RangeError("late"))
      },
    }
    const [err] = await attempt(() => thenable as PromiseLike<number>)
    expect(err).toBeInstanceOf(RangeError)
  })
})

describe("Joined", () => {
  test("matches by its own tag and serialises its members", () => {
    const joined = join([new NotFound({ id: "1" }), new Timeout({ ms: 5 })])
    const out = match(joined as Joined<NotFound | Timeout> | NotFound, {
      Joined: (e) => e.errors.length,
      NotFound: () => -1,
    })
    expect(out).toBe(2)
    const json = JSON.parse(JSON.stringify(joined))
    expect(json.name).toBe("Joined")
    expect(json.errors).toEqual([
      { name: "NotFound", message: "NotFound", id: "1" },
      { name: "Timeout", message: "Timeout", ms: 5 },
    ])
    expect(Joined.is(joined)).toBe(true)
  })

  test("wrap keeps a joined error joined", () => {
    const outer = wrap(join([new NotFound({ id: "1" })]), "batch")
    expect(outer).toBeInstanceOf(Joined)
    expect(outer.errors).toHaveLength(1)
    expect(outer.message).toBe("batch: NotFound")
  })
})

describe("workers", () => {
  test("an error crosses worker_threads as data and parse revives it", async () => {
    const worker = new Worker(
      `const { parentPort } = require("node:worker_threads")
       parentPort.once("message", (value) => parentPort.postMessage({ ...value, seen: true }))`,
      { eval: true },
    )
    const sent = new NotFound({ id: "w1" })
    const received = await new Promise<unknown>((resolve) => {
      worker.once("message", resolve)
      worker.postMessage(sent.toJSON())
    })
    await worker.terminate()
    const revived = NotFound.parse(received)
    expect(revived).toBeInstanceOf(NotFound)
    expect(revived?.id).toBe("w1")
    expect((revived as NotFound & { seen: boolean }).seen).toBe(true)
  })
})
