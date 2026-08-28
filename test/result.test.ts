import { describe, expect, test } from "vitest"
import { all, fail, must, ok, TaggedError, valueOr } from "../src/index.ts"

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Boom extends TaggedError("Boom", { stack: true }) {}

describe("ok", () => {
  test("wraps a value err-first", () => {
    expect(ok(1)).toEqual([undefined, 1])
  })

  test("keeps falsy values", () => {
    expect(ok(0)).toEqual([undefined, 0])
    expect(ok("")).toEqual([undefined, ""])
    expect(ok(false)).toEqual([undefined, false])
    expect(ok(null)).toEqual([undefined, null])
  })

  test("void result is a shared frozen tuple", () => {
    const a = ok()
    const b = ok()
    expect(a).toBe(b)
    expect(Object.isFrozen(a)).toBe(true)
    expect(a).toEqual([undefined, undefined])
  })

  test("ok(undefined) allocates a fresh tuple", () => {
    expect(ok(undefined)).not.toBe(ok())
  })
})

describe("fail", () => {
  test("wraps an error", () => {
    const err = new NotFound({ id: "1" })
    const r = fail(err)
    expect(r[0]).toBe(err)
    expect(r[1]).toBeUndefined()
  })
})

describe("destructuring", () => {
  function find(id: string) {
    if (id === "missing") return fail(new NotFound({ id }))
    return ok({ id, email: `${id}@example.com` })
  }

  test("if (err) guards the value", () => {
    const [err, user] = find("7")
    if (err) throw new Error("unexpected")
    expect(user.email).toBe("7@example.com")
  })

  test("error branch carries the tagged error", () => {
    const [err, user] = find("missing")
    expect(user).toBeUndefined()
    expect(err).toBeInstanceOf(NotFound)
    expect(err?.id).toBe("missing")
  })
})

describe("must", () => {
  test("returns the value", () => {
    expect(must(ok(42))).toBe(42)
  })

  test("throws the error itself", () => {
    const err = new NotFound({ id: "x" })
    expect(() => must(fail(err))).toThrow(err)
  })

  test("captures a stack at the throw site for stackless tagged errors", () => {
    const err = new NotFound({ id: "x" })
    expect(Object.hasOwn(err, "stack")).toBe(false)
    try {
      must(fail(err))
    } catch (thrown) {
      expect(thrown).toBe(err)
      expect(typeof (thrown as Error).stack).toBe("string")
    }
  })

  test("does not overwrite an existing stack", () => {
    const err = new Boom()
    const before = err.stack
    expect(() => must(fail(err))).toThrow()
    expect(err.stack).toBe(before)
  })
})

describe("valueOr", () => {
  test("value when ok", () => {
    expect(valueOr(ok(1), 2)).toBe(1)
  })

  test("fallback value when failed", () => {
    expect(valueOr(fail(new NotFound({ id: "a" })), 2)).toBe(2)
  })

  test("fallback function receives the error", () => {
    const out = valueOr(fail(new NotFound({ id: "a" })), (e) => (e as NotFound).id)
    expect(out).toBe("a")
  })
})

describe("all", () => {
  test("collects values in order", () => {
    const [err, values] = all([ok(1), ok("two"), ok(true)])
    expect(err).toBeUndefined()
    expect(values).toEqual([1, "two", true])
  })

  test("returns the first failure", () => {
    const first = new NotFound({ id: "1" })
    const second = new NotFound({ id: "2" })
    const [err, values] = all([ok(1), fail(first), fail(second)])
    expect(err).toBe(first)
    expect(values).toBeUndefined()
  })

  test("empty input succeeds with an empty tuple", () => {
    expect(all([])).toEqual([undefined, []])
  })
})
