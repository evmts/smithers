/**
 * What each side of the engine does when it falls its channel's capacity
 * behind: the leader stops leading and leads again, a tab's shared database
 * and engine fail with a typed error instead of waiting forever. The channel
 * is one a case feeds by hand, so a burst arrives with nothing taken between.
 */
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import { BrowserEngine, BrowserRuntime, SharedSqlite, StoragePersistence, TabChannel, WebLock } from "../src/index.ts"
import * as Engines from "./fixtures/Engines.ts"
import { flows } from "./fixtures/Flows.ts"
import * as MemorySqlite from "./fixtures/MemorySqlite.ts"
import * as Telemetry from "./fixtures/Telemetry.ts"

/** Channels of capacity one whose incoming messages a case delivers, and whose posts it reads. */
const handMade = () => {
  const opened: Array<{ readonly name: string; readonly channel: TabChannel.BroadcastChannelLike }> = []
  const posts: Array<unknown> = []
  const construct = (name: string): TabChannel.BroadcastChannelLike => {
    const channel: TabChannel.BroadcastChannelLike = {
      postMessage: (message) => posts.push(message),
      close: () => {},
      onmessage: null
    }
    opened.push({ name, channel })
    return channel
  }
  return {
    posts,
    layer: Layer.succeed(TabChannel.TabChannel)(TabChannel.make(construct, { capacity: 1 })),
    /** Two messages at once to every open port, or those of channel `only`: one more than a port that took nothing holds. */
    burst: (only?: string) =>
      Effect.sync(() => {
        for (const data of ["first", "second"]) {
          for (const { channel, name } of opened) {
            if (only === undefined || name === only) channel.onmessage?.({ data } as MessageEvent)
          }
        }
      })
  }
}

/** Waits until `posts` holds one matching `match`. */
const posted = (posts: ReadonlyArray<unknown>, match: (message: unknown) => boolean, count = 1) =>
  Effect.gen(function*() {
    while (posts.filter(match).length < count) yield* Effect.sleep("5 millis")
  })

const isLeader = (message: unknown) => (message as { readonly _tag?: unknown })._tag === "Leader"

describe("TabChannelOverflow", () => {
  it.live.each(["engine", "sql"])(
    "ends a leadership that fell its %s channel's capacity behind, logs why, and leads again",
    (which) => {
      const telemetry = Telemetry.make()
      return Effect.gen(function*() {
        const name = Engines.name()
        const channel = which === "engine" ? name : `${name}/sql`
        const channels = handMade()
        const running = yield* Effect.forkChild(
          BrowserRuntime.serve({ name, flows }, Engines.engine(name, yield* MemorySqlite.open, Engines.steps())).pipe(
            Effect.provide(Layer.mergeAll(WebLock.layer, channels.layer, telemetry.layer))
          )
        )
        yield* posted(channels.posts, isLeader)
        yield* channels.burst(channel)
        // The next leadership announces itself again, so tabs send what the last one never answered.
        yield* posted(channels.posts, isLeader, 2)
        yield* Fiber.interrupt(running)
        expect(telemetry.count(BrowserRuntime.leaderships, {})).toBe(2)
        expect(telemetry.lines("browser.runtime.lost").map((line) => line.annotations)).toEqual([
          expect.objectContaining({ reason: "overflow", channel })
        ])
        expect(telemetry.lines("browser.tab_channel.overflow").length).toBeGreaterThanOrEqual(1)
      }).pipe(Effect.scoped, Effect.timeout("10 seconds"))
    }
  )

  it.live("fails a tab's waiting statement and every later one with a ConnectionError naming the overflow", () =>
    Effect.gen(function*() {
      const name = Engines.name()
      const tab = (channels: ReturnType<typeof handMade>) =>
        SharedSqlite.make({ name }).pipe(Effect.provide(Layer.merge(WebLock.layer, channels.layer)))
      const overflowed = { name: "@smthrs/platform-browser/TabChannelOverflow" }

      const waiting = handMade()
      const first = yield* tab(waiting)
      const asked = yield* Effect.forkChild(first.execute("SELECT 1"))
      yield* posted(waiting.posts, (message) => (message as { readonly _tag?: unknown })._tag === "Execute")
      yield* waiting.burst()
      const failure = yield* Effect.flip(Fiber.join(asked))
      expect(failure.reason._tag).toBe("ConnectionError")
      expect(failure.reason.cause).toEqual(overflowed)

      const idle = handMade()
      const second = yield* tab(idle)
      yield* idle.burst()
      yield* Effect.yieldNow
      const later = yield* Effect.flip(second.execute("SELECT 2"))
      expect(later.reason.cause).toEqual(overflowed)
      // It never reached a leader.
      expect(idle.posts).toEqual([])
    }).pipe(Effect.scoped, Effect.timeout("10 seconds")))

  it.live("lets go of an overflowed tab's lock, so the leader rolls its open transaction back and other tabs go on", () =>
    Effect.gen(function*() {
      const name = Engines.name()
      const pool = yield* MemorySqlite.pool
      yield* Engines.leader(name, Engines.engineWithApp(name, yield* MemorySqlite.open, Engines.steps(), pool))
      // The real channel, whose incoming messages a case can also burst into by hand.
      const handlers: Array<(event: MessageEvent) => void> = []
      const construct = (channelName: string): TabChannel.BroadcastChannelLike => {
        const real = new BroadcastChannel(channelName)
        return {
          postMessage: (message) => real.postMessage(message),
          close: () => real.close(),
          get onmessage() {
            return real.onmessage
          },
          set onmessage(handler) {
            real.onmessage = handler
            if (handler !== null) handlers.push(handler)
          }
        }
      }
      const stuck = yield* SharedSqlite.make({ name }).pipe(
        Effect.provide(
          Layer.merge(WebLock.layer, Layer.succeed(TabChannel.TabChannel)(TabChannel.make(construct, { capacity: 50 })))
        )
      )
      const other = yield* Engines.sharedTab(name)
      yield* other.execute("CREATE TABLE t (id INTEGER)")
      yield* stuck.execute("BEGIN IMMEDIATE")
      yield* stuck.execute("INSERT INTO t (id) VALUES (1)")
      yield* Effect.sync(() => {
        for (let n = 0; n < 60; n++) for (const handler of handlers) handler({ data: n } as MessageEvent)
      })
      // Once the stuck tab takes the overflow, it can't even roll back: the leader does it for it.
      while (Exit.isSuccess(yield* Effect.exit(stuck.execute("SELECT 1")))) yield* Effect.sleep("5 millis")
      expect((yield* Effect.flip(stuck.execute("ROLLBACK"))).reason.cause).toEqual({
        name: "@smthrs/platform-browser/TabChannelOverflow"
      })
      expect(yield* other.execute("SELECT count(*) AS n FROM t")).toEqual([{ n: 0 }])
    }).pipe(Effect.scoped, Effect.timeout("10 seconds")))

  it.live("makes a tab's engine unavailable for good, as channel-overflow, and counts it", () => {
    const telemetry = Telemetry.make()
    return telemetry.observed(
      Effect.gen(function*() {
        const channels = handMade()
        const engine = yield* BrowserEngine.make({ name: Engines.name(), worker: () => Engines.worker().handle }).pipe(
          Effect.provide(Layer.merge(
            channels.layer,
            Layer.succeed(StoragePersistence.StoragePersistence)(StoragePersistence.make(undefined))
          ))
        )
        yield* channels.burst()
        expect(yield* engine.unavailable).toMatchObject({
          reason: "channel-overflow",
          error: "@smthrs/platform-browser/TabChannelOverflow"
        })
        // The engine records why after it says so.
        while (telemetry.count(BrowserEngine.unavailable, { reason: "channel-overflow" }) === 0) {
          yield* Effect.sleep("5 millis")
        }
      }).pipe(Effect.scoped, Effect.timeout("10 seconds"))
    ).pipe(Effect.andThen(Effect.sync(() => {
      expect(telemetry.count(BrowserEngine.unavailable, { reason: "channel-overflow" })).toBe(1)
    })))
  })
})
