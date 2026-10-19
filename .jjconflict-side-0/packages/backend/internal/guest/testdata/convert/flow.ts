/** Fixed sponsored conversion; the host supplies the credentialed activity. */
import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"

const Input = Schema.Struct({
  source: Schema.String,
  idempotencyKey: Schema.String,
  sourceLabel: Schema.Literals(["hn", "x", "discord", "telegram", "share", "direct", "other"])
})
const Diagnostic = Schema.Struct({ line: Schema.Number, column: Schema.Number, code: Schema.String, message: Schema.String })
const Receipt = Schema.Struct({ inputSha: Schema.String, outputSha: Schema.String, compilerDigest: Schema.String, dependenciesDigest: Schema.String, signature: Schema.String })
const Result = Schema.Struct({
  state: Schema.Literals(["compiled", "diagnostics", "refused", "failed"]),
  effeck: Schema.optional(Schema.String), diagnostics: Schema.optional(Schema.Array(Diagnostic)),
  effeckVersion: Schema.String, refusal: Schema.optional(Schema.String), receipt: Schema.optional(Receipt)
})
const Convert = Action.make("guest/convert.v1", {
  implementationVersion: "convert.v1", payload: Input, success: Result, nondeterministic: true
})
export default Flow.make("convert", {
  description: "Convert Effect code and check it with effeck.compile.",
  capabilities: ["guest:convert"],
  effects: { reads: [".smithers/flows/convert/prompt.md"], writes: [], mode: "expected", onConflict: "serialize", tier: "irreversible" },
  modelInvocable: true, payload: Input, success: Result,
  body: Node.capture({}, input => Convert.call(input))
})
