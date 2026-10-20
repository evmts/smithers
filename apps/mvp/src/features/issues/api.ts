import { Context, Data, type Duration, Effect, Layer, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { type WriteOp, writesRoute, type WriteVia } from "./contract"
import { WriteTaken } from "./schema"

// ChatApi's writes route as the browser calls it (decision 0012 §4, docs/features/issues.md#routes), through Effect's
// HttpClient, with one deadline covering the whole exchange, its body included.

/**
 * ChatApi didn't take the write: no whole answer within the deadline, or no network (`status` absent), any status but
 * 200 and 202 (`status`), or a 200 or 202 whose body isn't the contract's.
 */
export class WriteNotTaken extends Data.TaggedError("WriteNotTaken")<{ readonly status?: number }> {}

/** A write as the route takes it. */
export type WriteRequest =
  | {
    readonly writeId: string
    readonly via: WriteVia
    readonly op: Extract<WriteOp, "issue/create">
    readonly title: string
    readonly body: string
  }
  | {
    readonly writeId: string
    readonly via: WriteVia
    readonly op: Extract<WriteOp, "issue/comment">
    readonly number: number
    readonly body: string
  }

const decodeTaken = Schema.decodeUnknownEffect(WriteTaken)

/** `POST /api/repos/<owner>/<name>/writes`: `202` took a new write, `200` had it already. */
export const postWrite = (
  origin: string,
  repository: { readonly owner: string; readonly name: string },
  write: WriteRequest,
  within: Duration.Input,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client
      .execute(
        HttpClientRequest.post(`${origin}${writesRoute(repository.owner, repository.name)}`).pipe(
          HttpClientRequest.bodyJsonUnsafe(write),
        ),
      )
      .pipe(Effect.mapError(() => new WriteNotTaken({})))
    yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
    if (response.status !== 200 && response.status !== 202) return yield* new WriteNotTaken({ status: response.status })
    return yield* response.json.pipe(
      Effect.flatMap(decodeTaken),
      Effect.mapError(() => new WriteNotTaken({ status: response.status })),
    )
  }).pipe(
    // Interrupting the request aborts its fetch, so a stalled body stops too.
    Effect.timeoutOrElse({ duration: within, orElse: () => Effect.fail(new WriteNotTaken({})) }),
  )

/**
 * ChatApi's writes route, as a service: the one way the browser sends a git write. Tests of a route that fails provide
 * a faulty one; every other test uses the real one.
 */
export class IssuesClient extends Context.Service<
  IssuesClient,
  { readonly write: (owner: string, name: string, write: WriteRequest) => Effect.Effect<WriteTaken, WriteNotTaken> }
>()("@smthrs/mvp/issues/IssuesClient") {
  /** The real client: ChatApi at `origin`, with `within` for each whole request. */
  static readonly layer = (options: { readonly origin: string; readonly within: Duration.Input }) =>
    Layer.effect(
      IssuesClient,
      Effect.map(HttpClient.HttpClient, (client) =>
        IssuesClient.of({
          write: (owner, name, write) =>
            postWrite(options.origin, { owner, name }, write, options.within).pipe(
              Effect.provideService(HttpClient.HttpClient, client),
            ),
        })),
    )
}
