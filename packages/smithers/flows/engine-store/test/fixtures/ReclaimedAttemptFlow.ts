import { Action, Flow, FlowRuntime, Interpreter } from "@smthrs/flow"
import { Jj } from "@smthrs/kernel"
import { Node } from "@smthrs/plan"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

/**
 * The launch demo's two-step flow, declared once for the two processes of
 * `ReclaimedAttemptCache`: the child that is SIGKILLed during `Test`, and the
 * survivor that reclaims its run. Both steps opt into cross-run reuse the
 * way the demo does: sealed, keyed by their input, a hard boundary with a
 * resolved read set, a shared cache scope, and a declared cache environment.
 *
 * Declared in its own module because the child is a process entrypoint, and
 * importing a declaration from there would start a second engine inside the
 * test worker.
 */
/**
 * The host both processes name, as two launches on one Mac do, so the
 * survivor's pid probe can see that the child's process is gone.
 */
export const hostId = "reclaimed-attempt-host"

export const Plan = Action.withCache(
  Action.make("reclaimed-attempt/Plan", {
    payload: { issue: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ issue }: { readonly issue: string }) => `plan:${issue}`,
    implementationVersion: "plan/v1",
    fileBoundary: { readSet: [], writeSet: [], boundaryMode: "hard" }
  }),
  { scope: "shared" }
)

export const Test = Action.withCache(
  Action.make("reclaimed-attempt/Test", {
    payload: { plan: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ plan }: { readonly plan: string }) => `test:${plan}`,
    implementationVersion: "test/v1",
    fileBoundary: { readSet: [], writeSet: [], boundaryMode: "hard" }
  }),
  { scope: "shared" }
)

export const Fix = Flow.make("reclaimed-attempt/Fix", {
  payload: { issue: Schema.String },
  success: Schema.String,
  body: (input) => Plan.call(input).pipe(Node.bindPlanned((plan) => Test.call({ plan })))
})

/** What each step does when it really runs. */
export interface Bodies {
  readonly plan: (issue: string) => Effect.Effect<string>
  readonly test: (plan: string) => Effect.Effect<string>
}

/** The flow registered on `engine`, with the bodies attached and the cache environment declared. */
export const layer = (engine: FlowRuntime.FlowRuntime["Service"], bodies: Bodies) =>
  Interpreter.layer(Fix).pipe(
    Layer.provideMerge(Plan.toLayer(({ issue }) => bodies.plan(issue), { implementationVersion: "plan/v1" })),
    Layer.provideMerge(Test.toLayer(({ plan }) => bodies.test(plan), { implementationVersion: "test/v1" })),
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(Action.layerCacheEnvironment({ layers: ["reclaimed-attempt@1"], capabilities: {} })),
    Layer.provideMerge(Layer.succeed(FlowRuntime.FlowRuntime, engine))
  )

/** A Jujutsu service that records nothing: both steps are sealed. */
export const jj = Layer.succeed(
  Jj.Jj,
  Jj.make({
    snapshot: () => Effect.succeed({ commitId: "reclaimed-attempt" as never, changeId: "reclaimed-attempt" as never }),
    restore: () => Effect.void,
    diff: () => Effect.succeed(""),
    workspaceAdd: () => Effect.void,
    workspaceForget: () => Effect.void,
    status: () => Effect.succeed("")
  })
)
