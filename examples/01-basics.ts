// Run: bun run examples/01-basics.ts   (or: node examples/01-basics.ts)
import { attempt, fail, match, ok, TaggedError, wrap } from "../src/index.ts"

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Invalid extends TaggedError("Invalid")<{ field: string; reason: string }> {}

type User = { id: string; email: string; age: number }

const users = new Map<string, User>([
  ["1", { id: "1", email: "ada@example.com", age: 36 }],
  ["2", { id: "2", email: "not-an-email", age: 17 }],
])

function findUser(id: string) {
  const user = users.get(id)
  if (!user) return fail(new NotFound({ id }))
  return ok(user)
}

function validate(user: User) {
  if (!user.email.includes("@")) return fail(new Invalid({ field: "email", reason: "missing @" }))
  if (user.age < 18) return fail(new Invalid({ field: "age", reason: "under 18" }))
  return ok(user)
}

// The error union grows as you compose: NotFound | Invalid, inferred, no annotation.
function loadAdult(id: string) {
  const [err, user] = findUser(id)
  if (err) return fail(wrap(err, "loadAdult"))
  const [invalid, valid] = validate(user)
  if (invalid) return fail(wrap(invalid, "loadAdult"))
  return ok(valid)
}

for (const id of ["1", "2", "3"]) {
  const [err, user] = loadAdult(id)
  if (err) {
    const text = match(err, {
      NotFound: (e) => `no user with id ${e.id}`,
      Invalid: (e) => `${e.field} is invalid: ${e.reason}`,
    })
    console.log(`${id}: ${text}   (${err.message})`)
    continue
  }
  console.log(`${id}: ok, ${user.email}`)
}

// The boundary: anything that throws becomes a value.
const [parseErr, data] = attempt(() => JSON.parse('{"broken": ') as { broken: boolean })
console.log(parseErr ? `parse failed: ${parseErr.name}` : data.broken)
