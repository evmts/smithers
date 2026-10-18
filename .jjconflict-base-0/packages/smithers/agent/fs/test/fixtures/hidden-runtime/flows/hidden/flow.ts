import * as Node from "@smthrs/core/Node"
import { Flow } from "@smthrs/flow"
import * as Schema from "effect/Schema"

export default Flow.make("hidden", {
  description: "A flow its author hid from models",
  modelInvocable: false,
  payload: Schema.Struct({
    number: Schema.Number
  }),
  success: Schema.Struct({
    number: Schema.Number
  }),
  body: ({ number }) => Node.succeed({ number })
})
