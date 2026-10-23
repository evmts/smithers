import { Context, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, type HttpClientError, type HttpClientResponse } from "effect/http"
import { PIN_ROUTE } from "./contract"

/** Captures the host's authenticated client before a run adds its own services. */
export class PinClient extends Context.Service<PinClient, {
  readonly post: (payload: Readonly<Record<string, unknown>>, stamping: boolean) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
}>()("@smthrs/mvp/pins/PinClient") {
  static readonly layer = (origin: string) => Layer.effect(PinClient, Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return PinClient.of({ post: (payload, stamping) => client.execute(HttpClientRequest.post(`${origin}${PIN_ROUTE}${stamping ? "/stamp" : ""}`).pipe(HttpClientRequest.bodyJsonUnsafe(payload))) })
  }))
}
