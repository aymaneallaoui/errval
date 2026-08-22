import type {
  HandlerResult,
  Handlers,
  StrictHandlers,
  TaggedErrorBase,
  TaggedErrorClass,
  TaggedErrorOptions,
} from "./types.ts"

const BRAND: symbol = Symbol.for("errnil.tagged")

type ErrorWithStack = { captureStackTrace?: (target: object, ctor?: Function) => void }

export function captureStack(target: object, ctor?: Function): void {
  const capture = (Error as ErrorWithStack).captureStackTrace
  if (typeof capture === "function") capture(target, ctor)
}

export function isTagged(value: unknown): value is TaggedErrorBase<string> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  )
}

function isTaggedClass(value: unknown): value is TaggedErrorClass<string> {
  return (
    typeof value === "function" && (value as unknown as Record<symbol, unknown>)[BRAND] === true
  )
}

function messageOf(error: object): string {
  const message = (error as { message?: unknown }).message
  return typeof message === "string" ? message : String(error)
}

function nameOf(error: object): string {
  const name = (error as { name?: unknown }).name
  return typeof name === "string" ? name : "Error"
}

function serializeCause(cause: unknown): unknown {
  if (cause instanceof Error && typeof (cause as { toJSON?: unknown }).toJSON !== "function") {
    return { name: cause.name, message: cause.message }
  }
  return cause
}

class TaggedBase {
  constructor(props?: object) {
    if (props !== undefined) {
      const self = this as unknown as Record<string, unknown>
      const source = props as Record<string, unknown>
      for (const key in source) self[key] = source[key]
    }
  }

  toString(): string {
    const self = this as unknown as { name: string; message: string }
    return self.message === "" || self.message === self.name
      ? self.name
      : `${self.name}: ${self.message}`
  }

  toJSON(): Record<string, unknown> {
    const self = this as unknown as Record<string, unknown> & {
      name: string
      message: string
      cause?: unknown
    }
    const out: Record<string, unknown> = { name: self.name, message: self.message }
    for (const key of Object.keys(self)) {
      if (key !== "cause" && key !== "message") out[key] = self[key]
    }
    if (self.cause !== undefined) out.cause = serializeCause(self.cause)
    return out
  }

  static is(this: Function & { tag?: string }, value: unknown): boolean {
    if (value instanceof this) return true
    return typeof this.tag === "string" && isTagged(value) && value.name === this.tag
  }
}

Object.setPrototypeOf(TaggedBase.prototype, Error.prototype)
Object.defineProperty(TaggedBase.prototype, BRAND, { value: true })
Object.defineProperty(TaggedBase, BRAND, { value: true })

/**
 * Define an error class. The tag becomes the literal `name`, the props become
 * readonly fields, and the Error constructor is never called, so creating one
 * costs about as much as an object literal.
 *
 * @example
 * class NotFound extends TaggedError("NotFound")<{ id: string }> {}
 * class Timeout extends TaggedError("Timeout")<{ ms: number }> {
 *   get message() { return `timed out after ${this.ms}ms` }
 * }
 * const err = new NotFound({ id: "42" })
 * err instanceof Error // true
 * err.name // "NotFound"
 */
export function TaggedError<const Tag extends string>(
  tag: Tag,
  options?: TaggedErrorOptions,
): TaggedErrorClass<Tag> {
  const withStack = options?.stack === true
  const Class = withStack
    ? class extends TaggedBase {
        constructor(props?: object) {
          super(props)
          captureStack(this, Class)
        }
      }
    : class extends TaggedBase {}
  Object.defineProperty(Class, "name", { value: tag, configurable: true })
  Object.defineProperty(Class, "tag", { value: tag })
  Object.defineProperty(Class.prototype, "name", { value: tag, writable: true, configurable: true })
  Object.defineProperty(Class.prototype, "message", {
    value: tag,
    writable: true,
    configurable: true,
  })
  return Class as unknown as TaggedErrorClass<Tag>
}

/**
 * Add context to an error without changing its type. The result has the same
 * prototype and fields, a prefixed message, and the original as `cause`.
 *
 * @example
 * const [err, row] = await repo.find(id)
 * if (err) return fail(wrap(err, "getUser"))
 * // err.message === "getUser: connection refused"
 */
export function wrap<E extends object>(error: E, context: string): E {
  const out = Object.create(Object.getPrototypeOf(error)) as Record<string, unknown>
  const source = error as unknown as Record<string, unknown>
  for (const key in source) out[key] = source[key]
  const message = `${context}: ${messageOf(error)}`
  try {
    out.message = message
  } catch {
    Object.defineProperty(out, "message", { value: message, writable: true, configurable: true })
  }
  out.cause = error
  return out as unknown as E
}

type Visitor = (error: object) => boolean

function walk(error: unknown, visit: Visitor, seen: Set<object>): object | undefined {
  if (typeof error !== "object" || error === null || seen.has(error)) return undefined
  seen.add(error)
  if (visit(error)) return error
  const found = walk((error as { cause?: unknown }).cause, visit, seen)
  if (found !== undefined) return found
  const nested = (error as { errors?: unknown }).errors
  if (Array.isArray(nested)) {
    for (const inner of nested) {
      const hit = walk(inner, visit, seen)
      if (hit !== undefined) return hit
    }
  }
  return undefined
}

function matcherFor(target: object): Visitor {
  if (typeof target === "function") {
    return (error) =>
      error instanceof target ||
      (isTaggedClass(target) && isTagged(error) && error.name === target.tag)
  }
  return (error) => error === target
}

/**
 * Go's `errors.Is`: does the error, or anything in its `cause` chain, match
 * the class or the exact instance?
 *
 * @example
 * if (is(err, NotFound)) respond(404)
 */
export function is(error: unknown, target: object): boolean {
  return walk(error, matcherFor(target), new Set()) !== undefined
}

/**
 * Go's `errors.As`: the first error in the chain that is an instance of the
 * class, or undefined.
 *
 * @example
 * const notFound = as(err, NotFound)
 * if (notFound) log(notFound.id)
 */
export function as<C extends abstract new (...args: never[]) => unknown>(
  error: unknown,
  target: C,
): InstanceType<C> | undefined {
  return walk(error, matcherFor(target), new Set()) as InstanceType<C> | undefined
}

/**
 * Dispatch on the error's tag with an exhaustive handler map. A `_` handler
 * is required exactly when the union contains untagged errors.
 *
 * @example
 * return match(err, {
 *   NotFound: (e) => respond(404, e.id),
 *   DbError: (e) => respond(500, e.message),
 * })
 */
export function match<E extends object, const H extends Handlers<E>>(
  error: E,
  handlers: StrictHandlers<E, H>,
): HandlerResult<H> {
  const table = handlers as Record<string, ((error: object) => unknown) | undefined>
  const name = nameOf(error)
  const handler = isTagged(error) && Object.hasOwn(table, name) ? table[name] : table._
  if (typeof handler !== "function") {
    throw new TypeError(`errnil.match: no handler for ${name}`)
  }
  return handler(error) as HandlerResult<H>
}

const JoinedBase: TaggedErrorClass<"Joined"> = TaggedError("Joined")

/**
 * Go's `errors.Join`: one error holding many. `is` and `as` look inside.
 *
 * @example
 * const err = join(failures)
 * is(err, Timeout) // true if any failure was a Timeout
 */
export class Joined<E extends object = Error> extends JoinedBase<{
  readonly errors: readonly E[]
}> {
  override get message(): string {
    return this.errors.map((e) => messageOf(e)).join("\n")
  }
}

export function join<E extends object>(errors: readonly E[]): Joined<E> {
  return new Joined<E>({ errors })
}

export const errors: {
  readonly is: typeof is
  readonly as: typeof as
  readonly wrap: typeof wrap
  readonly join: typeof join
  readonly match: typeof match
} = { is, as, wrap, join, match }
