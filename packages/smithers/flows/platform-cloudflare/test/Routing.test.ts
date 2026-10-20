/**
 * Executions that span several Durable Objects, one object per execution: a
 * parent and the child it runs as its own execution, a lineage of rounds
 * that hand off to each other, and a parent whose child fails. Each object
 * builds a fresh runtime, a new incarnation, for every alarm, over the same
 * store, and reaches the others only through its `Router`.
 */
import { describe, expect, it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as TestClock from "effect/testing/TestClock"
import { randomUUID } from "node:crypto"
import { ExecutionObject } from "../src/index.ts"
import { Child, Counter, flows, Guardian, Parent, Patient, Relay, runtime, Supervisor } from "./fixtures/NestedFlows.ts"
import * as Objects from "./fixtures/Objects.ts"
import * as Postgres from "./fixtures/Postgres.ts"

/** The rows a case's schema holds, oldest first: each run's id, flow, status and parent. */
const runsIn = (schema: string) =>
  Effect.promise(() =>
    Postgres.admin(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ readonly run_id: string; readonly status: string; readonly state_json: string }>`
        SELECT run_id, status, state_json FROM ${sql(schema)}.flows_runs ORDER BY created_at_ms, round_ordinal`
      return rows.map((row) => {
        const state = JSON.parse(row.state_json) as { readonly flowName: string; readonly result?: unknown }
        return { id: row.run_id, flow: state.flowName, status: row.status, result: state.result }
      })
    }))
  )

class RouteFailed extends Schema.TaggedError<RouteFailed>()("RouteFailed", {}) {}

/**
 * One case's objects over a fresh schema, every step recorded in `steps`. A
 * step `hang` names never returns, the first time it runs, once it has
 * completed `started`.
 */
const setup = (
  target: Postgres.Target,
  options: {
    readonly router?: (objects: Objects.Objects) => ExecutionObject.Router<unknown>
    readonly hang?: { readonly label: string; readonly started: Deferred.Deferred<void> }
  } = {}
) => {
  const schema = Postgres.freshSchema()
  const steps: Array<string> = []
  const record = (label: string) =>
    Effect.gen(function*() {
      const first = !steps.includes(label)
      steps.push(label)
      if (first && options.hang?.label === label) {
        yield* Deferred.succeed(options.hang.started, undefined)
        return yield* Effect.never
      }
      return label
    })
  const router = options.router
  const objects = Objects.make({
    flows,
    runtime: runtime({ record, database: Postgres.database(schema, target.url) }),
    ...(router === undefined ? {} : { router })
  })
  const cleanup = Effect.promise(() => Postgres.dropSchema(schema))
  return { schema, steps, objects, cleanup, runs: runsIn(schema) }
}

/**
 * Every object's alarm, by execution id: `"forget"` when it is a settled
 * object's final alarm, at the end of its retention window, so every alarm is
 * `null` or `"forget"` once the objects are quiet.
 */
const alarms = (objects: Objects.Objects) =>
  Object.fromEntries([...objects.objects].map(([id, storage]) => {
    const at = storage.alarm()
    const settledAt = storage.values.get(ExecutionObject.settledKey) as number | undefined
    return [id, settledAt !== undefined && at === settledAt + ExecutionObject.settledRetentionMs ? "forget" : at]
  }))

/** A `Settled` outcome, whatever window it was armed to forget at. */
const settled = { _tag: "Settled", forgetAtMs: expect.any(Number) }

for (const target of Postgres.targets) {
  describe.skipIf(!target.available)(`executions across objects over ${target.label}`, () => {
    it.live("a child that settles while its parent's alarm is still routing it wakes the parent all the same", () => {
      // The child's object runs its alarm the moment it is started, inside
      // the parent's routing: its settlement wakes the parent before the
      // parent's alarm has armed what its own drive left.
      const c = setup(target, {
        router: (objects) => ({
          start: (intent) =>
            objects.router.start(intent).pipe(Effect.andThen(objects.alarm(intent.executionId)), Effect.asVoid),
          wake: objects.router.wake
        })
      })
      const parentId = `parent-${randomUUID()}`
      return Effect.gen(function*() {
        const intent = yield* ExecutionObject.intent(Parent, { executionId: parentId, payload: { label: "fast" } })
        yield* ExecutionObject.start(c.objects.object(parentId).storage, intent, Effect.void)
        const before = Date.now()
        const parked = yield* c.objects.alarm(parentId)
        // The drive parked on the child with no wake of its own; the store,
        // read again after arming, says the child's settlement made it due.
        expect(parked).toEqual({ _tag: "Parked", wakeAtMs: expect.any(Number) })
        expect((parked as { readonly wakeAtMs: number }).wakeAtMs).toBeGreaterThanOrEqual(before)
        expect((parked as { readonly wakeAtMs: number }).wakeAtMs).toBeLessThanOrEqual(Date.now())
        expect(c.objects.object(parentId).alarm()).toBe((parked as { readonly wakeAtMs: number }).wakeAtMs)

        yield* c.objects.run()
        expect((yield* c.runs).map((run) => run.status)).toEqual(["completed", "completed"])
        expect(c.steps).toEqual(["child:fast", "parent:child:fast"])
      }).pipe(Effect.ensuring(c.cleanup))
    })

    it.live("a router that fails retries with backoff, and the next alarm routes what the drive left", () => {
      let failures = 1
      const c = setup(target, {
        router: (objects) => ({
          start: (intent) => failures-- > 0 ? Effect.fail(new RouteFailed()) : objects.router.start(intent),
          wake: objects.router.wake
        })
      })
      const parentId = `parent-${randomUUID()}`
      return Effect.gen(function*() {
        const intent = yield* ExecutionObject.intent(Parent, { executionId: parentId, payload: { label: "again" } })
        yield* ExecutionObject.start(c.objects.object(parentId).storage, intent, Effect.void)
        const before = Date.now()
        expect(yield* c.objects.alarm(parentId)).toMatchObject({ _tag: "Retrying", attempt: 1, failure: "RouteFailed" })
        expect(c.objects.object(parentId).alarm()).toBeGreaterThanOrEqual(before + 1_000)
        expect([...c.objects.objects.keys()]).toEqual([parentId])

        // The watchdog's alarm, fired early here: nothing is due to drive,
        // and the routing the last alarm failed runs again.
        expect(yield* c.objects.alarm(parentId)).toEqual({ _tag: "Parked", wakeAtMs: null })
        yield* c.objects.run()
        expect((yield* c.runs).map((run) => run.status)).toEqual(["completed", "completed"])
        expect(c.steps).toEqual(["child:again", "parent:child:again"])
      }).pipe(Effect.ensuring(c.cleanup))
    })

    it.live("a cancelled parent's routing wakes the current round of the child lineage it asked to cancel", () => {
      const c = setup(target)
      const parentId = `supervisor-${randomUUID()}`
      return Effect.gen(function*() {
        const intent = yield* ExecutionObject.intent(Supervisor, { executionId: parentId, payload: {} })
        yield* ExecutionObject.start(c.objects.object(parentId).storage, intent, Effect.void)
        yield* c.objects.run()
        // The child's first round handed off on its own object, and the
        // second parked on an object of its own.
        expect((yield* c.runs).map(({ flow, status }) => ({ flow, status }))).toEqual([
          { flow: Supervisor._tag, status: "suspended" },
          { flow: Relay._tag, status: "completed" },
          { flow: Patient._tag, status: "suspended" }
        ])
        expect(Object.values(alarms(c.objects))).toEqual([null, "forget", null])

        // The app cancels the parent, then wakes its object.
        yield* Supervisor.interrupt(parentId).pipe(
          Effect.provide(runtime({ record: Effect.succeed, database: Postgres.database(c.schema, target.url) })(intent))
        )
        yield* c.objects.router.wake(parentId)
        yield* c.objects.run()

        const runs = yield* c.runs
        expect(runs.map((run) => run.status)).toEqual(["cancelled", "completed", "cancelled"])
        expect(c.objects.outcomes.get(runs[2]!.id)).toEqual([{ _tag: "Parked", wakeAtMs: null }, settled])
        expect(Object.values(alarms(c.objects))).toEqual(["forget", "forget", "forget"])
      }).pipe(Effect.ensuring(c.cleanup))
    })

    it.live("a parent starts its child on the child's own object, and the child's settlement wakes it", () => {
      const c = setup(target)
      const parentId = `parent-${randomUUID()}`
      return Effect.gen(function*() {
        const intent = yield* ExecutionObject.intent(Parent, { executionId: parentId, payload: { label: "hi" } })
        yield* ExecutionObject.start(c.objects.object(parentId).storage, intent, Effect.void)
        yield* c.objects.run()

        const runs = yield* c.runs
        expect(runs.map(({ flow, status }) => ({ flow, status }))).toEqual([
          { flow: Parent._tag, status: "completed" },
          { flow: Child._tag, status: "completed" }
        ])
        const childId = runs[1]!.id
        expect(c.steps).toEqual(["child:hi", "parent:child:hi"])
        expect([...c.objects.objects.keys()]).toEqual([parentId, childId])
        expect(c.objects.outcomes.get(parentId)).toEqual([{ _tag: "Parked", wakeAtMs: null }, settled])
        expect(c.objects.outcomes.get(childId)).toEqual([settled])
        expect(alarms(c.objects)).toEqual({ [parentId]: "forget", [childId]: "forget" })

        // A duplicate alarm on either object runs no step again and routes nothing.
        expect(yield* c.objects.alarm(childId)).toEqual(c.objects.outcomes.get(childId)![0])
        expect(yield* c.objects.alarm(parentId)).toEqual(c.objects.outcomes.get(parentId)![1])
        expect(c.steps).toEqual(["child:hi", "parent:child:hi"])
        expect(alarms(c.objects)).toEqual({ [parentId]: "forget", [childId]: "forget" })
      }).pipe(Effect.ensuring(c.cleanup))
    })

    it.live("a child's failure fails its parent", () => {
      const c = setup(target)
      const parentId = `guardian-${randomUUID()}`
      return Effect.gen(function*() {
        const intent = yield* ExecutionObject.intent(Guardian, { executionId: parentId, payload: {} })
        yield* ExecutionObject.start(c.objects.object(parentId).storage, intent, Effect.void)
        yield* c.objects.run()

        const runs = yield* c.runs
        expect(runs.map(({ flow, status }) => ({ flow, status }))).toEqual([
          { flow: Guardian._tag, status: "failed" },
          { flow: "cloudflare-test/Faulty", status: "failed" }
        ])
        // The parent failed with the child's own declared error, not a defect.
        expect(JSON.stringify(runs[0]!.result)).toContain("SleepRequestInvalid")
        expect(c.objects.outcomes.get(parentId)).toEqual([{ _tag: "Parked", wakeAtMs: null }, settled])
        expect(alarms(c.objects)).toEqual({ [parentId]: "forget", [runs[1]!.id]: "forget" })
      }).pipe(Effect.ensuring(c.cleanup))
    })

    it.effect("each round of a lineage runs on its own object, and one reset in a round's step resumes there", () => {
      const started = Deferred.makeUnsafe<void>()
      const c = setup(target, { hang: { label: "bump:1", started } })
      const rootId = `counter-${randomUUID()}`
      return Effect.gen(function*() {
        yield* TestClock.setTime(Date.now())
        const intent = yield* ExecutionObject.intent(Counter, {
          executionId: rootId,
          payload: { value: 0, target: 3 }
        })
        yield* ExecutionObject.start(c.objects.object(rootId).storage, intent, Effect.void)
        // Round zero runs and hands off; its object starts round one's.
        yield* c.objects.alarm(rootId)
        const [, roundOne] = [...c.objects.objects.keys()]
        expect(roundOne).toEqual(expect.any(String))

        // Round one's object is reset inside its step: the alarm's fiber is
        // interrupted once the step has started, as an isolate reset ends it.
        const fiber = yield* Effect.forkChild(c.objects.alarm(roundOne!))
        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)

        // The watchdog the reset alarm left armed fires one backoff later, in
        // a new incarnation, and the lineage runs to its end.
        yield* c.objects.run(TestClock.setTime)

        const runs = yield* c.runs
        expect(runs.map(({ flow, status }) => ({ flow, status }))).toEqual([
          { flow: Counter._tag, status: "completed" },
          { flow: Counter._tag, status: "completed" },
          { flow: Counter._tag, status: "completed" }
        ])
        expect(runs.map((run) => run.id)).toEqual([...c.objects.objects.keys()])
        expect(JSON.stringify(runs[2]!.result)).toContain("3")
        expect(c.steps).toEqual(["bump:0", "bump:1", "bump:1", "bump:2"])
        // Advancing the clock fired each settled round's final alarm too: every
        // object has forgotten its round and holds nothing.
        expect(Object.values(alarms(c.objects))).toEqual([null, null, null])
        expect([...c.objects.objects.values()].map((object) => object.values.size)).toEqual([0, 0, 0])
        expect([...c.objects.outcomes.values()].map((outcomes) => outcomes.at(-1))).toEqual([
          { _tag: "Forgotten" },
          { _tag: "Forgotten" },
          { _tag: "Forgotten" }
        ])
      }).pipe(Effect.ensuring(c.cleanup))
    })
  })
}
