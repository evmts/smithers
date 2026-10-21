import { Context, Data, type Duration, Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { ACK_ROUTE, ATTENTION_WITHIN, WATCHES_ROUTE } from "./contract"
import { type AckRequest, Refusal, Written } from "./schema"

// ChatApi's feed routes as a flow step calls them (docs/features/notifications.md#the-routes), through Effect's
// HttpClient, with one deadline covering the whole exchange.

/**
 * ChatApi didn't take the write: no whole answer within the deadline, or no network (`status` absent), or a refusal
 * (`status`, with ChatApi's `code` when its body had one).
 */
export class AttentionRefused extends Data.TaggedError("AttentionRefused")<{
  readonly status?: number
  readonly code?: string
}> {}

const decodeRefusal = Schema.decodeUnknownEffect(Refusal)
const decodeWritten = Schema.decodeUnknownEffect(Written)

/** The feed's routes on ChatApi at `origin`. */
export class AttentionClient extends Context.Service<
  AttentionClient,
  {
    /** `POST /api/watches`: follow the branch and repository of conversation `conversationId`, `null` the home one. */
    readonly watch: (conversationId: string | null) => Effect.Effect<void, AttentionRefused>
    /** `POST /api/notifications/ack`: Read, Dismiss or Hide one notification at a version. */
    readonly ack: (request: AckRequest) => Effect.Effect<void, AttentionRefused>
  }
>()("@smthrs/mvp/attention/AttentionClient") {
  /** The client over the host's `HttpClient`: a `200` took the write; anything else is refused. */
  static readonly layer = (options: { readonly origin: string; readonly within?: Duration.Input }) =>
    Layer.effect(
      AttentionClient,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const post = (path: string, body: unknown) =>
          Effect.gen(function* () {
            const response = yield* client.execute(
              HttpClientRequest.post(`${options.origin}${path}`).pipe(HttpClientRequest.bodyJsonUnsafe(body)),
            ).pipe(Effect.mapError(() => new AttentionRefused({})))
            yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
            if (response.status !== 200) {
              const refusal = yield* response.json.pipe(Effect.flatMap(decodeRefusal), Effect.option)
              return yield* new AttentionRefused({
                status: response.status,
                ...Option.match(refusal, { onNone: () => ({}), onSome: ({ code }) => ({ code }) }),
              })
            }
            yield* response.json.pipe(
              Effect.flatMap(decodeWritten),
              Effect.mapError(() => new AttentionRefused({ status: response.status })),
            )
          }).pipe((effect) =>
            // Interrupting the request aborts its fetch, so a stalled body stops too.
            Effect.timeoutOrElse(effect, {
              duration: options.within ?? ATTENTION_WITHIN,
              orElse: () => Effect.fail(new AttentionRefused({})),
            })
          )
        return AttentionClient.of({
          watch: (conversationId) =>
            post(WATCHES_ROUTE, { conversationId }).pipe(Effect.withSpan("notifications.watch", { kind: "client" })),
          ack: (request) => post(ACK_ROUTE, request).pipe(Effect.withSpan("notifications.ack", { kind: "client" })),
        })
      }),
    )
}
