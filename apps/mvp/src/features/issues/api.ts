import { Context, Data, type Duration, Effect, Layer, Schema, Option, Result } from "effect"
import { Base64Url } from "effect/encoding"
import { HttpClient, HttpClientRequest } from "effect/http"
import { credentialRoute } from "../../flows/contract"
import { withBearer, withoutCookie } from "../../flows/bearer"
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

/** Routing hints only. Renewal verifies the signed token, never these client-decoded fields. */
export const renewalOf = (token: string): Option.Option<{ readonly run: string; readonly flow: string }> => {
  const payload = token.slice(0, token.lastIndexOf("."))
  const decoded = Base64Url.decodeString(payload)
  if (Result.isFailure(decoded)) return Option.none()
  const claims = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ run: Schema.String, chain: Schema.Array(Schema.String).check(Schema.isMinLength(1)) })))(decoded.success)
  return Option.map(claims, ({ run, chain }) => ({ run, flow: chain[chain.length - 1]! }))
}


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
    let authority = credential
    if (credential !== undefined) {
      const renewal = renewalOf(credential)
      if (Option.isNone(renewal)) return yield* new WriteNotTaken({ status: 403 })
      // This exchange authenticates the original person but never sends the write in their session. The server
      // reads the old signature, revocation and exact authority; the untrusted decoded run only routes the request.
      const response = yield* client.execute(HttpClientRequest.post(`${origin}${credentialRoute(renewal.value.run)}`).pipe(
        HttpClientRequest.bodyJsonUnsafe({ flow: renewal.value.flow, renew: credential }),
      )).pipe(Effect.mapError(() => new WriteNotTaken({})))
      if (response.status !== 200) return yield* new WriteNotTaken({ status: response.status })
      const body = yield* response.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ token: Schema.String }))), Effect.mapError(() => new WriteNotTaken({})))
      authority = body.token
    }
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
