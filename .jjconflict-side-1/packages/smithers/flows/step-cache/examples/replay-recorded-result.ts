import * as CacheStore from "@smthrs/step-cache/CacheStore"
import * as TestCacheStore from "@smthrs/step-cache/test/TestCacheStore"
import * as Effect from "effect/Effect"

/**
 * Records a replacement head while preserving the original result for replay.
 * Uses the real SQL store in an isolated in-memory database.
 *
 * @returns An effect yielding publication outcomes, the current head and the original recording.
 * Storage failures remain in the effect's typed error channel.
 * @since 1.0.0
 */
export const replayRecordedResult = Effect.gen(function*() {
  const cache = yield* CacheStore.CacheStore
  const original: CacheStore.CacheEntry = {
    keyDigest: "example-replay",
    result: { value: "original" },
    meta: {},
    createdAtMs: 1,
    recordedRunId: "first-run",
    recordedEventSeq: 1
  }
  const first = yield* cache.put(original)
  // Eviction removes only the head. Recorded provenance remains immutable.
  const evicted = yield* cache.evict(original.keyDigest, {
    ifRecordedBy: { runId: original.recordedRunId, eventSeq: original.recordedEventSeq }
  })
  const replacement = yield* cache.put({
    ...original,
    result: { value: "replacement" },
    createdAtMs: 2,
    recordedRunId: "second-run"
  })
  const head = yield* cache.get(original.keyDigest)
  const recorded = yield* cache.get(original.keyDigest, {
    recordedBy: { runId: original.recordedRunId, eventSeq: original.recordedEventSeq }
  })
  return { first, evicted, replacement, head, recorded }
}).pipe(Effect.provide(TestCacheStore.layer), Effect.scoped)
