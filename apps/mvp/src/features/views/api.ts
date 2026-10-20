import { Context, Data, type Duration, Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { VIEWS_ROUTE } from "./contract"
import { ViewAdded, ViewRefusal, type ViewWrite } from "./schema"

// ChatApi's `POST /api/views` as a flow step calls it (docs/features/web-pages.md#the-views-table), through Effect's
// HttpClient, with one deadline covering the whole exchange.

/**
 * ChatApi didn't add the view: no whole answer within the deadline, or no network (`status` absent), or a refusal
 * (`status`, with ChatApi's `code` when its body had one).
 */
export class ViewRefused extends Data.TaggedError("ViewRefused")<{ readonly status?: number; readonly code?: string }> {}

/** How long a step gives ChatApi to add a view. */
export const ADD_WITHIN = "15 seconds"

const decodeRefusal = Schema.decodeUnknownOption(Schema.fromJsonString(ViewRefusal))
const decodeAdded = Schema.decodeUnknownEffect(ViewAdded)

/** Adds views to the conversation through ChatApi on `origin`. */
export class ViewsClient extends Context.Service<
  ViewsClient,
  { readonly add: (write: ViewWrite) => Effect.Effect<void, ViewRefused> }
>()("@smthrs/mvp/views/ViewsClient") {
  /** The client over the host's `HttpClient`: `202` added the view, `200` had it already; anything else is refused. */
  static readonly layer = (options: { readonly origin: string; readonly within?: Duration.Input }) =>
    Layer.effect(
      ViewsClient,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        return ViewsClient.of({
          add: Effect.fn("chat.view.post")(function* (write) {
            const response = yield* client.execute(
              HttpClientRequest.post(`${options.origin}${VIEWS_ROUTE}`).pipe(HttpClientRequest.bodyJsonUnsafe(write)),
            ).pipe(Effect.mapError(() => new ViewRefused({})))
            yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
            if (response.status !== 200 && response.status !== 202) {
              const body = decodeRefusal(yield* Effect.orElseSucceed(response.text, () => ""))
              return yield* new ViewRefused({
                status: response.status,
                ...Option.match(body, { onNone: () => ({}), onSome: ({ code }) => ({ code }) }),
              })
            }
            yield* response.json.pipe(
              Effect.flatMap(decodeAdded),
              Effect.mapError(() => new ViewRefused({ status: response.status })),
            )
          }, (effect) =>
            // Interrupting the request aborts its fetch, so a stalled body stops too.
            Effect.timeoutOrElse(effect, {
              duration: options.within ?? ADD_WITHIN,
              orElse: () => Effect.fail(new ViewRefused({})),
            })),
        })
      }),
    )
}
