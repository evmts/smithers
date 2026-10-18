/**
 * The flow the execution suites and the workerd smoke run: record the
 * question, wait `pauseMs` on a durable timer, record the answer. Each
 * `Record` step is the caller's own implementation, so a suite counts,
 * blocks, fails or aborts it.
 */
import { Action, Flow, Interpreter, Sleep } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import type * as SqlClient from "effect/sql/SqlClient"
import { CloudflareRuntime, ExecutionObject } from "../../src/index.ts"

export const Record = Action.make("cloudflare-test/Record", {
  payload: { label: Schema.String },
  success: Schema.String
})

export const Answer = Flow.make("cloudflare-test/Answer", {
  payload: { question: Schema.String, pauseMs: Schema.Number },
  success: Schema.String,
  error: Sleep.SleepRequestInvalid,
  body: Node.capture({}, ({ pauseMs, question }) =>
    Record.call({ label: `ask:${question}` }).pipe(
      Node.andThen(Sleep.action.call({ millis: pauseMs })),
      Node.andThen(Record.call({ label: "answer" }))
    ))
})

/**
 * Registers {@link Answer} with `record` as its step, through the canonical
 * composition: its stable callback identity is what lets another process,
 * the next incarnation, rebuild the same plan.
 */
export const registration = (record: (label: string) => Effect.Effect<string>) =>
  Interpreter.layerWithImplementations(Answer, Record.toLayer(({ label }) => record(label))).pipe(
    Layer.provideMerge(Action.layerImplementations)
  )

/** The runtime an alarm builds: one execution, over `database`. */
export const runtime = (options: {
  readonly hostId: string
  readonly record: (label: string) => Effect.Effect<string>
  readonly database: Layer.Layer<SqlClient.SqlClient>
}) =>
(intent: ExecutionObject.Intent) =>
  CloudflareRuntime.layer({ hostId: options.hostId, executionId: intent.executionId }, registration(options.record))
    .pipe(Layer.provide(options.database))
