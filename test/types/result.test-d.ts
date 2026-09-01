import { describe, expectTypeOf, test } from "vitest"
import {
  type AsyncResult,
  all,
  attempt,
  type ErrorOf,
  type Fail,
  fail,
  match,
  must,
  type Ok,
  type OkOf,
  ok,
  type Result,
  TaggedError,
  valueOr,
  wrap,
} from "../../src/index.ts"

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Forbidden extends TaggedError("Forbidden")<{ reason: string }> {}
class DbError extends TaggedError("DbError")<{ cause: Error }> {}

type User = { id: string; email: string }

function getUser(id: string) {
  if (id === "0") return fail(new NotFound({ id }))
  if (id === "1") return fail(new Forbidden({ reason: "banned" }))
  return ok<User>({ id, email: "" })
}

describe("Result inference", () => {
  test("union of ok/fail is a Result", () => {
    expectTypeOf(getUser("2")).toExtend<Result<User, NotFound | Forbidden>>()
    expectTypeOf<ErrorOf<typeof getUser>>().toEqualTypeOf<NotFound | Forbidden>()
    expectTypeOf<OkOf<typeof getUser>>().toEqualTypeOf<User>()
  })

  test("const destructuring narrows both sides", () => {
    const [err, user] = getUser("2")
    if (err) {
      expectTypeOf(err).toEqualTypeOf<NotFound | Forbidden>()
      expectTypeOf(user).toEqualTypeOf<undefined>()
      return
    }
    expectTypeOf(err).toEqualTypeOf<undefined>()
    expectTypeOf(user).toEqualTypeOf<User>()
  })

  test("falsy values do not break narrowing", () => {
    const r: Result<0 | "" | false | undefined, NotFound> = ok(0)
    const [err, value] = r
    if (err) return
    expectTypeOf(value).toEqualTypeOf<0 | "" | false | undefined>()
  })

  test("void ok", () => {
    expectTypeOf(ok()).toEqualTypeOf<Ok<void>>()
    const [err] = ok()
    expectTypeOf(err).toEqualTypeOf<undefined>()
  })

  test("fail rejects primitives", () => {
    // @ts-expect-error primitives are not errors
    fail("nope")
    // @ts-expect-error null is not an error
    fail(null)
  })

  test("must and valueOr", () => {
    expectTypeOf(must(getUser("2"))).toEqualTypeOf<User>()
    expectTypeOf(valueOr(getUser("2"), null)).toEqualTypeOf<User | null>()
  })

  test("all infers a tuple", () => {
    const r = all([ok(1), ok("a"), getUser("2")])
    expectTypeOf(r).toEqualTypeOf<Result<[number, string, User], NotFound | Forbidden>>()
  })

  test("async results", async () => {
    async function load(): AsyncResult<User, NotFound> {
      return ok<User>({ id: "1", email: "" })
    }
    const [err, user] = await load()
    if (err) {
      expectTypeOf(err).toEqualTypeOf<NotFound>()
      return
    }
    expectTypeOf(user).toEqualTypeOf<User>()
    expectTypeOf<ErrorOf<typeof load>>().toEqualTypeOf<NotFound>()
  })

  test("Fail and Ok are readonly tuples", () => {
    expectTypeOf<Fail<NotFound>>().toEqualTypeOf<readonly [err: NotFound, value: undefined]>()
    expectTypeOf<Ok<number>>().toEqualTypeOf<readonly [err: undefined, value: number]>()
  })
})

describe("attempt overloads", () => {
  test("sync function", () => {
    expectTypeOf(attempt(() => 1)).toEqualTypeOf<Result<number, Error>>()
  })

  test("promise and async function", () => {
    expectTypeOf(attempt(Promise.resolve("x"))).toEqualTypeOf<AsyncResult<string, Error>>()
    expectTypeOf(attempt(async () => 1)).toEqualTypeOf<AsyncResult<number, Error>>()
    expectTypeOf(attempt(() => Promise.resolve(true))).toEqualTypeOf<AsyncResult<boolean, Error>>()
  })

  test("mapper function and class", () => {
    expectTypeOf(
      attempt(
        () => 1,
        (e) => new Forbidden({ reason: e.message }),
      ),
    ).toEqualTypeOf<Result<number, Forbidden>>()
    expectTypeOf(attempt(Promise.resolve(1), DbError)).toEqualTypeOf<AsyncResult<number, DbError>>()
    // @ts-expect-error a class needs a cause prop to be usable as a mapper
    attempt(() => 1, NotFound)
  })

  test("functions with parameters are rejected", () => {
    // @ts-expect-error attempt takes a thunk, use lift for functions with parameters
    attempt(JSON.parse)
  })
})

describe("wrap and match", () => {
  test("wrap preserves the static type", () => {
    const err = new NotFound({ id: "1" }) as NotFound | Forbidden
    expectTypeOf(wrap(err, "ctx")).toEqualTypeOf<NotFound | Forbidden>()
  })

  test("match is exhaustive and narrows", () => {
    const err = new NotFound({ id: "1" }) as NotFound | Forbidden
    const out = match(err, {
      NotFound: (e) => {
        expectTypeOf(e).toEqualTypeOf<NotFound>()
        return e.id.length
      },
      Forbidden: (e) => e.reason,
    })
    expectTypeOf(out).toEqualTypeOf<number | string>()
  })

  test("missing case is an error", () => {
    const err = new NotFound({ id: "1" }) as NotFound | Forbidden
    // @ts-expect-error Forbidden is not handled
    match(err, { NotFound: () => 1 })
  })

  test("stray key is an error", () => {
    const err = new NotFound({ id: "1" }) as NotFound | Forbidden
    match(err, {
      NotFound: () => 1,
      Forbidden: () => 2,
      // @ts-expect-error Timeout is not a member of the union
      Timeout: () => 3,
    })
  })

  test("_ is required with untagged members and forbidden without", () => {
    const mixed = new NotFound({ id: "1" }) as NotFound | Error
    // @ts-expect-error _ is required because Error is untagged
    match(mixed, { NotFound: () => 1 })
    match(mixed, {
      NotFound: () => 1,
      _: (e) => {
        expectTypeOf(e).toEqualTypeOf<Error>()
        return 2
      },
    })
    const tagged = new NotFound({ id: "1" }) as NotFound
    // @ts-expect-error _ is not allowed when every member is tagged
    match(tagged, { NotFound: () => 1, _: () => 2 })
  })
})

describe("TaggedError typing", () => {
  test("instance shape", () => {
    const err = new NotFound({ id: "1" })
    expectTypeOf(err.name).toEqualTypeOf<"NotFound">()
    expectTypeOf(err.id).toEqualTypeOf<string>()
    expectTypeOf(err).toExtend<Error>()
    expectTypeOf(NotFound.tag).toEqualTypeOf<"NotFound">()
  })

  test("static is narrows to the subclass", () => {
    const value: unknown = null
    if (NotFound.is(value)) expectTypeOf(value).toEqualTypeOf<NotFound>()
  })

  test("props are required unless all optional", () => {
    // @ts-expect-error id is required
    new NotFound()
    class Optional extends TaggedError("Optional")<{ hint?: string }> {}
    new Optional()
    class Empty extends TaggedError("Empty") {}
    new Empty()
  })

  test("instantiation expression value form", () => {
    const Timeout = TaggedError("Timeout")<{ ms: number }>
    type Timeout = InstanceType<typeof Timeout>
    const t: Timeout = new Timeout({ ms: 1 })
    expectTypeOf(t.ms).toEqualTypeOf<number>()
    expectTypeOf(t.name).toEqualTypeOf<"Timeout">()
  })
})
