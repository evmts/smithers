import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Scope from "effect/Scope"
import { WebLock } from "../src/index.ts"

const name = () => `web-lock-${crypto.randomUUID()}`

/** Holds `lock` in a fresh scope and returns it, so a case can release it. */
const hold = (lock: WebLock.Service, lockName: string, options?: WebLock.HoldOptions) =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    const held = yield* lock.hold(lockName, options).pipe(Scope.provide(scope))
    return Object.assign(scope, { held })
  })

/** Who holds `lockName` now, and who waits for it, by client id. */
const holders = (lockName: string) =>
  Effect.promise(() => navigator.locks.query()).pipe(
    Effect.map((state) => ({
      held: (state.held ?? []).filter((info) => info.name === lockName).length,
      pending: (state.pending ?? []).filter((info) => info.name === lockName).length
    }))
  )

describe("WebLock over navigator.locks", () => {
  it.live("grants the lock to one holder at a time, and to the next when the holder lets go", () =>
    Effect.gen(function*() {
      const lock = yield* WebLock.WebLock
      const lockName = name()
      const first = yield* hold(lock, lockName)
      const second = yield* Effect.forkChild(hold(lock, lockName))
      yield* Effect.sleep("50 millis")
      expect(second.pollUnsafe()).toBeUndefined()
      yield* Scope.close(first, Exit.void)
      yield* Scope.close(yield* Fiber.join(second), Exit.void)
    }).pipe(Effect.provide(WebLock.layer)))

  it.live("withdraws an interrupted wait, so it never takes the lock", () =>
    Effect.gen(function*() {
      const lock = yield* WebLock.WebLock
      const lockName = name()
      const first = yield* hold(lock, lockName)
      const waiting = yield* Effect.forkChild(hold(lock, lockName))
      yield* Effect.sleep("20 millis")
      yield* Fiber.interrupt(waiting)
      yield* Scope.close(first, Exit.void)
      yield* Effect.sleep("20 millis")
      const state = yield* Effect.promise(() => navigator.locks.query())
      expect([...(state.held ?? []), ...(state.pending ?? [])].some((info) => info.name === lockName)).toBe(false)
    }).pipe(Effect.provide(WebLock.layer)))

  it.effect("dies when the lock manager refuses the request", () =>
    Effect.gen(function*() {
      const refusing = WebLock.make({
        request: () => Promise.reject(new DOMException("reserved", "NotSupportedError"))
      })
      const exit = yield* refusing.hold("-reserved").pipe(Effect.scoped, Effect.exit)
      expect(Exit.isFailure(exit) && Exit.hasDies(exit)).toBe(true)
    }))

  it.effect("gives back a lock granted in the moment its wait was interrupted", () =>
    Effect.gen(function*() {
      let grant: (() => Promise<void>) | undefined
      const late = WebLock.make({
        request: (_name, options, callback) =>
          new Promise((resolve) => {
            ;(options as { readonly signal: AbortSignal }).signal.addEventListener("abort", () => {
              grant = () => callback(undefined).then(resolve)
            })
          })
      })
      const waiting = yield* Effect.forkChild(late.hold("late").pipe(Effect.scoped))
      yield* Effect.yieldNow
      yield* Fiber.interrupt(waiting)
      // The lock manager grants the withdrawn request anyway; the grant ends at once.
      yield* Effect.promise(() => grant!())
    }))

  it.live("steals a held lock at once; the holder learns it lost the lock and keeps no claim", () =>
    Effect.gen(function*() {
      const lock = yield* WebLock.WebLock
      const lockName = name()
      const first = yield* hold(lock, lockName)
      const lost = yield* Effect.forkChild(first.held.lost)
      const second = yield* hold(lock, lockName, { steal: true })
      yield* Fiber.join(lost)
      expect(yield* holders(lockName)).toEqual({ held: 1, pending: 0 })
      // Closing the robbed holder's scope gives back nothing it still holds.
      yield* Scope.close(first, Exit.void)
      expect(yield* holders(lockName)).toEqual({ held: 1, pending: 0 })
      const third = yield* Effect.forkChild(hold(lock, lockName))
      yield* Effect.sleep("20 millis")
      expect(third.pollUnsafe()).toBeUndefined()
      yield* Scope.close(second, Exit.void)
      yield* Scope.close(yield* Fiber.join(third), Exit.void)
    }).pipe(Effect.provide(WebLock.layer)))

  it.live("steals a lock nobody holds, and a lock held to the end is never lost", () =>
    Effect.gen(function*() {
      const lock = yield* WebLock.WebLock
      const lockName = name()
      const stolen = yield* hold(lock, lockName, { steal: true })
      expect(yield* holders(lockName)).toEqual({ held: 1, pending: 0 })
      const lost = yield* Effect.forkChild(stolen.held.lost)
      yield* Scope.close(stolen, Exit.void)
      yield* Effect.sleep("20 millis")
      expect(lost.pollUnsafe()).toBeUndefined()
      expect(yield* holders(lockName)).toEqual({ held: 0, pending: 0 })
    }).pipe(Effect.provide(WebLock.layer)))

  it.effect("asks a steal without a signal, which the lock manager refuses alongside one", () =>
    Effect.gen(function*() {
      const asked: Array<unknown> = []
      const recording = WebLock.make({
        request: (_name, options, callback) => {
          asked.push(options)
          return callback(undefined)
        }
      })
      yield* recording.hold("asked", { steal: true }).pipe(Effect.scoped)
      yield* recording.hold("asked").pipe(Effect.scoped)
      expect(asked[0]).toEqual({ steal: true })
      expect(asked[1]).toEqual({ signal: expect.any(AbortSignal) })
    }))
})
