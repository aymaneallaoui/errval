import { TaggedError } from "../src/index.ts"

export class NotFound extends TaggedError("NotFound")<{ readonly id: string }> {}
export class Invalid extends TaggedError("Invalid")<{ readonly field: string }> {}
export class Parse extends TaggedError("Parse")<{ readonly cause: Error }> {}

export class NotFoundError extends Error {
  readonly id: string
  constructor(id: string) {
    super(`user ${id} not found`)
    this.name = "NotFoundError"
    this.id = id
  }
}
export class InvalidError extends Error {
  readonly field: string
  constructor(field: string) {
    super(`invalid ${field}`)
    this.name = "InvalidError"
    this.field = field
  }
}

export type User = { id: string; age: number; name: string }

export const USERS: Map<string, User> = new Map()
for (let i = 0; i < 1000; i++) {
  USERS.set(`u${i}`, { id: `u${i}`, age: 18 + (i % 60), name: `user ${i}` })
}

export type Input = { id: string; age: number }

export function makeBodies(count: number, missRate: number, invalidRate: number): string[] {
  const bodies: string[] = []
  for (let i = 0; i < count; i++) {
    const roll = i / count
    const id = roll < missRate ? `missing${i}` : `u${i % 1000}`
    const age = roll >= missRate && roll < missRate + invalidRate ? -1 : 30
    bodies.push(JSON.stringify({ id, age }))
  }
  return bodies
}

export function rotate<T>(items: readonly T[]): () => T {
  let i = 0
  return () => {
    const item = items[i] as T
    i = i + 1 === items.length ? 0 : i + 1
    return item
  }
}

export const RATES: ReadonlyArray<{
  readonly label: string
  readonly miss: number
  readonly invalid: number
}> = [
  { label: "0% failures", miss: 0, invalid: 0 },
  { label: "10% failures", miss: 0.05, invalid: 0.05 },
  { label: "50% failures", miss: 0.25, invalid: 0.25 },
]
