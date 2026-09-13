class Timeout extends TaggedError("Timeout")<{ ms: number }> {
  get message() { return `timed out after ${this.ms}ms` }
}

const err = wrap(wrap(new Timeout({ ms: 300 }), "fetchProfile"), "GET /me")

String(err)          // "Timeout: GET /me: fetchProfile: timed out after 300ms"
is(err, Timeout)     // true, walks the cause chain
as(err, Timeout)?.ms // 300
err instanceof Error // true, and no stack was captured to get here
