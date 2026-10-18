---
"@smthrs/agent": minor
---

`ModelStep.model` turns a model and its route into a `Model` whose every call
is one sealed `ModelStep.run` of the running flow. Code that takes a `Model`
and calls it itself, such as `Evaluator.layerFromSeat`, now judges with sealed,
replayable calls instead of streaming the seat directly.

```ts
const model = yield* ModelStep.model({ name: "jev/classify/model", model: seat, route })
const answers = yield* classifier.evaluate(state).pipe(
  Effect.provide(Evaluator.layerFromSeat({ modelId: "judge", model }))
)
```
