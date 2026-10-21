import { Context, Data, type Duration, Effect, Layer, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { renewed, withBearer, withoutCookie } from "../../flows/bearer"
import { type TriageDecision, type WriteOp, writesRoute } from "./contract"
import { WriteTaken } from "./schema"

// ChatApi's writes route as the browser calls it (decision 0012 §4, docs/features/issues.md#routes), through Effect's
// HttpClient, with one deadline covering the whole exchange, its body included.

/**
 * ChatApi didn't take the write: no whole answer within the deadline, or no network (`status` absent), any status but
 * 200 and 202 (`status`), or a 200 or 202 whose body isn't the contract's.
 */
export class WriteNotTaken extends Data.TaggedError("WriteNotTaken")<{ readonly status?: number }> {}

/** A write as the route takes it. It names nobody: who acts is the session's or the run credential's to say. */
export type WriteRequest =
  | { readonly writeId: string; readonly op: "issue/commitment"; readonly number: number; readonly commitment: import("./lifecycle").Commitment }
  | { readonly writeId: string; readonly op: Extract<WriteOp, "issue/create">; readonly title: string; readonly body: string }
  | {
    readonly writeId: string
    readonly op: Extract<WriteOp, "issue/comment">
    readonly number: number
    readonly body: string
  }
  | {
    readonly writeId: string
    readonly op: Extract<WriteOp, "issue/triage">
    readonly number: number
    readonly decision: TriageDecision
    readonly reason?: string
  }
  | { readonly writeId: string; readonly op: Extract<WriteOp, "triage/run">; readonly number: number }
  | { readonly writeId: string; readonly op: Extract<WriteOp, "triage/enable">; readonly dailyTokens?: number }
  | { readonly writeId: string; readonly op: Extract<WriteOp, "triage/pause"> }

const decodeTaken = Schema.decodeUnknownEffect(WriteTaken)

/**
 * `POST /api/repos/<owner>/<name>/writes`: `202` took a new write, `200` had it already. With `credential`, the write
 * goes as the run that wrote it, with that run credential and without the session cookie (decision 0017 slice 0).
 */
export const postWrite = (
  origin: string,
  repository: { readonly owner: string; readonly name: string },
  write: WriteRequest,
  within: Duration.Input,
  credential?: string,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const request = HttpClientRequest.post(`${origin}${writesRoute(repository.owner, repository.name)}`).pipe(
      HttpClientRequest.bodyJsonUnsafe(write),
    )
    // A run's write goes with a fresh credential of that run, never in the person's session (flows/bearer.ts `renewed`).
    const authority = credential === undefined
      ? undefined
      : yield* renewed(origin, credential).pipe(
        Effect.mapError(({ status }) => new WriteNotTaken(status === undefined ? {} : { status })),
      )
    const response = yield* (authority === undefined
      ? client.execute(request)
      : withoutCookie(client.execute(withBearer(request, authority))))
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
  {
    /** Sends `write`: as the run whose `credential` it carries, else in the person's session. */
    readonly write: (
      owner: string,
      name: string,
      write: WriteRequest,
      credential?: string,
    ) => Effect.Effect<WriteTaken, WriteNotTaken>
  }
>()("@smthrs/mvp/issues/IssuesClient") {
  /** The real client: ChatApi at `origin`, with `within` for each whole request. */
  static readonly layer = (options: { readonly origin: string; readonly within: Duration.Input }) =>
    Layer.effect(
      IssuesClient,
      Effect.map(HttpClient.HttpClient, (client) =>
        IssuesClient.of({
          write: (owner, name, write, credential) =>
            postWrite(options.origin, { owner, name }, write, options.within, credential).pipe(
              Effect.provideService(HttpClient.HttpClient, client),
            ),
        })),
    )
}
