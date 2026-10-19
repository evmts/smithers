import { Flow, HumanTask } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
export default Flow.make("local-gateway-question", {
  description: "A local gateway question.",
  capabilities: [],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" },
  payload: {},
  success: Schema.Json,
  error: HumanTask.HumanTaskFailed,
  body: Node.capture({}, () => HumanTask.action.call({
    name: "gateway/answer", kind: "json", prompt: "Which gateway answered?",
    schema: { type: "object", properties: { choice: { type: "string", enum: ["loopback"] } }, required: ["choice"] }
  }))
})
