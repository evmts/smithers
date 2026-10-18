import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { StoragePersistence } from "../src/index.ts"

describe("StoragePersistence", () => {
  it.effect("answers whether the browser granted persistent storage", () =>
    Effect.gen(function*() {
      expect(yield* StoragePersistence.make({ persist: () => Promise.resolve(true) }).persist).toBe(true)
      expect(yield* StoragePersistence.make({ persist: () => Promise.resolve(false) }).persist).toBe(false)
    }))

  it.effect("answers no where the API is missing or the browser refuses to answer", () =>
    Effect.gen(function*() {
      expect(yield* StoragePersistence.make(undefined).persist).toBe(false)
      expect(yield* StoragePersistence.make({}).persist).toBe(false)
      const refusing = StoragePersistence.make({
        persist: () => Promise.reject(new DOMException("no", "SecurityError"))
      })
      expect(yield* refusing.persist).toBe(false)
    }))

  it.effect("reads navigator.storage, which Node does not have", () =>
    Effect.gen(function*() {
      expect(yield* (yield* StoragePersistence.StoragePersistence).persist).toBe(false)
    }).pipe(Effect.provide(StoragePersistence.layer)))
})
