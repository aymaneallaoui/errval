import { attempt, fail, ok, match, TaggedError } from "errnil"

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class DbError extends TaggedError("DbError")<{ cause: Error }> {}

async function getUser(id: string) {
  const [err, row] = await attempt(() => db.query(sql, [id]), DbError)
  if (err) return fail(err)
  if (!row) return fail(new NotFound({ id }))
  return ok(toUser(row))
}
// (id: string) => Promise<Fail<DbError> | Fail<NotFound> | Ok<User>>

const [err, user] = await getUser("42")
if (err) {
  return match(err, {
    NotFound: (e) => respond(404, e.id),
    DbError:  (e) => respond(500, e.message),
  })
}
user.email // User, narrowed
