import type {
  HandlerResult,
  Handlers,
  StrictHandlers,
  TaggedErrorBase,
  TaggedErrorClass,
  TaggedErrorOptions,
} from "./types.ts"

const BRAND: symbol = Symbol.for("errnil.tagged")

type ErrorWithStack = {
  captureStackTrace?: (target: object, ctor?: Function) => void
  stackTraceLimit?: number
}
const ErrorHost = Error as ErrorConstructor & ErrorWithStack

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

  static parse(
    this: (new (props?: object) => object) & { tag?: string },
    value: unknown,
  ): object | undefined {
    if (value instanceof this) return value
    if (typeof value !== "object" || value === null) return undefined
    if ((value as { name?: unknown }).name !== this.tag) return undefined
    const props: Record<string, unknown> = {}
    const source = value as Record<string, unknown>
    for (const key in source) if (key !== "name") props[key] = source[key]
    return new this(props)
  }
}

Object.setPrototypeOf(TaggedBase.prototype, Error.prototype)
Object.defineProperty(TaggedBase.prototype, BRAND, { value: true })
Object.defineProperty(TaggedBase, BRAND, { value: true })

type BunGlobal = { inspect: (value: unknown, options?: unknown) => string }
const bun = (globalThis as { Bun?: BunGlobal }).Bun

// Bun's console.log only formats objects with the native error slot as errors. Node
// already recognises `instanceof Error`, so the hook is installed on Bun alone.
if (bun !== undefined) {
  Object.defineProperty(TaggedBase.prototype, Symbol.for("nodejs.util.inspect.custom"), {
    value: function inspectTagged(this: Record<string, unknown>, _depth: number, options: unknown) {
      const name = this.name as string
      const message = this.message as string
      const head = message === name || message === "" ? name : `${name}: ${message}`
      const props: Record<string, unknown> = {}
      let count = 0
      for (const key of Object.keys(this)) {
        if (key !== "cause" && key !== "message" && key !== "stack") {
          props[key] = this[key]
          count++
        }
      }
      let out = `[${head}]${count > 0 ? ` ${bun.inspect(props, options)}` : ""}`
      const cause = this.cause
      if (cause !== undefined) {
        const inner =
          cause instanceof Error ? `[${cause.name}: ${cause.message}]` : bun.inspect(cause, options)
        out += ` { [cause]: ${inner} }`
      }
      return typeof this.stack === "string" && this.stack.includes("\n")
        ? `${out}\n${this.stack}`
        : out
    },
    writable: true,
    configurable: true,
  })
}

function fastClass(withStack: boolean): typeof TaggedBase {
  if (!withStack) return class extends TaggedBase {}
  const Class = class extends TaggedBase {
    constructor(props?: object) {
      super(props)
      captureStack(this, Class)
    }
  }
  return Class
}

// Extends Error so instances get the native error slot; the prototype is re-parented onto
// TaggedBase afterwards, and statics are copied because super() must keep calling Error.
function nativeClass(withStack: boolean): typeof TaggedBase {
  const Class = class extends Error {
    constructor(props?: object) {
      const limit = ErrorHost.stackTraceLimit
      if (!withStack) ErrorHost.stackTraceLimit = 0
      super()
      if (!withStack && limit !== undefined) ErrorHost.stackTraceLimit = limit
      if (props !== undefined) {
        const self = this as unknown as Record<string, unknown>
        const source = props as Record<string, unknown>
        for (const key in source) self[key] = source[key]
      }
    }
  }
  Object.setPrototypeOf(Class.prototype, TaggedBase.prototype)
  Object.defineProperty(Class, "is", { value: TaggedBase.is, configurable: true })
  Object.defineProperty(Class, "parse", { value: TaggedBase.parse, configurable: true })
  Object.defineProperty(Class, BRAND, { value: true })
  return Class as unknown as typeof TaggedBase
}

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
  const Class = options?.native === true ? nativeClass(withStack) : fastClass(withStack)
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
  for (const key in source) {
    if (key !== "message" && key !== "cause") out[key] = source[key]
  }
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

const MAX_DEPTH = 256

function walk(error: unknown, visit: Visitor, depth: number): object | undefined {
  if (typeof error !== "object" || error === null || depth > MAX_DEPTH) return undefined
  if (visit(error)) return error
  const found = walk((error as { cause?: unknown }).cause, visit, depth + 1)
  if (found !== undefined) return found
  const nested = (error as { errors?: unknown }).errors
  if (Array.isArray(nested)) {
    for (let i = 0; i < nested.length; i++) {
      const hit = walk(nested[i], visit, depth + 1)
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
  return walk(error, matcherFor(target), 0) !== undefined
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
  return walk(error, matcherFor(target), 0) as InstanceType<C> | undefined
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
