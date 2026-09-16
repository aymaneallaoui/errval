// Consumer-side check: the published declarations must work on the oldest supported
// TypeScript (5.5). Compiled with `bun run typecheck:floor`; never imported by the library.
import {
  all,
  attempt,
  fail,
  is,
  match,
  ok,
  TaggedError,
  type TaggedErrorClass,
  type Result,
  wrap,
} from "../dist/index.js"

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Forbidden extends TaggedError("Forbidden")<{ reason: string }> {}
class DbError extends TaggedError("DbError")<{ cause: Error }> {}
const Base: TaggedErrorClass<"Timeout"> = TaggedError("Timeout")
export class Timeout extends Base<{ ms: number }> {}

type User = { id: string }

export async function getUser(id: string) {
  const [err, row] = await attempt(() => Promise.resolve({ id }), DbError)
  if (err) return fail(err)
  if (id === "0") return fail(new NotFound({ id }))
  if (id === "1") return fail(new Forbidden({ reason: "banned" }))
  return ok<User>(row)
}

export async function handler(id: string): Promise<number> {
  const [err, user] = await getUser(id)
  if (err) {
    return match(wrap(err, "handler"), {
      NotFound: (e) => e.id.length + 404,
      Forbidden: (e) => e.reason.length + 403,
      DbError: (e) => e.cause.message.length + 500,
    })
  }
  return user.id.length
}

const combined: Result<[number, string], NotFound> = all([ok(1), ok("x")]) as Result<
  [number, string],
  NotFound
>
export const flag: boolean = is(combined[0], NotFound) || new Timeout({ ms: 1 }).ms > 0
