/**
 * The answer flow `PlanIdentityAcrossBuilds.test.ts` ships in a minified
 * bundle.
 *
 * `MinifiedBuild.ts` bundles this module with esbuild's minifier, once alone
 * and once beside unrelated code. The minifier names every binding by how
 * often the whole bundle uses it, so the unrelated code renames this module's
 * bindings, and the callbacks' source differs between the two builds
 * although nothing here changed.
 *
 * The body is an ordinary callback and the mapper a captured one, so both
 * kinds of callback identity cross the rebuild.
 */
import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"

/** Asks a person, who answers through the test's durable gate. */
export const Ask = Action.make("plan-minified/ask", {
  payload: {},
  success: Schema.Number,
  tier: "irreversible",
  idempotencyKey: "plan-minified-ask"
})

/** Doubles the answer. */
export const Double = Action.make("plan-minified/double", {
  payload: { value: Schema.Number },
  success: Schema.Number,
  idempotencyKey: "plan-minified-double-v1",
  implementationVersion: "1"
})

/** Asks, doubles the answer, and adds one. */
export const Answer = Flow.make("plan-minified/answer", {
  payload: {},
  success: Schema.Number,
  body: () =>
    Ask.call({}).pipe(
      Node.bindPlanned((value) => Double.call({ value })),
      Node.map(Node.capture({ step: 1 }, function(this: { readonly step: number }, value: number) {
        return value + this.step
      }))
    )
})
