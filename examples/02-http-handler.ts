// A request handler with a repo, a service and an HTTP layer, no throw between them.
// Run: bun run examples/02-http-handler.ts
import { attempt, fail, match, ok, TaggedError, wrap } from "../src/index.ts"

class DbError extends TaggedError("DbError")<{ cause: Error }> {}
class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Forbidden extends TaggedError("Forbidden")<{ reason: string }> {}

type Row = { id: string; owner: string; title: string }

// A fake driver that throws like real drivers do.
const db = {
  async query(id: string): Promise<Row | undefined> {
    if (id === "boom") throw new Error("connection reset by peer")
    if (id === "404") return undefined
    return { id, owner: id === "7" ? "alice" : "bob", title: `Document ${id}` }
  },
}

// repo: the only place that touches the throw world
async function findDocument(id: string) {
  const [err, row] = await attempt(() => db.query(id), DbError)
  if (err) return fail(err)
  if (!row) return fail(new NotFound({ id }))
  return ok(row)
}

// service: adds a rule and one line of context
async function readDocument(id: string, user: string) {
  const [err, doc] = await findDocument(id)
  if (err) return fail(wrap(err, "readDocument"))
  if (doc.owner !== user) return fail(new Forbidden({ reason: `owned by ${doc.owner}` }))
  return ok(doc)
}

// http: the union is DbError | NotFound | Forbidden and match() must cover all three
async function handle(id: string, user: string): Promise<Response> {
  const [err, doc] = await readDocument(id, user)
  if (err) {
    return match(err, {
      NotFound: (e) => Response.json({ error: `no document ${e.id}` }, { status: 404 }),
      Forbidden: (e) => Response.json({ error: e.reason }, { status: 403 }),
      DbError: (e) => {
        console.error(e.message, e.cause.message)
        return Response.json({ error: "try again later" }, { status: 503 })
      },
    })
  }
  return Response.json(doc)
}

for (const [id, user] of [
  ["7", "alice"],
  ["7", "bob"],
  ["404", "bob"],
  ["boom", "bob"],
] as const) {
  const res = await handle(id, user)
  console.log(id, user, res.status, await res.text())
}
