import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as PubSub from "effect/PubSub"
import { TabChannel } from "../src/index.ts"

describe("TabChannel over BroadcastChannel", () => {
  it.live("delivers a post to every other port of the channel, and never back to its sender", () =>
    Effect.gen(function*() {
      const channels = yield* TabChannel.TabChannel
      const name = `tab-channel-${crypto.randomUUID()}`
      const a = yield* channels.open(name)
      const b = yield* channels.open(name)
      const atA: PubSub.Subscription<unknown> = yield* a.subscribe
      const atB = yield* b.subscribe
      const alsoAtB = yield* b.subscribe
      yield* a.post({ hello: "b" })
      expect(yield* PubSub.take(atB)).toEqual({ hello: "b" })
      expect(yield* PubSub.take(alsoAtB)).toEqual({ hello: "b" })
      yield* b.post({ hello: "a" })
      expect(yield* PubSub.take(atA)).toEqual({ hello: "a" })
      expect(yield* PubSub.remaining(atA)).toBe(0)
    }).pipe(Effect.scoped, Effect.provide(TabChannel.layer)))
})
