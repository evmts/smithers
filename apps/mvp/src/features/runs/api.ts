import { BrowserEngine } from "@smthrs/platform-browser"
import { Context, Data, type Duration, Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { remoteRunRoute } from "./contract"
import type { Inspection } from "./schema"

// ChatApi's remote runs route as the browser calls it (ruling TODO-3, docs/features/runs.md#a-run-on-cloudflare): a run
// Smithers runs on Cloudflare, as the engine's `RunInspection` reads it there, through Effect's HttpClient with one
// deadline over the whole exchange, decoded with the engine's own wire shape (`BrowserEngine.Inspection`).

/**
 * ChatApi didn't answer with the run: no whole answer within the deadline, or no network (`status` absent), any status
 * but 200 (`status`, and the refusal's `code` when its body names one), or a 200 whose body isn't a run.
 */
export class RemoteReadFailed extends Data.TaggedError("RemoteReadFailed")<{
  readonly status?: number
  readonly code?: string
}> {}

const decodeInspection = Schema.decodeUnknownEffect(BrowserEngine.Inspection)
const decodeRefusal = Schema.decodeUnknownOption(Schema.Struct({ code: Schema.String }))

/** `GET /api/remote-runs/<runId>?afterSeq=&limit=`. */
export const getRun = (
  origin: string,
  runId: string,
  options: { readonly afterSeq?: number; readonly limit?: number },
  within: Duration.Input,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const query = new URLSearchParams()
    if (options.afterSeq !== undefined) query.set("afterSeq", String(options.afterSeq))
    if (options.limit !== undefined) query.set("limit", String(options.limit))
    const search = query.size === 0 ? "" : `?${query}`
    const response = yield* client
      .execute(HttpClientRequest.get(`${origin}${remoteRunRoute(runId)}${search}`))
      .pipe(Effect.mapError(() => new RemoteReadFailed({})))
    yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
    if (response.status !== 200) {
      const refused = yield* response.json.pipe(Effect.option, Effect.map(Option.flatMap(decodeRefusal)))
      return yield* new RemoteReadFailed({
        status: response.status,
        ...(Option.isSome(refused) ? { code: refused.value.code } : {}),
      })
    }
    return yield* response.json.pipe(
      Effect.flatMap(decodeInspection),
      Effect.mapError(() => new RemoteReadFailed({ status: response.status })),
    )
  }).pipe(
    // Interrupting the request aborts its fetch, so a stalled body stops too.
    Effect.timeoutOrElse({ duration: within, orElse: () => Effect.fail(new RemoteReadFailed({})) }),
    Effect.withSpan("run.read.remote"),
  )

/**
 * ChatApi's remote runs route, as a service: how this tab reads a run Smithers runs on Cloudflare. Tests of a route that
 * fails provide a faulty one; every other test uses the real one.
 */
export class RemoteRunsClient extends Context.Service<
  RemoteRunsClient,
  {
    readonly inspect: (
      runId: string,
      options?: { readonly afterSeq?: number; readonly limit?: number },
    ) => Effect.Effect<Inspection, RemoteReadFailed>
  }
>()("@smthrs/mvp/runs/RemoteRunsClient") {
  /** The real client: ChatApi at `origin`, with `within` for each whole request. */
  static readonly layer = (options: { readonly origin: string; readonly within: Duration.Input }) =>
    Layer.effect(
      RemoteRunsClient,
      Effect.map(HttpClient.HttpClient, (client) =>
        RemoteRunsClient.of({
          inspect: (runId, read = {}) =>
            getRun(options.origin, runId, read, options.within).pipe(Effect.provideService(HttpClient.HttpClient, client)),
        })),
    )
}
