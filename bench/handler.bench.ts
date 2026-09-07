import * as sb from "@superbuilders/errors"
import { Data, Effect } from "effect"
import { bench, do_not_optimize, group, summary } from "mitata"
import { err as nerr, ok as nok, Result } from "neverthrow"
import { attempt, fail, match, ok } from "../src/index.ts"
import {
  type Input,
  Invalid,
  InvalidError,
  makeBodies,
  NotFound,
  NotFoundError,
  Parse,
  RATES,
  rotate,
  USERS,
  type User,
} from "./shared.ts"

// One simulated request: parse the body, validate it, look the user up, shape a response.
// Every library does the same four steps with its own idioms; the response is a status code.

function respond(status: number, _body: unknown): number {
  return status
}

// errnil
function errnilHandler(body: string): number {
  const [perr, input] = attempt(() => JSON.parse(body) as Input, Parse)
  if (perr) return respond(400, perr.message)
  if (input.age < 0) return respond(422, new Invalid({ field: "age" }).message)
  const user = USERS.get(input.id)
  const [err, found] = user ? ok(user) : fail(new NotFound({ id: input.id }))
  if (err) {
    return match(err, {
      NotFound: (e) => respond(404, e.id),
    })
  }
  return respond(200, found.name)
}

// throw / catch with Error subclasses
function throwParse(body: string): Input {
  return JSON.parse(body) as Input
}
function throwLookup(input: Input): User {
  if (input.age < 0) throw new InvalidError("age")
  const user = USERS.get(input.id)
  if (!user) throw new NotFoundError(input.id)
  return user
}
function throwHandler(body: string): number {
  try {
    const user = throwLookup(throwParse(body))
    return respond(200, user.name)
  } catch (e) {
    if (e instanceof NotFoundError) return respond(404, e.id)
    if (e instanceof InvalidError) return respond(422, e.message)
    return respond(400, (e as Error).message)
  }
}

// neverthrow
const safeParse = Result.fromThrowable(
  (body: string) => JSON.parse(body) as Input,
  (e) => ({ kind: "parse" as const, cause: e as Error }),
)
function neverthrowHandler(body: string): number {
  return safeParse(body)
    .andThen((input) =>
      input.age < 0 ? nerr({ kind: "invalid" as const, field: "age" }) : nok(input),
    )
    .andThen((input) => {
      const user = USERS.get(input.id)
      return user ? nok(user) : nerr({ kind: "notfound" as const, id: input.id })
    })
    .match(
      (user) => respond(200, user.name),
      (e) => {
        switch (e.kind) {
          case "parse":
            return respond(400, e.cause.message)
          case "invalid":
            return respond(422, e.field)
          case "notfound":
            return respond(404, e.id)
        }
      },
    )
}

// effect
class EParse extends Data.TaggedError("Parse")<{ readonly cause: unknown }> {}
class EInvalid extends Data.TaggedError("Invalid")<{ readonly field: string }> {}
class ENotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}
function effectHandler(body: string): number {
  const program = Effect.try({
    try: () => JSON.parse(body) as Input,
    catch: (cause) => new EParse({ cause }),
  }).pipe(
    Effect.flatMap((input) =>
      input.age < 0 ? Effect.fail(new EInvalid({ field: "age" })) : Effect.succeed(input),
    ),
    Effect.flatMap((input) => {
      const user = USERS.get(input.id)
      return user ? Effect.succeed(user) : Effect.fail(new ENotFound({ id: input.id }))
    }),
    Effect.map((user) => respond(200, user.name)),
    Effect.catchTags({
      Parse: (e) => Effect.succeed(respond(400, String(e.cause))),
      Invalid: (e) => Effect.succeed(respond(422, e.field)),
      NotFound: (e) => Effect.succeed(respond(404, e.id)),
    }),
  )
  return Effect.runSync(program)
}

// @superbuilders/errors: Go doctrine, throw-first, opaque Error
const ErrInvalid = sb.new("invalid age")
class SbNotFound extends Error {
  readonly id: string
  constructor(id: string) {
    super(`user ${id} not found`)
    this.id = id
  }
}
function sbHandler(body: string): number {
  const parsed = sb.trySync(() => JSON.parse(body) as Input)
  if (parsed.error) return respond(400, sb.wrap(parsed.error, "body parse").message)
  const input = parsed.data
  const looked = sb.trySync(() => {
    if (input.age < 0) throw sb.wrap(ErrInvalid, "validate")
    const user = USERS.get(input.id)
    if (!user) throw new SbNotFound(input.id)
    return user
  })
  if (looked.error) {
    if (sb.is(looked.error, ErrInvalid)) return respond(422, looked.error.message)
    const nf = sb.as(looked.error, SbNotFound)
    if (nf) return respond(404, nf.id)
    return respond(500, looked.error.message)
  }
  return respond(200, looked.data.name)
}

for (const rate of RATES) {
  const bodies = makeBodies(1000, rate.miss, rate.invalid)
  group(`request handler, ${rate.label}`, () => {
    summary(() => {
      const next = rotate(bodies)
      bench("errnil", () => do_not_optimize(errnilHandler(next()))).baseline(true)
      const next2 = rotate(bodies)
      bench("throw/catch", () => do_not_optimize(throwHandler(next2())))
      const next3 = rotate(bodies)
      bench("neverthrow", () => do_not_optimize(neverthrowHandler(next3())))
      const next4 = rotate(bodies)
      bench("effect (runSync)", () => do_not_optimize(effectHandler(next4())))
      const next5 = rotate(bodies)
      bench("@superbuilders/errors", () => do_not_optimize(sbHandler(next5())))
    })
  })
}
