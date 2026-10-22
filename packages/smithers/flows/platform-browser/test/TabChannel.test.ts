import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import { TabChannel } from "../src/index.ts"
import * as Telemetry from "./fixtures/Telemetry.ts"

/** A channel whose incoming messages a case delivers by hand, as a burst from other tabs would arrive. */
const handMade = () => {
  const opened: Array<TabChannel.BroadcastChannelLike> = []
  const construct = (_name: string): TabChannel.BroadcastChannelLike => {
    const channel: TabChannel.BroadcastChannelLike = { postMessage: () => {}, close: () => {}, onmessage: null }
    opened.push(channel)
    return channel
  }
  const deliver = (data: unknown) => {
    for (const channel of opened) channel.onmessage?.({ data } as MessageEvent)
  }
  return { construct, deliver }
}

describe("TabChannel over BroadcastChannel", () => {
  it.live("delivers a post to every other port of the channel, and never back to its sender", () =>
    Effect.gen(function*() {
      const channels = yield* TabChannel.TabChannel
      const name = `tab-channel-${crypto.randomUUID()}`
      const a = yield* channels.open(name)
      const b = yield* channels.open(name)
      const atA = yield* a.subscribe
      const atB = yield* b.subscribe
      const alsoAtB = yield* b.subscribe
      yield* a.post({ hello: "b" })
      expect(yield* Queue.take(atB)).toEqual({ hello: "b" })
      expect(yield* Queue.take(alsoAtB)).toEqual({ hello: "b" })
      yield* b.post({ hello: "a" })
      expect(yield* Queue.take(atA)).toEqual({ hello: "a" })
      expect(yield* Queue.size(atA)).toBe(0)
    }).pipe(Effect.scoped, Effect.provide(TabChannel.layer)))
})

describe("TabChannel's bound", () => {
  it.effect("fails a subscriber that falls `capacity` messages behind with TabChannelOverflow, after what it holds, and counts it", () => {
    const telemetry = Telemetry.make()
    return telemetry.observed(
      Effect.gen(function*() {
        const { construct, deliver } = handMade()
        const port = yield* TabChannel.make(construct, { capacity: 2 }).open("engine/sql")
        const slow = yield* port.subscribe
        const keeping = yield* port.subscribe
        deliver(1)
        deliver(2)
        expect(yield* Queue.take(keeping)).toBe(1)
        deliver(3)
        expect(yield* Queue.take(slow)).toBe(1)
        expect(yield* Queue.take(slow)).toBe(2)
        expect(yield* Effect.flip(Queue.take(slow))).toMatchObject({
          _tag: "@smthrs/platform-browser/TabChannelOverflow",
          channel: "engine/sql",
          capacity: 2
        })
        // A message after the overflow reaches only the subscribers that kept up.
        expect(yield* Queue.take(keeping)).toBe(2)
        deliver(4)
        expect([yield* Queue.take(keeping), yield* Queue.take(keeping)]).toEqual([3, 4])
        yield* Effect.yieldNow
      }).pipe(Effect.scoped)
    ).pipe(Effect.andThen(Effect.sync(() => {
      expect(telemetry.count(TabChannel.overflows, { channel: "engine/sql" })).toBe(1)
      expect(telemetry.lines("browser.tab_channel.overflow").map((line) => line.annotations)).toEqual([
        { channel: "engine/sql", capacity: 2 }
      ])
    })))
  })

  it.effect("counts and logs every subscriber it ended exactly once, however soon the channel closes", () => {
    const telemetry = Telemetry.make()
    return telemetry.observed(
      Effect.gen(function*() {
        const { construct, deliver } = handMade()
        yield* Effect.scoped(Effect.gen(function*() {
          const port = yield* TabChannel.make(construct, { capacity: 1 }).open("busy")
          for (let n = 0; n < 1_000; n++) yield* port.subscribe
          deliver(1)
          deliver(2)
          yield* Effect.yieldNow
        }))
      })
    ).pipe(Effect.andThen(Effect.sync(() => {
      expect(telemetry.count(TabChannel.overflows, { channel: "busy" })).toBe(1_000)
      expect(telemetry.lines("browser.tab_channel.overflow")).toHaveLength(1_000)
    })))
  })

  it.effect("keeps 10,000 messages for a subscriber by default", () =>
    Effect.gen(function*() {
      const { construct, deliver } = handMade()
      const port = yield* TabChannel.make(construct).open("engine")
      const inbox = yield* port.subscribe
      for (let n = 0; n < TabChannel.defaultCapacity; n++) deliver(n)
      expect(yield* Queue.size(inbox)).toBe(10_000)
      deliver("one more")
      expect(yield* Queue.size(inbox)).toBe(10_000)
      yield* Queue.takeN(inbox, 10_000)
      expect((yield* Effect.exit(Queue.take(inbox)))._tag).toBe("Failure")
    }).pipe(Effect.scoped))
})
