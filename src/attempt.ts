import { TaggedError } from "./error.ts"
import type { AsyncResult, ErrorMapper, Result, TaggedErrorClass } from "./types.ts"

const ThrownBase: TaggedErrorClass<"Thrown"> = TaggedError("Thrown")

/**
 * The error `attempt` produces when something other than an `Error` was
 * thrown. The original value is kept in `value`.
 */
export class Thrown extends ThrownBase<{ readonly value: unknown }> {
  override get message(): string {
    return `non-Error value thrown: ${describe(this.value)}`
  }
}

function describe(value: unknown): string {
  try {
    return typeof value === "string" ? value : String(value)
  } catch {
    return typeof value
  }
}

function isErrorClass(mapper: Function): boolean {
  const proto = (mapper as { prototype?: unknown }).prototype
  return typeof proto === "object" && proto !== null && proto instanceof Error
}

function normalize(thrown: unknown, mapper?: ErrorMapper<object>): object {
  const error = thrown instanceof Error ? thrown : new Thrown({ value: thrown })
  if (mapper === undefined) return error
  if (isErrorClass(mapper))
    return new (mapper as new (props: { cause: Error }) => object)({ cause: error })
  return (mapper as (error: Error) => object)(error)
}

async function settle(
  promise: PromiseLike<unknown>,
  mapper?: ErrorMapper<object>,
): Promise<Result<unknown, object>> {
  try {
    return [undefined, await promise]
  } catch (thrown) {
    return [normalize(thrown, mapper), undefined]
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  )
}

/**
 * The door from the throw world into the value world. Runs a function or
 * awaits a promise and turns anything thrown into a failed result. Non-Error
 * throws become `Thrown`. A second argument maps the error: a function, or a
 * TaggedError class constructed with `{ cause }`.
 *
 * @example
 * const [err, json] = attempt(() => JSON.parse(text))
 * const [err, res] = await attempt(fetch(url))
 * const [err, rows] = await attempt(() => db.query(sql), DbError)
 */
export function attempt(fn: () => never): Result<never, Error>
export function attempt<T>(fn: () => Promise<T>): AsyncResult<T, Error>
export function attempt<T>(promise: PromiseLike<T>): AsyncResult<T, Error>
export function attempt<T>(fn: () => T): Result<T, Error>
export function attempt<E extends object>(
  fn: () => never,
  onError: ErrorMapper<E>,
): Result<never, E>
export function attempt<T, E extends object>(
  fn: () => Promise<T>,
  onError: ErrorMapper<E>,
): AsyncResult<T, E>
export function attempt<T, E extends object>(
  promise: PromiseLike<T>,
  onError: ErrorMapper<E>,
): AsyncResult<T, E>
export function attempt<T, E extends object>(fn: () => T, onError: ErrorMapper<E>): Result<T, E>
export function attempt(
  input: (() => unknown) | PromiseLike<unknown>,
  onError?: ErrorMapper<object>,
): Result<unknown, object> | Promise<Result<unknown, object>> {
  if (typeof input !== "function") return settle(input, onError)
  let value: unknown
  try {
    value = input()
  } catch (thrown) {
    return [normalize(thrown, onError), undefined]
  }
  if (isPromiseLike(value)) return settle(value, onError)
  return [undefined, value]
}

/**
 * Turn a throwing function into one that returns results, once.
 *
 * @example
 * const parseJson = lift(JSON.parse)
 * const [err, data] = parseJson(text)
 */
export function lift<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
): (...args: A) => AsyncResult<T, Error>
export function lift<A extends unknown[], T>(
  fn: (...args: A) => T,
): (...args: A) => Result<T, Error>
export function lift(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
  return (...args) => attempt(() => fn(...args))
}
