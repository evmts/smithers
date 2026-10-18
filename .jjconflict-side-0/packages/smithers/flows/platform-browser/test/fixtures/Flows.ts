/**
 * The flows the durability suites run. Every `Step` is the suite's own
 * implementation, so a suite counts, blocks or fails it.
 *
 * - `Steps`: three recorded steps.
 * - `Sleeper`: a step, a durable sleep of `pauseMs`, a step.
 * - `Waiter`: a step, then the value the `WaitFor` point `approval` receives.
 */
import { Action, Flow, Interpreter, Sleep, WaitFor } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export const Step = Action.make("browser-test/Step", {
  payload: { label: Schema.String },
  success: Schema.String
})

export const Steps = Flow.make("browser-test/Steps", {
  payload: { prefix: Schema.String },
  success: Schema.String,
  body: Node.capture({}, ({ prefix }) =>
    Step.call({ label: `${prefix}:one` }).pipe(
      Node.andThen(Step.call({ label: `${prefix}:two` })),
      Node.andThen(Step.call({ label: `${prefix}:three` }))
    ))
})

export const Sleeper = Flow.make("browser-test/Sleeper", {
  payload: { prefix: Schema.String, pauseMs: Schema.Number },
  success: Schema.String,
  error: Sleep.SleepRequestInvalid,
  body: Node.capture({}, ({ pauseMs, prefix }) =>
    Step.call({ label: `${prefix}:before` }).pipe(
      Node.andThen(Sleep.action.call({ millis: pauseMs })),
      Node.andThen(Step.call({ label: `${prefix}:after` }))
    ))
})

export const Waiter = Flow.make("browser-test/Waiter", {
  payload: { prefix: Schema.String },
  success: Schema.Json,
  error: WaitFor.WaitForRequestInvalid,
  body: Node.capture(
    {},
    ({ prefix }) =>
      Step.call({ label: `${prefix}:asked` }).pipe(Node.andThen(WaitFor.action.call({ name: "approval" })))
  )
})

/** Every flow the suites start. */
export const flows = [Steps, Sleeper, Waiter] as const

/** Registers every flow with `step` as its step implementation. */
export const registration = (step: (label: string) => Effect.Effect<string>) =>
  Layer.mergeAll(
    Step.toLayer(({ label }) => step(label)),
    Interpreter.layer(Steps, { callbackIdentity: "stable" }),
    Interpreter.layer(Sleeper, { callbackIdentity: "stable" }),
    Interpreter.layer(Waiter, { callbackIdentity: "stable" })
  ).pipe(Layer.provideMerge(Action.layerImplementations))
