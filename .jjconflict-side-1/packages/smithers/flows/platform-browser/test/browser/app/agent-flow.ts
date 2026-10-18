/**
 * The agent flow the agent suite runs, declared once for its page and its
 * engine worker: `browser-test/Ask` calls one `AgentAction`,
 * `browser-test/Answerer`, whose answer must decode as a {@link City}.
 */
import { AgentAction } from "@smthrs/agent"
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import * as Schema from "effect/Schema"

/** The typed answer. */
export const City = Schema.Struct({ name: Schema.String, population: Schema.Number })

/** The agent: its seat is the worker's scripted model. */
export const Answerer = AgentAction.make("browser-test/Answerer", {
  payload: { question: Schema.String },
  output: City,
  seat: "scripted",
  prompt: ({ question }) => question,
  maxFrames: 4
})

/** Asks the agent one question. */
export const Ask = Flow.make("browser-test/Ask", {
  payload: { question: Schema.String },
  success: City,
  error: AgentAction.AgentFailure,
  body: Node.capture({}, ({ question }) => Answerer.call({ question }))
})
