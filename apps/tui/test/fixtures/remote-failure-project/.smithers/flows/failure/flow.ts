import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"

/** Real local failures: the engine must encode these and the control watch must relay them. */
export default Flow.make("failure", {
  description: "Failure fixture",
  capabilities: [],
  payload: { error: Schema.Unknown, unencodable: Schema.optional(Schema.Boolean) },
  success: Schema.String,
  error: Schema.Unknown,
  body: ({ error, unencodable }) => Node.fail(unencodable ? new Error(String(error)) : error)
})
