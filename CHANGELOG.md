# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[SemVer](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-09-20

### Changed

- README code images are PNG instead of SVG (each SVG embedded a 350 kB font).
- First release published through GitHub Actions with npm trusted publishing
  and provenance.

## [0.1.0] - 2026-09-16

First release.

### Added

- `Result<T, E>` as a readonly `[err, value]` tuple, with `ok`, `fail`,
  `must`, `valueOr` and `all`.
- `attempt` for the throw-to-value boundary, sync and async, with an optional
  error mapper (function or class). `lift` for turning a throwing function
  into a Result-returning one.
- `TaggedError(tag)` classes: literal `name`, typed props, `instanceof Error`
  without calling the `Error` constructor, opt-in stack capture.
- `wrap`, `is`, `as`, `match`, `join`, and an `errors` namespace object that
  reads like Go's `errors` package.
- `Thrown` for non-Error throws and `Joined` for `join`.
- `native: true` option on `TaggedError` for the rare consumer that needs
  `Error.isError` to say yes, and a Bun-only `console.log` formatter.
- `Class.parse(value)` on every TaggedError class to revive errors after
  `JSON.parse` or `structuredClone`.
- Type utilities `ErrorOf`, `OkOf`, `Handlers`, `HandlerResult`.
- Type instantiation ceilings for `match`, `attempt`, `all` and `wrap`,
  enforced with `@ark/attest`.
- Benchmarks against throw/catch, neverthrow, effect and
  `@superbuilders/errors` on Bun and Node.

[Unreleased]: https://github.com/aymaneallaoui/errval/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/aymaneallaoui/errval/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/aymaneallaoui/errval/releases/tag/v0.1.0
