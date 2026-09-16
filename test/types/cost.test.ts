import { attest } from "@ark/attest"
import { describe, test } from "vitest"
import { all, attempt, fail, match, ok, TaggedError, wrap } from "../../src/index.ts"

// Ceilings on type instantiations for the generic entry points. A jump here means a
// type-level change made every consumer's build slower; investigate before raising.

class A extends TaggedError("A")<{ a: number }> {}
class B extends TaggedError("B")<{ b: string }> {}
class C extends TaggedError("C")<{ c: boolean }> {}
class D extends TaggedError("D") {}
class E extends TaggedError("E") {}
class Boundary extends TaggedError("Boundary")<{ cause: Error }> {}

describe("type instantiation cost", () => {
  test("match over five tagged members", () => {
    attest.instantiations([650, "instantiations"])
    const err = new A({ a: 1 }) as A | B | C | D | E
    match(err, {
      A: (e) => e.a,
      B: (e) => e.b.length,
      C: (e) => (e.c ? 1 : 0),
      D: () => 0,
      E: () => 0,
    })
  })

  test("union of ok and fail returns", () => {
    attest.instantiations([150, "instantiations"])
    function f(n: number) {
      if (n === 0) return fail(new A({ a: n }))
      if (n === 1) return fail(new B({ b: "" }))
      return ok(n)
    }
    const [err, value] = f(2)
    if (err) return err
    return value
  })

  test("attempt overload resolution", () => {
    attest.instantiations([300, "instantiations"])
    attempt(() => 1)
    attempt(async () => 1)
    attempt(() => 1, Boundary)
  })

  test("all over four results and a three-deep wrap", () => {
    attest.instantiations([550, "instantiations"])
    all([ok(1), ok("x"), fail(new A({ a: 1 })), ok(true)])
    wrap(wrap(wrap(new B({ b: "" }), "1"), "2"), "3")
  })
})
