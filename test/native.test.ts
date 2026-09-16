import { inspect } from "node:util"
import { describe, expect, test } from "vitest"
import { TaggedError, wrap } from "../src/index.ts"

class Fast extends TaggedError("Fast")<{ id: string }> {}
class Native extends TaggedError("Native", { native: true })<{ id: string }> {}
class NativeTraced extends TaggedError("NativeTraced", { native: true, stack: true }) {}

const isError = (Error as { isError?: (value: unknown) => boolean }).isError

describe("native option", () => {
  test("instances carry the native error slot", () => {
    const err = new Native({ id: "1" })
    expect(Object.prototype.toString.call(err)).toBe("[object Error]")
    if (typeof isError === "function") expect(isError(err)).toBe(true)
    expect(err).toBeInstanceOf(Native)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("Native")
    expect(err.id).toBe("1")
    expect(Native.is(err)).toBe(true)
  })

  test("the default path does not carry the slot", () => {
    const err = new Fast({ id: "1" })
    expect(Object.prototype.toString.call(err)).toBe("[object Object]")
    if (typeof isError === "function") expect(isError(err)).toBe(false)
  })

  test("no frames unless stack is requested", () => {
    const quiet = new Native({ id: "1" })
    expect(String(quiet.stack ?? "")).not.toContain("    at ")
    const traced = new NativeTraced()
    expect(String(traced.stack)).toContain("    at ")
    expect(Error.stackTraceLimit).toBeGreaterThan(0)
  })

  test("wrap, inspect and JSON behave the same as the fast path", () => {
    const err = wrap(new Native({ id: "9" }), "ctx")
    expect(err).toBeInstanceOf(Native)
    expect(err.message).toBe("ctx: Native")
    expect(JSON.parse(JSON.stringify(err))).toMatchObject({ name: "Native", id: "9" })
    expect(inspect(new Native({ id: "9" }))).toContain("'9'")
  })
})
