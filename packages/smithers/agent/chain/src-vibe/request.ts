// D-2: synchronous canonical model request constructors in sibling TypeScript.
import * as ModelRequest from "@smthrs/model/ModelRequest"
import type * as Author from "../src/Author.ts"
import type { Config } from "./ModelAuthor.vibe"
export const requestForImpl = (config: Config) => (input: Author.Input): ModelRequest.ModelRequest =>
  ModelRequest.ModelRequest.make({
    modelId: config.modelId,
    system: input.prefix === "" ? [] : [ModelRequest.SystemPart.make({ text: input.prefix })],
    messages: [
      ModelRequest.Message.user(
        (input.context.length === 0 ? ["(no context was provided)"] : input.context)
          .map((text) => ModelRequest.TextPart.make({ text }))
      )
    ],
    tools: [],
    toolChoice: "none",
    params: config.params ?? ModelRequest.GenerationParams.make()
  })

