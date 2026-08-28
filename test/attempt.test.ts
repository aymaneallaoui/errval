import { describe, expect, test } from "vitest"
import { attempt, lift, TaggedError, Thrown } from "../src/index.ts"

class DbError extends TaggedError("DbError")<{ cause: Error }> {}

describe("attempt sync", () => {
  test("returns the value", () => {
    expect(attempt(() => 2 + 2)).toEqual([undefined, 4])
  })

  test("catches thrown errors as-is", () => {
    const boom = new RangeError("boom")
    const [err, value] = attempt(() => {
      throw boom
    })
    expect(err).toBe(boom)
    expect(value).toBeUndefined()
  })

  test("wraps non-Error throws in Thrown", () => {
    const [err] = attempt(() => {
      throw "oops"
    })
    expect(err).toBeInstanceOf(Thrown)
    expect((err as Thrown).value).toBe("oops")
    expect(err?.message).toBe("non-Error value thrown: oops")
  })

  test("maps with a function", () => {
    const [err] = attempt(
      () => JSON.parse("{"),
      (e) => ({ kind: "parse", reason: e.message }),
    )
    expect(err?.kind).toBe("parse")
    expect(err?.reason).toContain("JSON")
  })

  test("maps with a TaggedError class using cause", () => {
    const inner = new Error("io")
    const [err] = attempt(() => {
      throw inner
    }, DbError)
    expect(err).toBeInstanceOf(DbError)
    expect(err?.cause).toBe(inner)
  })
})

describe("attempt async", () => {
  test("awaits a promise", async () => {
    expect(await attempt(Promise.resolve(1))).toEqual([undefined, 1])
  })

  test("catches a rejection", async () => {
    const boom = new Error("rejected")
    const [err] = await attempt(Promise.reject(boom))
    expect(err).toBe(boom)
  })

  test("async function: sync throw before the promise is also caught", async () => {
    const [err] = await attempt(async () => {
      throw new Error("early")
    })
    expect(err?.message).toBe("early")
  })

  test("function returning a promise picks the async path", async () => {
    const r = attempt(() => Promise.resolve("late"))
    expect(r).toBeInstanceOf(Promise)
    expect(await r).toEqual([undefined, "late"])
  })

  test("non-Error rejection becomes Thrown", async () => {
    const [err] = await attempt(Promise.reject(42))
    expect(err).toBeInstanceOf(Thrown)
    expect((err as Thrown).value).toBe(42)
  })

  test("maps async errors with a class", async () => {
    const [err] = await attempt(Promise.reject(new Error("io")), DbError)
    expect(err).toBeInstanceOf(DbError)
  })
})

describe("lift", () => {
  test("lifts a sync function", () => {
    const parse = lift(JSON.parse)
    expect(parse("[1]")).toEqual([undefined, [1]])
    const [err] = parse("{")
    expect(err).toBeInstanceOf(SyntaxError)
  })

  test("lifts an async function", async () => {
    const fetchNumber = lift(async (n: number) => {
      if (n < 0) throw new Error("negative")
      return n * 2
    })
    expect(await fetchNumber(2)).toEqual([undefined, 4])
    const [err] = await fetchNumber(-1)
    expect(err?.message).toBe("negative")
  })
})
