import { Effect } from "effect"
import * as Evaluator from "@smthrs/model/Evaluator"
import * as Model from "@smthrs/model/Model"
import { ModelRequest } from "@smthrs/model/ModelRequest"

/** Node configuration resolves the account; this adapter pins the model and sampling. */
export const seatEvaluator = (seat: { readonly modelId: string; readonly model: Model.Model }, expectedModel: string): Effect.Effect<Evaluator.Evaluator> => {
  if (seat.modelId !== expectedModel) throw new Error("Configured seat does not match policy model")
  const model = Model.make({ stream: (request) => seat.model.stream(ModelRequest.make({ ...request, params: { ...request.params, temperature: 0 } })) })
  return Effect.gen(function*() { return yield* Evaluator.Evaluator }).pipe(Effect.provide(Evaluator.layerFromSeat({ modelId: seat.modelId, model })))
}
