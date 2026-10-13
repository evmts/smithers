import { Model, ModelError, ModelEvent, ModelRequest } from "@smthrs/model"
import { Effect, Layer, Stream } from "effect"

/**
 * One recorded provider step replayed by the fixture model.
 *
 * @category fixtures
 * @since 0.1.0
 */
export interface Step {
  readonly events: ReadonlyArray<ModelEvent.ModelEvent>
  readonly interruptAfterEvents?: boolean | undefined
  /**
   * Runs as the event at `index` leaves the provider, before anything
   * downstream reads it: where a case moves its clock to say when the event
   * arrived. A step that declares it emits its events one at a time.
   */
  readonly arriving?: ((index: number) => void) | undefined
}

/**
 * A deterministic sequence of recorded provider steps.
 *
 * @category fixtures
 * @since 0.1.0
 */
export type Script = ReadonlyArray<Step>

/**
 * Calls and requests observed by a scripted model.
 *
 * @category fixtures
 * @since 0.1.0
 */
export interface Recorder {
  readonly requests: Array<ModelRequest.ModelRequest>
}

/**
 * A scripted model together with its layer and recorder.
 *
 * @category fixtures
 * @since 0.1.0
 */
export interface Fixture {
  readonly model: Model.Model
  readonly layer: Layer.Layer<Model.Model>
  readonly recorder: Recorder
}

/**
 * A provider stream that emits progress but never records a settlement.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const midStreamInterrupt: Step = {
  events: [
    ModelEvent.ModelEvent.TextStart({
      type: "text-start",
      id: "partial"
    }),
    ModelEvent.ModelEvent.TextDelta({
      type: "text-delta",
      id: "partial",
      text: "partial"
    })
  ],
  interruptAfterEvents: true
}

/**
 * Constructs a network-free model that replays one recorded sequence per
 * request.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (script: Script): Fixture => {
  const requests: Array<ModelRequest.ModelRequest> = []
  let index = 0
  const model = Model.make({
    stream: (request) => {
      requests.push(request)
      const step = script[index++]
      if (step === undefined) {
        return Stream.fail(
          new ModelError.ModelError({
            code: "invalid_provider_output",
            message: `No scripted model step at index ${index - 1}`
          })
        )
      }
      const arriving = step.arriving
      const events = arriving === undefined
        ? Stream.fromIterable(step.events)
        : step.events.reduce<Stream.Stream<ModelEvent.ModelEvent>>(
          (stream, event, at) =>
            Stream.concat(
              stream,
              Stream.fromEffect(Effect.sync(() => {
                arriving(at)
                return event
              }))
            ),
          Stream.empty
        )
      return step.interruptAfterEvents === true
        ? Stream.concat(events, Stream.fromEffect(Effect.interrupt))
        : events
    }
  })
  return {
    model,
    layer: Model.layer(model),
    recorder: { requests }
  }
}
