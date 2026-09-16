import { describe, expect, test } from "vitest"
import { as, is, join, TaggedError, wrap } from "../src/index.ts"

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Plain extends TaggedError("Plain") {}

describe("parse", () => {
  test("revives a JSON round trip", () => {
    const json = JSON.parse(JSON.stringify(new NotFound({ id: "42" })))
    const err = NotFound.parse(json)
    expect(err).toBeInstanceOf(NotFound)
    expect(err?.id).toBe("42")
    expect(err?.message).toBe("NotFound")
  })

  test("revives a structuredClone", () => {
    const cloned = structuredClone(new NotFound({ id: "7" }))
    expect(cloned).not.toBeInstanceOf(NotFound)
    const err = NotFound.parse({ ...cloned, name: "NotFound" })
    expect(err?.id).toBe("7")
  })

  test("returns the instance untouched and rejects other shapes", () => {
    const original = new NotFound({ id: "1" })
    expect(NotFound.parse(original)).toBe(original)
    expect(NotFound.parse({ name: "Other", id: "1" })).toBeUndefined()
    expect(NotFound.parse(null)).toBeUndefined()
    expect(NotFound.parse("NotFound")).toBeUndefined()
    expect(Plain.parse({ name: "Plain", message: "custom" })?.message).toBe("custom")
  })
})

describe("construction", () => {
  test("no-arg construction works on the value form under a contextual type", () => {
    const Value = TaggedError("Value")
    const v = new Value() as InstanceType<typeof Value> | Error
    expect(v.name).toBe("Value")
  })
})

describe("deep chains", () => {
  test("is and as terminate on long and cyclic chains", () => {
    let err: object = new NotFound({ id: "root" })
    for (let i = 0; i < 1000; i++) err = wrap(err, `layer ${i}`)
    expect(is(err, NotFound)).toBe(true)
    expect(as(err, NotFound)?.id).toBe("root")
    const a = { name: "x", cause: undefined as unknown }
    const b = { name: "y", cause: a }
    a.cause = b
    expect(is(a, NotFound)).toBe(false)
    expect(is(join([a as unknown as Error, new NotFound({ id: "j" })]), NotFound)).toBe(true)
  })
})
