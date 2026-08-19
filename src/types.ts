export type Ok<T> = readonly [err: undefined, value: T]

export type Fail<E extends object> = readonly [err: E, value: undefined]

export type Result<T, E extends object = Error> = Ok<T> | Fail<E>

export type AsyncResult<T, E extends object = Error> = Promise<Result<T, E>>

export type ErrorOf<R> = R extends (...args: never[]) => infer U
  ? ErrorOf<U>
  : R extends Promise<infer U>
    ? ErrorOf<U>
    : R extends readonly [infer E extends object, undefined]
      ? E
      : never

export type OkOf<R> = R extends (...args: never[]) => infer U
  ? OkOf<U>
  : R extends Promise<infer U>
    ? OkOf<U>
    : R extends readonly [undefined, infer T]
      ? T
      : never

export type OkTuple<R extends readonly Result<unknown, object>[]> = {
  -readonly [K in keyof R]: OkOf<R[K]>
}

declare const TAG: unique symbol

export interface Tagged {
  readonly name: string
  readonly [TAG]: true
}

export interface TaggedErrorBase<Tag extends string> extends Error {
  readonly name: Tag
  readonly [TAG]: true
  toJSON(): Record<string, unknown>
}

export type TaggedErrorInstance<Tag extends string, Props extends object> = TaggedErrorBase<Tag> &
  Readonly<Props>

export type ConstructorArgs<Props extends object> = {} extends Props
  ? [props?: Props]
  : [props: Props]

export interface TaggedErrorClass<Tag extends string> {
  new <Props extends object = {}>(...args: ConstructorArgs<Props>): TaggedErrorInstance<Tag, Props>
  readonly tag: Tag
  readonly prototype: TaggedErrorBase<Tag>
  is<C extends abstract new (...args: never[]) => unknown>(
    this: C,
    value: unknown,
  ): value is InstanceType<C>
}

export interface TaggedErrorOptions {
  readonly stack?: boolean
}

export type ErrorMapper<E extends object> =
  | ((error: Error) => E)
  | (new (props: {
      cause: Error
    }) => E)

export type Untagged<E> = Exclude<E, Tagged>

export type TaggedNames<E> = Extract<E, Tagged>["name"]

export type Handlers<E extends object> = {
  [K in TaggedNames<E>]: (error: Extract<E, { readonly name: K }>) => unknown
} & ([Untagged<E>] extends [never]
  ? { readonly _?: never }
  : { readonly _: (error: Untagged<E>) => unknown })

export type StrictHandlers<E extends object, H> = H &
  Record<Exclude<keyof H, keyof Handlers<E>>, never>

export type HandlerResult<H> = ReturnType<Extract<H[keyof H], (...args: never[]) => unknown>>

export type Prettify<T> = { [K in keyof T]: T[K] } & {}
