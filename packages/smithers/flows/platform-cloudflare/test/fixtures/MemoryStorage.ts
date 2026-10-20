/**
 * An in-memory stand-in for a Durable Object's storage: the platform API the
 * execution functions take, not a double of this package's code.
 *
 * Values cross it by structured clone, as they cross real Durable Object
 * storage. `alarm` is the one alarm an object has; setting it replaces it.
 */
import * as Effect from "effect/Effect"
import type { ExecutionObject } from "../../src/index.ts"

export interface MemoryStorage {
  readonly storage: ExecutionObject.Storage
  readonly values: Map<string, unknown>
  /** The armed alarm, or `null`. */
  readonly alarm: () => number | null
}

export const make = (): MemoryStorage => {
  const values = new Map<string, unknown>()
  let alarm: number | null = null
  return {
    values,
    alarm: () => alarm,
    storage: {
      get: <A>(key: string) => Effect.sync(() => structuredClone(values.get(key)) as A | undefined),
      put: (key, value) =>
        Effect.sync(() => {
          values.set(key, structuredClone(value))
        }),
      delete: (key) => Effect.sync(() => values.delete(key)),
      setAlarm: (scheduledTime) =>
        Effect.sync(() => {
          alarm = scheduledTime
        }),
      deleteAlarm: () =>
        Effect.sync(() => {
          alarm = null
        })
    }
  }
}
