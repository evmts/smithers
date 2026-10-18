/**
 * The answer flow of `PlanIdentityAcrossBuilds.test.ts`, as a later build
 * declares it.
 *
 * The tags, schemas, steps, captures and callback source are the test file's,
 * character for character. Only the declaration sites differ: another file,
 * and other lines in it. That is what a rebuilt bundle looks like to the
 * engine when nothing in the flow changed, so a run parked under the test
 * file's declarations must resume under these.
 *
 * Keep the callbacks' source identical to the test file's. Their source is
 * part of the plan's identity, and a difference there is a real change.
 */
import { Action, Flow } from "@smthrs/flow"
import { Node, type Planned } from "@smthrs/plan"
import { Schema } from "effect"

/** Asks a person, who answers through the test's durable gate. */
export const Ask = Action.make("plan-sites/ask", {
  payload: {},
  success: Schema.Number,
  tier: "irreversible",
  idempotencyKey: "plan-sites-ask"
})

/** Doubles the answer. */
export const Double = Action.make("plan-sites/double", {
  payload: { value: Schema.Number },
  success: Schema.Number,
  idempotencyKey: "plan-sites-double-v1",
  implementationVersion: "1"
})

const then = Node.bindPlanned(Node.capture({}, (value: Planned.Planned<number>) => Double.call({ value })))
const addOne = Node.map(Node.capture({}, (value: number) => value + 1))

/** Asks, doubles the answer, and adds one. */
export const Answer = Flow.make("plan-sites/answer", {
  payload: {},
  success: Schema.Number,
  body: () => Ask.call({}).pipe(then, addOne)
})
