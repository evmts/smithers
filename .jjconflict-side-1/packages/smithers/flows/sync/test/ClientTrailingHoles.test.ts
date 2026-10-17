/**
 * A live frame covers `fromSeq..toSeq`, and the protocol lets admission drop
 * any sequence inside that interval, including the last ones. The client must
 * treat the whole covered interval as consumed, or the next contiguous frame
 * starts beyond its cursor and is refused as a gap.
 *
 * @since 1.0.0-rc.7
 */
import { describe, expect, it } from "@effect/vitest"
import type { JournalEvent } from "@smthrs/journal"
import { Effect, Stream } from "effect"
import * as SyncClient from "../src/SyncClient.ts"
import type * as SyncProtocol from "../src/SyncProtocol.ts"
import { entry } from "./fixtures/entry.ts"

const seq = (value: number) => value as JournalEvent.Seq
const id = "trailing" as JournalEvent.RunId
const scope = { _tag: "Run", runId: id } as const

const frame = (fromSeq: number, toSeq: number, carried: ReadonlyArray<number>): SyncProtocol.Frame => ({
  generation: 0,
  _tag: "Entries",
  runId: id,
  fromSeq: seq(fromSeq),
  toSeq: seq(toSeq),
  entries: carried.map((value) => entry("trailing", value))
})

// A stub RPC client, because the in-repo server ends every frame at its one
// entry and so never emits a trailing hole. Any conforming server may.
const clientFor = (frames: ReadonlyArray<SyncProtocol.Frame>) =>
  Effect.runSync(SyncClient.make({
    client: {
      "Sync.Read": () => Effect.succeed({ entries: [], cursors: [], done: true }),
      "Sync.Subscribe": () => Stream.fromIterable(frames)
    } as unknown as Parameters<typeof SyncClient.make>[0]["client"]
  }))

describe("SyncClient covered intervals with trailing holes", () => {
  it.effect("accepts the next contiguous frame after a frame whose last sequences were dropped", () =>
    Effect.gen(function*() {
      const client = clientFor([frame(0, 5, [0, 2]), frame(6, 6, [6])])

      const entries = yield* client.subscribe({ scope, cursors: [] }).pipe(Stream.take(3), Stream.runCollect)

      expect(Array.from(entries).map((value) => value.seq)).toEqual([0, 2, 6])
      expect((yield* client.progress).delivered).toEqual([{ generation: 0, runId: id, afterSeq: 6 }])
    }))

  it.effect("consumes a covered interval that carried no entries at all", () =>
    Effect.gen(function*() {
      const client = clientFor([frame(0, 3, []), frame(4, 4, [4])])

      const entries = yield* client.subscribe({ scope, cursors: [] }).pipe(Stream.take(1), Stream.runCollect)

      expect(Array.from(entries).map((value) => value.seq)).toEqual([4])
    }))

  it.effect("advances the applied cursor through the covered interval when entries are applied", () =>
    Effect.gen(function*() {
      const applied: Array<number> = []
      const client = clientFor([frame(0, 5, [1]), frame(6, 7, [7])])

      yield* client.subscribe({
        scope,
        cursors: [],
        apply: (value) => Effect.sync(() => applied.push(value.seq))
      }).pipe(Stream.take(2), Stream.runDrain)

      expect(applied).toEqual([1, 7])
      expect((yield* client.progress).applied).toEqual([{ generation: 0, runId: id, afterSeq: 7 }])
    }))
})
