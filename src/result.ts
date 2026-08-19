import { captureStack, isTagged } from "./error.ts"
import type { ErrorOf, Fail, Ok, OkTuple, Result } from "./types.ts"

const OK_VOID: Ok<void> = Object.freeze([undefined, undefined]) as unknown as Ok<void>

/**
 * Wrap a value in a successful result.
 *
 * @example
 * function parse(s: string) {
 *   if (!s) return fail(new Empty({}))
 *   return ok(s.trim())
 * }
 */
export function ok(): Ok<void>
export function ok<T>(value: T): Ok<T>
export function ok<T>(value?: T): Ok<T> {
  // biome-ignore lint/complexity/noArguments: rest parameters allocate on the hot path
  return arguments.length === 0 ? (OK_VOID as unknown as Ok<T>) : [undefined, value as T]
}

/**
 * Wrap an error in a failed result. The error must be an object so that
 * `if (err)` is always a sound check.
 *
 * @example
 * const [err, user] = await getUser(id)
 * if (err) return fail(err)
 */
export function fail<E extends object>(error: E): Fail<E> {
  return [error, undefined]
}

/**
 * Unwrap a result or throw its error. This is the Go `panic`: use it at the
 * top of scripts and tests, not in library code.
 *
 * @example
 * const config = must(loadConfig())
 */
export function must<T>(result: Result<T, object>): T {
  const err = result[0]
  if (err !== undefined) {
    if (isTagged(err) && !Object.hasOwn(err, "stack")) captureStack(err, must)
    throw err
  }
  return result[1] as T
}

/**
 * Unwrap a result or fall back. A function fallback receives the error.
 *
 * @example
 * const port = valueOr(readPort(), 3000)
 * const name = valueOr(lookup(id), (err) => `unknown (${err.message})`)
 */
export function valueOr<T, U>(
  result: Result<T, object>,
  fallback: U | ((error: object) => U),
): T | U {
  const err = result[0]
  if (err === undefined) return result[1] as T
  return typeof fallback === "function" ? (fallback as (error: object) => U)(err) : fallback
}

/**
 * Combine results: the first failure, or a tuple of every value.
 *
 * @example
 * const [err, [user, posts]] = all([await getUser(id), await getPosts(id)])
 */
export function all<const R extends readonly Result<unknown, object>[]>(
  results: R,
): Result<OkTuple<R>, ErrorOf<R[number]>> {
  const values = new Array(results.length)
  for (let i = 0; i < results.length; i++) {
    const r = results[i] as Result<unknown, object>
    if (r[0] !== undefined) return [r[0] as ErrorOf<R[number]>, undefined]
    values[i] = r[1]
  }
  return [undefined, values as OkTuple<R>]
}
