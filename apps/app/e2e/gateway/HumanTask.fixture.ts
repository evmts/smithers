import { Flow, HumanTask } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
export default Flow.make("ops-l7-e1", {
  description: "L7 temporary local gateway question.",
  capabilities: [],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "reversible" },
  payload: {},
  success: Schema.Json,
  error: HumanTask.HumanTaskFailed,
  body: Node.capture({}, () => HumanTask.action.call({
    name: "l7/answer", kind: "json", prompt: "Which gateway answered?",
    schema: { type: "object", properties: { choice: { type: "string", enum: ["loopback"] } }, required: ["choice"] }
  }))
})
