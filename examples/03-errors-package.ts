// Go's errors package, spelled the same way: errors.is, errors.as, errors.wrap, errors.join.
// Run: bun run examples/03-errors-package.ts
import { errors, TaggedError } from "../src/index.ts"

class Timeout extends TaggedError("Timeout")<{ ms: number }> {
  override get message(): string {
    return `timed out after ${this.ms}ms`
  }
}
class Unreachable extends TaggedError("Unreachable")<{ host: string }> {}

// A sentinel, like Go's `var ErrClosed = errors.New("closed")`
const ErrClosed = new Unreachable({ host: "pool" })

const socket = new TypeError("socket hang up")
const network = new Timeout({ ms: 300, cause: socket } as { ms: number })
const layered = errors.wrap(errors.wrap(network, "fetchProfile"), "GET /me")

console.log(String(layered))
// GET /me: fetchProfile: timed out after 300ms

console.log(errors.is(layered, Timeout)) // true, walks the cause chain
console.log(errors.is(layered, TypeError)) // true, the native cause counts too
console.log(errors.is(layered, ErrClosed)) // false, identity check against the sentinel

const timeout = errors.as(layered, Timeout)
console.log(timeout?.ms) // 300

const many = errors.join([new Timeout({ ms: 1 }), ErrClosed])
console.log(errors.is(many, ErrClosed)) // true, join is searched too
console.log(JSON.stringify(many))
