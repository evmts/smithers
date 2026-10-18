import * as Evaluator from "@smthrs/model/Evaluator"
import * as Model from "@smthrs/model/Model"
import { ModelRequest } from "@smthrs/model/ModelRequest"
import { Effect } from "effect"

/** Node configuration resolves the account; this adapter pins the model and sampling. */
export const seatEvaluator = (
  seat: { readonly modelId: string; readonly model: Model.Model; readonly id?: string },
  expectedModel: string,
  engine?: "claude" | "codex"
): Effect.Effect<Evaluator.Evaluator> => {
  if (seat.modelId !== expectedModel) throw new Error("Configured seat does not match policy model")
  if (engine !== undefined) {
    const provider = seat.id?.split(":")[0]
    const actual = provider === "anthropic" || provider === "claude"
      ? "claude"
      : provider === "openai" || provider === "codex"
      ? "codex"
      : undefined
    if (actual !== engine) throw new Error("Configured seat does not match policy engine")
  }
  const model = Model.make({
    stream: (request) =>
      seat.model.stream(ModelRequest.make({ ...request, params: { ...request.params, temperature: 0 } }))
  })
  return Effect.gen(function*() {
    return yield* Evaluator.Evaluator
  }).pipe(Effect.provide(Evaluator.layerFromSeat({ modelId: seat.modelId, model })))
}
