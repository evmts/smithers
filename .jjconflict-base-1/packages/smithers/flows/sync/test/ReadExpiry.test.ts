/**
 * A catch-up read is bounded by the credential that admitted it, as a
 * snapshot is: a page whose journal reads finish after the credential expired
 * is refused rather than served.
 *
 * @since 1.0.0-rc.7
 */
import { describe, expect, it } from "@effect/vitest"
import { Journal } from "@smthrs/journal"
import { Deferred, Effect, Fiber, Layer, Redacted } from "effect"
import { TestClock } from "effect/testing"
import * as BranchProtocol from "../src/BranchProtocol.ts"
import * as BranchShare from "../src/BranchShare.ts"
import * as RunCatalog from "../src/RunCatalog.ts"
import { SyncError } from "../src/SyncError.ts"
import * as SyncPrincipal from "../src/SyncPrincipal.ts"
import * as SyncServer from "../src/SyncServer.ts"
import { entry } from "./fixtures/entry.ts"

const branchId = "read-expiry-branch" as BranchProtocol.BranchId
const branchRun = BranchProtocol.branchRunId(branchId)

const shareLayer = BranchShare.layerHmac({
  activeKid: "primary",
  keys: [{ kid: "primary", secret: Redacted.make("read-expiry-secret-0123456789abcdef") }]
})

describe("Sync.Read credential expiry", () => {
  it.effect("refuses a page whose journal read finished after the share capability expired", () =>
    Effect.gen(function*() {
      const reading = yield* Deferred.make<void>()
      const failure = yield* Effect.gen(function*() {
        const share = yield* BranchShare.BranchShare
        const capability = yield* share.mint({ access: "read", branchId, capabilityId: "read-cap", ttlMs: 1_000 })
        const server = yield* SyncServer.makeLive
        const read = yield* Effect.forkChild(
          Effect.flip(server.read({
            protocolVersion: 1,
            capability,
            cursors: [],
            limit: 16,
            scope: { _tag: "Run", runId: branchRun }
          })),
          { startImmediately: true }
        )
        yield* Deferred.await(reading)
        yield* TestClock.adjust("2 seconds")
        return yield* Fiber.join(read)
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            // A journal read that is slower than the capability's remaining
            // lifetime: it starts inside the window and returns outside it.
            Journal.layerNoop({
              entries: ({ runId }) =>
                Deferred.succeed(reading, undefined).pipe(
                  Effect.andThen(Effect.sleep("2 seconds")),
                  Effect.as({ entries: [entry(runId, 0)], hasMore: false })
                )
            }),
            RunCatalog.layerStatic([branchRun]),
            shareLayer
          )
        ),
        Effect.provide(TestClock.layer()),
        Effect.scoped
      )

      expect(SyncError.is(failure)).toBe(true)
      expect(failure.code).toBe("unauthorized")
      expect(failure.message).toContain("expired")
    }))

  it.effect("refuses a read by a workspace principal that has already expired", () =>
    Effect.gen(function*() {
      const failure = yield* Effect.gen(function*() {
        yield* TestClock.adjust("1 second")
        const server = yield* SyncServer.makeLive
        return yield* Effect.flip(server.read({
          protocolVersion: 1,
          cursors: [],
          limit: 16,
          scope: { _tag: "Workspace" }
        }))
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Journal.layerNoop({
              entries: ({ runId }) => Effect.succeed({ entries: [entry(runId, 0)], hasMore: false })
            }),
            RunCatalog.layerStatic(["read-expiry-engine" as never]),
            Layer.succeed(SyncPrincipal.SyncPrincipal, SyncPrincipal.workspace("expired-owner", 500))
          )
        ),
        Effect.provide(TestClock.layer()),
        Effect.scoped
      )

      expect(SyncError.is(failure)).toBe(true)
      expect(failure.code).toBe("unauthorized")
      expect(failure.message).toContain("expired")
    }))
})
