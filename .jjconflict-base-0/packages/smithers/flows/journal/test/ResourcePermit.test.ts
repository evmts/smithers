import { describe, expect, it } from "@effect/vitest"
import * as TestDatabase from "@smthrs/database/test/TestDatabase"
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Statement from "effect/sql/Statement"
import { TestClock } from "effect/testing"
import * as Consensus from "../src/Consensus.ts"
import * as Migrations from "../src/Migrations.ts"
import * as SqlConsensus from "../src/SqlConsensus.ts"

const owner = { hostId: "host", pid: 101, nonce: "first" }
const other = { ...owner, pid: 202, nonce: "second" }
const dead = () => Effect.succeed(false)
const alive = () => Effect.succeed(true)
const sql = SqlConsensus.layer.pipe(Layer.provide(Layer.provideMerge(Migrations.layer, TestDatabase.layer)))

for (const [name, layer] of [["local", Consensus.layerLocal], ["SQL", sql]] as const) {
  describe(`${name} resource permits`, () => {
    it.effect("releases on failure and interruption; cancelled waiters never run", () =>
      Effect.gen(function*() {
        const service = yield* Consensus.Consensus
        const entered = yield* Deferred.make<void>()
        const holder = yield* service.withPermit(
          "resource",
          owner,
          alive,
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))
        ).pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        let ran = false
        const waiter = yield* service.withPermit(
          "resource",
          other,
          alive,
          Effect.sync(() => {
            ran = true
          })
        )
          .pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* Fiber.interrupt(waiter)
        expect(ran).toBe(false)
        yield* Fiber.interrupt(holder)
        const failed = yield* Effect.exit(service.withPermit("resource", other, alive, Effect.fail("failed")))
        expect(Exit.isFailure(failed)).toBe(true)
        const interrupted = yield* Effect.exit(service.withPermit("resource", other, alive, Effect.interrupt))
        expect(Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause)).toBe(true)
        expect(yield* service.withPermit("resource", owner, alive, Effect.succeed("reacquired"))).toBe("reacquired")
      }).pipe(Effect.provide(layer)))

    it.effect("keeps stale live owners excluded while unrelated keys proceed", () =>
      Effect.gen(function*() {
        const service = yield* Consensus.Consensus
        const stamp = yield* Clock.currentTimeMillis
        const grant = yield* service.claim("live", owner, stamp)
        if (grant._tag !== "Claimed") throw new Error("expected grant")
        yield* service.activate("live", owner, grant.grantedAtMs, stamp)
        yield* TestClock.adjust("31 seconds")
        let ran = false
        const waiter = yield* service.withPermit(
          "live",
          other,
          alive,
          Effect.sync(() => {
            ran = true
          })
        )
          .pipe(Effect.forkChild)
        yield* TestClock.adjust("100 millis")
        expect(ran).toBe(false)
        expect(yield* service.withPermit("independent", other, alive, Effect.succeed("parallel"))).toBe("parallel")
        yield* service.release("live", owner)
        yield* TestClock.adjust("100 millis")
        yield* Fiber.join(waiter)
        expect(ran).toBe(true)
      }).pipe(Effect.provide(layer)))

    it.effect("recovers a dead claimant and dead owner through the existing lease lifecycle", () =>
      Effect.gen(function*() {
        const service = yield* Consensus.Consensus
        const now = yield* Clock.currentTimeMillis
        const grant = yield* service.claim("claimed", owner, now)
        expect(grant._tag).toBe("Claimed")
        yield* TestClock.adjust("31 seconds")
        const recovered = yield* service.withPermit("claimed", other, dead, Effect.succeed("claim recovered"))
          .pipe(Effect.forkChild)
        // SQL may finish after a clock jump and only then schedule the
        // permit's retry. Keep advancing until that retry really completes.
        for (let turn = 0; turn < 1000 && recovered.pollUnsafe() === undefined; turn++) {
          yield* TestClock.adjust("50 millis")
          yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 5)))
        }
        expect(recovered.pollUnsafe()).toBeDefined()
        expect(yield* Fiber.join(recovered)).toBe("claim recovered")
        const stamp = yield* Clock.currentTimeMillis
        const held = yield* service.claim("owned", owner, stamp)
        if (held._tag !== "Claimed") throw new Error("expected grant")
        yield* service.activate("owned", owner, held.grantedAtMs, stamp)
        yield* TestClock.adjust("31 seconds")
        expect(yield* service.withPermit("owned", other, dead, Effect.succeed("owner recovered"))).toBe(
          "owner recovered"
        )
      }).pipe(Effect.provide(layer)))

    it.effect("renews through long work and interrupts it when the resource fence is lost", () =>
      Effect.gen(function*() {
        const service = yield* Consensus.Consensus
        const entered = yield* Deferred.make<void>()
        const work = yield* service.withPermit(
          "resource",
          owner,
          alive,
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))
        ).pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        yield* TestClock.adjust("35 seconds")
        // Healthy heartbeats kept the original owner in place across expiry.
        const now = yield* Clock.currentTimeMillis
        expect(
          yield* service.steal("resource", other, now, {
            expectedOwner: owner,
            checkedAtMs: now,
            kind: "lease-expired"
          })
        ).toMatchObject({ _tag: "Rejected" })
        yield* service.release("resource", owner)
        yield* TestClock.adjust("1 second")
        const result = yield* Fiber.await(work)
        expect(Exit.isFailure(result)).toBe(true)
        expect(yield* service.withPermit("resource", other, alive, Effect.succeed("successor"))).toBe("successor")
      }).pipe(Effect.provide(layer)))
  })
}

it.effect("refuses resource work when consensus is unavailable", () =>
  Effect.gen(function*() {
    let ran = false
    const failure = yield* Effect.flip(
      Consensus.makeNoop().withPermit(
        "resource",
        owner,
        alive,
        Effect.sync(() => {
          ran = true
        })
      )
    )
    expect(failure.code).toBe("persistence_failed")
    expect(ran).toBe(false)
  }))

for (const outcome of ["lost", "failed"] as const) {
  it.effect(`releases a resource claim when activation ${outcome}`, () =>
    Effect.gen(function*() {
      let releases = 0
      let ran = false
      const failure = new Consensus.ConsensusError({ code: "persistence_failed", message: "activation failed" })
      const strategy = Consensus.makeNoop({
        claim: () => Effect.succeed({ _tag: "Claimed", grantedAtMs: 0 }),
        activate: () => outcome === "lost" ? Effect.succeed({ _tag: "Lost" }) : Effect.fail(failure),
        release: () =>
          Effect.sync(() => {
            releases++
          })
      })
      const work = Consensus.resourcePermit(
        strategy,
        () => Effect.succeed(undefined),
        "resource",
        owner,
        alive,
        Effect.sync(() => {
          ran = true
        })
      )
      if (outcome === "failed") {
        expect(yield* Effect.flip(work)).toBe(failure)
      } else {
        const fiber = yield* Effect.forkChild(work)
        yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
      }
      expect(releases).toBe(1)
      expect(ran).toBe(false)
    }))
}

it.effect("retries when the SQL resource owner releases between a rejected claim and the lease read", () =>
  Effect.gen(function*() {
    const base = yield* Effect.service(SqlClient.SqlClient)
    const service = yield* SqlConsensus.make
    const now = yield* Clock.currentTimeMillis
    yield* service.claim("vanishing", owner, now)
    yield* service.activate("vanishing", owner, now, now)
    let released = false
    const client = new Proxy(base, {
      apply(target, receiver, args) {
        const statement = Reflect.apply(target, receiver, args) as Statement.Statement<unknown>
        if (released || !statement.compile().at(0)?.includes("SELECT * FROM flows_consensus_leases")) return statement
        released = true
        return service.release("vanishing", owner).pipe(Effect.andThen(statement))
      }
    }) as SqlClient.SqlClient
    const contender = yield* SqlConsensus.make.pipe(Effect.provideService(SqlClient.SqlClient, client))
    const work = yield* Effect.forkChild(contender.withPermit("vanishing", other, alive, Effect.succeed("entered")))
    for (let turn = 0; turn < 1000 && work.pollUnsafe() === undefined; turn++) {
      yield* TestClock.adjust("50 millis")
      yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 5)))
    }
    expect(work.pollUnsafe()).toBeDefined()
    expect(yield* Fiber.join(work)).toBe("entered")
    expect(released).toBe(true)
  }).pipe(Effect.provide(Layer.provideMerge(Migrations.layer, TestDatabase.layer))))
