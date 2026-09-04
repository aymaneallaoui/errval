// lift() turns a throwing API into a Result-returning one; all() joins results.
// Run: bun run examples/04-lift-and-all.ts
import { all, lift, must, valueOr } from "../src/index.ts"

const parseJson = lift(JSON.parse)
const parseUrl = lift((s: string) => new URL(s))

// Check err before you take the tuple apart: nested destructuring skips the narrowing step.
const [err, values] = all([parseJson('{"retries": 3}'), parseUrl("https://example.com/api")])
if (err) {
  console.error("startup failed:", err.message)
  process.exit(1)
}
const [config, endpoint] = values
console.log(config.retries, endpoint.hostname)

// valueOr for defaults, must for "this cannot fail or the program is wrong"
const port = valueOr(parseJson(process.env.PORT ?? "nope"), 3000)
const version = must(parseJson('"1.2.3"'))
console.log(port, version)

const [bad] = parseUrl("not a url")
console.log(bad?.name, bad?.message)
