// D-2: this synchronous model constructor calls foreign plain Model.make and a host callback without changing its API to Effect.
import * as Model from "@smthrs/model/Model"
import { Effect, Stream } from "effect"
import type { ModelOptions } from "./TurnGate.vibe"
export const model = (inner: Model.Model, options: ModelOptions): Model.Model =>
  Model.make({
    ...(inner.providerName === undefined ? {} : { providerName: inner.providerName }),
    stream: (request) => {
      const key = options.key(request)
      return key === undefined
        ? inner.stream(request)
        : Stream.unwrap(options.gate.hold(key).pipe(Effect.as(inner.stream(request))))
    }
  })
