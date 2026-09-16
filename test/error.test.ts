import { inspect } from "node:util"
import { describe, expect, test } from "vitest"
import { as, errors, is, join, match, TaggedError, wrap } from "../src/index.ts"

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class DbError extends TaggedError("DbError")<{ cause: Error }> {}
class Timeout extends TaggedError("Timeout")<{ ms: number }> {
  override get message(): string {
    return `timed out after ${this.ms}ms`
  }
}
class Plain extends TaggedError("Plain") {}
class Traced extends TaggedError("Traced", { stack: true })<{ id: number }> {}

describe("TaggedError", () => {
  test("is an Error without calling the Error constructor", () => {
    const err = new NotFound({ id: "42" })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(NotFound)
    expect(Object.hasOwn(err, "stack")).toBe(false)
  })

  test("exposes tag, name, props", () => {
    const err = new NotFound({ id: "42" })
    expect(NotFound.tag).toBe("NotFound")
    expect(NotFound.name).toBe("NotFound")
    expect(err.name).toBe("NotFound")
    expect(err.id).toBe("42")
    expect(Object.hasOwn(err, "name")).toBe(false)
  })

  test("message defaults to the tag, props can set it, getters can compute it", () => {
    expect(new Plain().message).toBe("Plain")
    expect(new NotFound({ id: "1", message: "custom" } as { id: string }).message).toBe("custom")
    expect(new Timeout({ ms: 30 }).message).toBe("timed out after 30ms")
    expect(String(new Timeout({ ms: 30 }))).toBe("Timeout: timed out after 30ms")
  })

  test("cause is an own property only when provided", () => {
    const inner = new Error("io")
    expect(Object.hasOwn(new Plain(), "cause")).toBe(false)
    const err = new DbError({ cause: inner })
    expect(err.cause).toBe(inner)
  })

  test("stack option captures a stack", () => {
    const err = new Traced({ id: 1 })
    expect(Object.hasOwn(err, "stack")).toBe(true)
    expect(err.stack).toContain("Traced")
  })

  test("static is narrows and survives subclassing", () => {
    const err: unknown = new NotFound({ id: "1" })
    expect(NotFound.is(err)).toBe(true)
    expect(DbError.is(err)).toBe(false)
    expect(NotFound.is(new Error("x"))).toBe(false)
    expect(NotFound.is(null)).toBe(false)
  })

  test("is matches a same-tag error from another copy of the package", () => {
    const Other = TaggedError("NotFound")<{ id: string }>
    const foreign = new Other({ id: "1" })
    expect(foreign).not.toBeInstanceOf(NotFound)
    expect(NotFound.is(foreign)).toBe(true)
  })

  test("toJSON includes name, message, props and a serializable cause", () => {
    const err = new DbError({ cause: new TypeError("bad") })
    expect(JSON.parse(JSON.stringify(err))).toEqual({
      name: "DbError",
      message: "DbError",
      cause: { name: "TypeError", message: "bad" },
    })
    expect(JSON.parse(JSON.stringify(new NotFound({ id: "9" })))).toEqual({
      name: "NotFound",
      message: "NotFound",
      id: "9",
    })
  })

  test("inspects like an error in Node", () => {
    const text = inspect(new NotFound({ id: "42" }))
    expect(text).toContain("NotFound")
    expect(text).toMatch(/id: ['"]42['"]/)
  })

  test("instantiation expression form works without a class declaration", () => {
    const Forbidden = TaggedError("Forbidden")<{ reason: string }>
    const err = new Forbidden({ reason: "nope" })
    expect(err.reason).toBe("nope")
    expect(Forbidden.is(err)).toBe(true)
  })
})

describe("wrap", () => {
  test("keeps prototype and props, prefixes message, links cause", () => {
    const inner = new NotFound({ id: "42" })
    const outer = wrap(inner, "getUser")
    expect(outer).toBeInstanceOf(NotFound)
    expect(outer).not.toBe(inner)
    expect(outer.id).toBe("42")
    expect(outer.message).toBe("getUser: NotFound")
    expect(outer.cause).toBe(inner)
    expect(inner.message).toBe("NotFound")
  })

  test("works on native errors", () => {
    const inner = new TypeError("bad input")
    const outer = wrap(inner, "parse")
    expect(outer).toBeInstanceOf(TypeError)
    expect(outer.message).toBe("parse: bad input")
    expect(outer.cause).toBe(inner)
  })

  test("chains compose", () => {
    const e = wrap(wrap(new NotFound({ id: "1" }), "repo"), "service")
    expect(e.message).toBe("service: repo: NotFound")
    expect((e.cause as NotFound).cause).toBeInstanceOf(NotFound)
  })
})

describe("is / as", () => {
  const root = new TypeError("socket closed")
  const db = new DbError({ cause: root })
  const chain = wrap(db, "getUser")

  test("is walks the cause chain by class", () => {
    expect(is(chain, DbError)).toBe(true)
    expect(is(chain, TypeError)).toBe(true)
    expect(is(chain, NotFound)).toBe(false)
  })

  test("is matches a sentinel instance by identity", () => {
    expect(is(chain, root)).toBe(true)
    expect(is(chain, new TypeError("socket closed"))).toBe(false)
  })

  test("as returns the matching link", () => {
    expect(as(chain, TypeError)).toBe(root)
    expect(as(chain, DbError)).toBe(chain)
    expect(as(db, DbError)?.cause).toBe(root)
    expect(as(chain, NotFound)).toBeUndefined()
  })

  test("tolerates non-error inputs and cycles", () => {
    expect(is(undefined, NotFound)).toBe(false)
    expect(is("nope", NotFound)).toBe(false)
    const a: { cause?: unknown } = new Error("a")
    const b: { cause?: unknown } = new Error("b")
    a.cause = b
    b.cause = a
    expect(is(a, NotFound)).toBe(false)
  })

  test("looks inside joined errors", () => {
    const joined = join([new NotFound({ id: "1" }), new Timeout({ ms: 5 })])
    expect(is(joined, Timeout)).toBe(true)
    expect(as(joined, NotFound)?.id).toBe("1")
    expect(joined.message).toBe("NotFound\ntimed out after 5ms")
    expect(joined.errors).toHaveLength(2)
  })
})

describe("match", () => {
  type AppError = NotFound | Timeout

  test("dispatches on the tag", () => {
    const err = new Timeout({ ms: 3 }) as AppError
    const out = match(err, {
      NotFound: (e) => `missing ${e.id}`,
      Timeout: (e) => `slow ${e.ms}`,
    })
    expect(out).toBe("slow 3")
  })

  test("untagged errors fall through to _", () => {
    const err = new RangeError("r") as NotFound | Error
    const out = match(err, {
      NotFound: () => "tagged",
      _: (e) => `plain ${e.name}`,
    })
    expect(out).toBe("plain RangeError")
  })

  test("a tagged error whose name matches an Object.prototype key still dispatches", () => {
    const Weird = TaggedError("toString")
    const out = match(new Weird({}) as InstanceType<typeof Weird> | Error, {
      toString: () => "tagged",
      _: () => "plain",
    })
    expect(out).toBe("tagged")
  })

  test("throws a TypeError when no handler exists at runtime", () => {
    const err = new NotFound({ id: "1" }) as unknown as Timeout
    expect(() => match(err, { Timeout: () => 1 })).toThrow(TypeError)
  })

  test("errors namespace mirrors the Go spelling", () => {
    const err = new NotFound({ id: "1" })
    expect(errors.is(err, NotFound)).toBe(true)
    expect(errors.as(err, NotFound)).toBe(err)
    expect(errors.wrap(err, "x").message).toBe("x: NotFound")
    expect(errors.match(err, { NotFound: (e) => e.id })).toBe("1")
    expect(errors.join([err]).errors[0]).toBe(err)
  })
})
