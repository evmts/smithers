import { Action, Flow } from "@smthrs/flow"
import { Node, Placement } from "@smthrs/plan"
import { Schema } from "effect"

export const SummaryPayload = {
  id: Schema.String,
  revision: Schema.String,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String.check(Schema.isMaxLength(8000)),
}
export type SummaryPayload = Schema.Struct<typeof SummaryPayload>["Type"]
export class SummaryFailed extends Schema.TaggedError<SummaryFailed>()("timeline/SummaryFailed", {
  code: Schema.Literals(["unavailable", "invalid"]),
}) {}
export const SummaryValue = Schema.Struct({ summary: Schema.String })
export const SummarizeEntry = Action.make("timeline/SummarizeEntry", {
  payload: SummaryPayload, success: SummaryValue, error: SummaryFailed, tier: "sealed",
})
export const Summarize = Flow.make("timeline/summarize", {
  description: "Summarize one conversation entry.",
  modelInvocable: false,
  payload: SummaryPayload, success: SummaryValue, error: SummaryFailed,
  body: Node.capture({ step: SummarizeEntry.name }, (payload: SummaryPayload) => SummarizeEntry.call(payload)),
}).annotate(Flow.Placement, Placement.client())
