import { Context, Data, type Duration, Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { BRANCHES_ROUTE, type Refusal } from "./contract"
import { Refused, Tracked } from "./schema"

// ChatApi's `POST /api/branches` as `branch/track`'s step calls it (docs/features/branch-workspace.md#tracking-a-branch),
// through Effect's HttpClient, with one deadline covering the whole exchange.

/** ChatApi didn't track the branch: a refusal (`status`, with its `code`), or no whole answer in time (neither). */
export class TrackRefused extends Data.TaggedError("TrackRefused")<{
  readonly status?: number
  readonly code?: Refusal
}> {}

/** How long a step gives ChatApi to track a branch: a new one is read from GitHub first. */
export const TRACK_WITHIN = "20 seconds"

const decodeRefused = Schema.decodeUnknownOption(Schema.fromJsonString(Refused))
const decodeTracked = Schema.decodeUnknownEffect(Tracked)

/** Tracks branches through ChatApi on `origin`. */
export class BranchClient extends Context.Service<
  BranchClient,
  {
    readonly track: (branch: {
      readonly owner: string
      readonly name: string
      readonly ref: string
    }) => Effect.Effect<Tracked, TrackRefused>
  }
>()("@smthrs/mvp/branch/BranchClient") {
  /** The client over the host's `HttpClient`: `200` or `201` with the branch; anything else is refused. */
  static readonly layer = (options: { readonly origin: string; readonly within?: Duration.Input }) =>
    Layer.effect(
      BranchClient,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        return BranchClient.of({
          track: Effect.fn("branch.track.post")(function* (branch) {
            const response = yield* client.execute(
              HttpClientRequest.post(`${options.origin}${BRANCHES_ROUTE}`).pipe(HttpClientRequest.bodyJsonUnsafe(branch)),
            ).pipe(Effect.mapError(() => new TrackRefused({})))
            yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
            if (response.status !== 200 && response.status !== 201) {
              const body = decodeRefused(yield* Effect.orElseSucceed(response.text, () => ""))
              return yield* new TrackRefused({
                status: response.status,
                ...Option.match(body, { onNone: () => ({}), onSome: ({ code }) => ({ code }) }),
              })
            }
            return yield* response.json.pipe(
              Effect.flatMap(decodeTracked),
              Effect.mapError(() => new TrackRefused({ status: response.status })),
            )
          }, (effect) =>
            // Interrupting the request aborts its fetch, so a stalled body stops too.
            Effect.timeoutOrElse(effect, {
              duration: options.within ?? TRACK_WITHIN,
              orElse: () => Effect.fail(new TrackRefused({})),
            })),
        })
      }),
    )
}
