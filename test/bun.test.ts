import { describe, expect, test } from "vitest"
import { TaggedError, wrap } from "../src/index.ts"

// Runs only under `bun test`; vitest on Node skips it.
const bun = (globalThis as { Bun?: { inspect: (value: unknown) => string } }).Bun

class NotFound extends TaggedError("NotFound")<{ id: string }> {}

describe.skipIf(bun === undefined)("bun console formatting", () => {
  test("prints like an error with its fields and cause", () => {
    const text = bun?.inspect(wrap(new NotFound({ id: "42" }), "getUser")) ?? ""
    expect(text.startsWith("[NotFound: getUser: NotFound]")).toBe(true)
    expect(text).toContain('id: "42"')
    expect(text).toContain("[cause]: [NotFound: NotFound]")
  })

  test("plain tag when message is the default", () => {
    const text = bun?.inspect(new NotFound({ id: "1" })) ?? ""
    expect(text.startsWith("[NotFound]")).toBe(true)
  })
})
