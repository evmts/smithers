// A run's page mid-step, from the engine's real journal (src/features/runs/graph.ts over `@smthrs/gateway`): a flow shaped
// like the `todo` run (worker/flows/Todo.ts), whose later steps are planned continuations (`Node.bindPlanned`), runs on
// the Node host's engine over the compose Postgres (`pnpm db:up`) and is held in its second step. The engine schedules
// the planned steps with the plan, ahead of the step they follow; the page reads each one Queued until it starts, never
// Working (the live recording of a TODO's run showed Publish, Await and Settle Working while Implement worked).
import * as Pg from "@effect/sql-pg"
import { PostgresDatabase } from "@smthrs/database"
import { Action, Flow, FlowRuntime, Interpreter } from "@smthrs/flow"
import { EngineStore } from "@smthrs/flows"
import { Node, type Planned } from "@smthrs/plan"
import { Context, Deferred, Effect, Fiber, Layer, Schema } from "effect"
import { describe, expect, test, vi } from "vitest"
import * as TestDatabase from "../../../db/TestDatabase.ts"
import { build } from "../../../worker/test/flowHost.ts"
import { graphOf } from "./graph"
import type { Inspection, RunPage } from "./schema"

const Begin = Action.make("planned/Begin", { payload: {}, success: Schema.String })
const Implement = Action.make("planned/Implement", { payload: { from: Schema.String }, success: Schema.String })
const Collect = Action.make("planned/Collect", { payload: {}, success: Schema.String })
const Publish = Action.make("planned/Publish", { payload: { from: Schema.String }, success: Schema.String })
const Settle = Action.make("planned/Settle", { payload: { from: Schema.String }, success: Schema.String })

/** Begin, then Implement and Collect, then the planned Publish and Settle: `todo`'s shape. */
const Sequenced = Flow.make("planned/Run", {
  description: "Steps in sequence, the later ones planned continuations.",
  modelInvocable: false,
  payload: {},
  success: Schema.String,
  body: Node.capture(
    { begin: Begin.name, implement: Implement.name, collect: Collect.name, publish: Publish.name, settle: Settle.name },
    () =>
      Begin.call({}).pipe(
        Node.bindPlanned(Node.capture({ implement: Implement.name }, (begun: Planned.Planned<string>) =>
          Implement.call({ from: begun }).pipe(
            Node.andThen(Collect.call({})),
            Node.bindPlanned(Node.capture({ publish: Publish.name }, (collected: Planned.Planned<string>) =>
              Publish.call({ from: collected }))),
            Node.bindPlanned(Node.capture({ settle: Settle.name }, (published: Planned.Planned<string>) =>
              Settle.call({ from: published }))),
          ))),
      ),
  ),
})

/** What the page reads of each step, by its action, at the engine's read now. */
const statesOf = (inspection: Inspection) => {
  const page: RunPage = { id: inspection.run.runId, state: "read", inspection, more: [], hasMore: false, descendants: [] }
  const steps = graphOf(page, null, Date.now()).steps
  const state = (label: string) => steps.find((step) => step.row.label === label)?.row.state
  const timed = (label: string) => steps.some((step) => step.row.label === label && step.attempts.length > 0)
  return {
    states: ["Begin", "Implement", "Collect", "Publish", "Settle"].map((name) => state(`planned/${name}`)),
    timed: ["Begin", "Implement", "Collect", "Publish", "Settle"].filter((name) => timed(`planned/${name}`)),
  }
}

describe("a run's page mid-step", () => {
  test("a planned step the engine scheduled ahead reads Queued until it starts, with no bar on the timeline", async () => {
    const release = Effect.runSync(Deferred.make<string>())
    const working = Effect.runSync(Deferred.make<void>())
    const registration = Layer.mergeAll(
      Begin.toLayer(() => Effect.succeed("begun")),
      // Implement works until the test lets it finish.
      Implement.toLayer(() => Effect.andThen(Deferred.succeed(working, undefined), Deferred.await(release))),
      Collect.toLayer(() => Effect.succeed("collected")),
      Publish.toLayer(() => Effect.succeed("published")),
      Settle.toLayer(() => Effect.succeed("settled")),
      Interpreter.layer(Sequenced, { callbackIdentity: "stable" }),
    ).pipe(Layer.provideMerge(Action.layerImplementations))

    const [mid, end] = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { context, engine } = yield* build(registration)
          const server = yield* TestDatabase.serverUrl
          const reads = EngineStore.RunInspection.layerWith({ flows: [Sequenced] }).pipe(
            Layer.provide(PostgresDatabase.layer({ url: server.toString(), driver: Pg, schema: engine.schema, readOnly: true })),
          )
          const inspect = Effect.flatMap(EngineStore.RunInspection.RunInspection, (inspection) => inspection.inspect("planned-1"))
            .pipe(Effect.provide(reads), Effect.orDie)
          const flows = Context.get(context, FlowRuntime.FlowRuntime)
          const running = yield* Effect.forkScoped(
            flows.execute(Sequenced, { executionId: "planned-1", payload: {} }).pipe(Effect.provide(context)),
          )
          yield* Deferred.await(working)
          // Implement's attempt is recorded once the engine committed it.
          const midway = yield* Effect.promise(() =>
            vi.waitFor(async () => {
              const read = await Effect.runPromise(inspect)
              expect(statesOf(read).states[1]).toBe("running")
              return read
            }, { timeout: 15_000, interval: 50 })
          )
          yield* Deferred.succeed(release, "implemented")
          yield* Fiber.join(running)
          return [midway, yield* inspect] as const
        }),
      ) as Effect.Effect<readonly [Inspection, Inspection]>,
    )

    // Mid-Implement: Begin done, Implement Working, every step after it Queued and off the timeline.
    expect(statesOf(mid)).toEqual({
      states: ["completed", "running", "pending", "pending", "pending"],
      timed: ["Begin", "Implement"],
    })
    // Settled: every step done, each on the timeline.
    expect(statesOf(end)).toEqual({
      states: ["completed", "completed", "completed", "completed", "completed"],
      timed: ["Begin", "Implement", "Collect", "Publish", "Settle"],
    })
  }, 60_000)
})
