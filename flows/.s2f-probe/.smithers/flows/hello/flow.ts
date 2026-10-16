import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Effect, Schema } from "effect"
const Run = Action.make("hello/run", {
  implementationVersion: "hello/v1",
  payload: { fail: Schema.Boolean },
  success: Schema.Struct({ stdout: Schema.String }),
  error: Schema.String,
  nondeterministic: true
})
export const layer = Run.toLayer(({ fail }) => {
  process.stderr.write("child-ish log line\n")
  return fail ? Effect.fail("boom: exit 3") : Effect.succeed({ stdout: "a\nb\n" })
}, { implementationVersion: "hello/v1" })
export default Flow.make("hello", {
  description: "probe",
  capabilities: ["proc:spawn:node *"],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "pure" },
  payload: { fail: Schema.Boolean },
  success: Schema.Struct({ stdout: Schema.String }),
  error: Schema.String,
  body: Node.capture({ implementationVersion: "hello/v1" }, (input) => Run.call(input))
})
