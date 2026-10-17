import * as Node from "@smthrs/core/Node"
import { Flow } from "@smthrs/flow"
import * as Schema from "effect/Schema"

/** A flow discovered as the `review` command because it lives in `review/`. */
export default Flow.make("review", {
  description: "Review a pull request.",
  payload: Schema.Struct({ number: Schema.Number }),
  success: Schema.Struct({ accepted: Schema.Boolean, number: Schema.Number }),
  body: ({ number }) => Node.succeed({ accepted: true, number })
})
