import { Action, Flow, Interpreter, RetryPolicy } from "@smthrs/flow"
import { GitHub } from "@smthrs/integrations"
import { Node } from "@smthrs/plan"
import { Clock, Effect, Layer, Metric, Option, type Redacted, Schema } from "effect"
import { HttpClient } from "effect/http"
import { agentAttribution, type WriteFailure } from "../../src/features/issues/contract.ts"
import { codeOf } from "../ErrorCode.ts"
import type { Services } from "./Apply.ts"
import { classify, withToken } from "./Calls.ts"
import { repositoryOf } from "./Config.ts"
import * as Metrics from "./Metrics.ts"
import { fetchIssue, project } from "./Project.ts"
import * as Store from "./Store.ts"
import type { TokenUnavailable } from "./Tokens.ts"

// `github/Write { writeId }` (decision 0012 §4, docs/features/issues.md#writes): the one remote flow behind every git
// write. The writes route admitted the write and recorded it in `github_writes`; this calls GitHub once and settles the
// row and the projection together. A person's own write runs with their GitHub token, so GitHub shows them; the agent's
// runs as the App and its text says whom it acted for (§5). It runs remotely because it needs a token the person must
// not hold in the browser (decision 0011 §2).
//
//   send: token ─▶ (an earlier attempt? find our marker on GitHub; adopt it) ─▶ count the attempt ─▶ one POST
//         ─▶ read the issue back ─▶ settle `done` with the rows, in one transaction
//         GitHub refused ─▶ settle `refused`; a lost answer or an outage ─▶ retried; past the retries ─▶ settle `failed`
//
// Every created issue and comment carries `<!-- smithers:write=<id> -->`, so an attempt after a lost answer, or after a
// crash before the step sealed, finds what the first one made instead of writing it again.

/** GitHub or Postgres couldn't answer, or the answer was lost. Retried, after `retryAfterMillis`. */
export class WriteUnavailable extends Schema.TaggedError<WriteUnavailable>()("@smthrs/mvp/github/WriteUnavailable", {
  retryAfterMillis: Schema.optional(Schema.Number),
}) {}

/** 1 s doubling to a minute, for at most an hour: GitHub's rate limits and short outages pass within it. */
export const WRITE_RETRY = RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000, expirationMs: 60 * 60_000 })

/** Settling a failed write: while Postgres is unreachable, never giving up. */
export const GIVE_UP_RETRY = RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000 })

/** How far before a write's admission a marker search looks: GitHub's `since` is by update time, at a second's grain. */
export const MARKER_SLACK_MS = 60_000

const WriteRequest = { writeId: Schema.String.check(Schema.isUUID()) }

/** How the write ended. */
export const Written = Schema.Struct({
  status: Schema.Literals(["done", "refused", "failed", "missing"]),
  itemNumber: Schema.NullOr(Schema.Number),
})
export type Written = typeof Written.Type

/** The step: call GitHub once and settle. */
export const Send = Action.make("github/Write/send", {
  payload: WriteRequest,
  success: Written,
  error: WriteUnavailable,
  retryPolicy: WRITE_RETRY,
})

/** The step after the last failed attempt: settles the write `failed` `unavailable`. */
export const GiveUp = Action.make("github/Write/give-up", {
  payload: WriteRequest,
  success: Written,
  error: WriteUnavailable,
  retryPolicy: GIVE_UP_RETRY,
})

/** `github/Write`: makes one admitted git write on GitHub. */
export const Write = Flow.make("github/Write", {
  description: "Make one admitted git write on GitHub (open an issue, comment) and settle it with its rows.",
  capabilities: ["db:write:github_writes", "db:write:items", "db:write:comments"],
  modelInvocable: false,
  payload: WriteRequest,
  success: Written,
  error: WriteUnavailable,
  body: Node.capture({ send: Send.name, giveUp: GiveUp.name }, (request) =>
    Send.call(request).pipe(Node.catch({ onFailure: () => GiveUp.call(request) }))),
})

/** The wait GitHub asked for, when a failure says so. */
const retryAfter = (error: unknown): { readonly retryAfterMillis?: number } => {
  const classified = classify(error)
  return classified.kind === "retry" && classified.retryAfterMillis !== undefined
    ? { retryAfterMillis: classified.retryAfterMillis }
    : {}
}

/** What a refused token means for the write: refused for good, or tried again. */
const tokenFailure = (failure: TokenUnavailable): WriteFailure | undefined =>
  failure.reason === "sign_in_required" || failure.reason === "app_not_installed" || failure.reason === "not_allowed"
    ? failure.reason
    : undefined

/** What GitHub's refusal means for the write. A person's token GitHub won't take any more is a session to sign in again. */
const refusalOf = (status: number, token: "user" | "app"): WriteFailure =>
  status === 401
    ? token === "user" ? "sign_in_required" : "unavailable"
    : status === 404 || status === 410
    ? "not_found"
    : status === 422
    ? "invalid"
    : "not_allowed"

/** The steps over `services`, each recording what it did: never a title, a body, a login or a token. */
export const steps = <E, R>(services: Services<E, R>) => {
  const settled = (
    write: Store.Write,
    token: "user" | "app",
    settlement: Store.Settlement,
    project?: Effect.Effect<unknown, unknown, unknown>,
  ) =>
    Effect.gen(function* () {
      const fields = { writeId: write.id, op: write.op, via: write.via, token }
      const settledNow = yield* Store.settleWrite(write.id, settlement, project as Effect.Effect<unknown> | undefined)
      if (settledNow) {
        yield* Metric.update(Metric.withAttributes(Metrics.writes, { op: write.op, outcome: settlement.status, token }), 1)
        yield* Metric.update(Metric.withAttributes(Metrics.writeMs, { op: write.op }), (yield* Clock.currentTimeMillis) - write.createdAt)
      }
      yield* Effect.logWithLevel(settlement.status === "done" ? "Info" : "Warn")("github.write").pipe(
        Effect.annotateLogs({
          ...fields,
          outcome: settlement.status,
          settled: settledNow,
          ...(settlement.status === "done" ? { number: settlement.itemNumber } : { failure: settlement.failure }),
        }),
      )
      return {
        status: settlement.status,
        itemNumber: settlement.status === "done" ? settlement.itemNumber : null,
      } satisfies Written
    })

  const send = ({ writeId }: typeof Send.payloadSchema.Type) =>
    Effect.gen(function* () {
      const found = yield* Store.writeOf(writeId)
      if (Option.isNone(found)) {
        yield* Effect.logWarning("github.write").pipe(Effect.annotateLogs({ writeId, outcome: "missing" }))
        return { status: "missing", itemNumber: null } satisfies Written
      }
      const write = found.value
      // A run started again after it settled answers what it settled.
      if (write.status !== "pending") {
        return {
          status: write.status,
          itemNumber: write.status === "done" ? write.itemNumber : null,
        } satisfies Written
      }
      const repository = repositoryOf(write.repoId.replace(/^github\//, ""))
      const kind = write.via === "person" ? "user" as const : "app" as const
      const token = yield* (write.via === "person"
        ? services.tokens.forSession(write.sessionId!)
        : services.tokens.forInstallation(repository, "write")).pipe(Effect.result)
      if (token._tag === "Failure") {
        const failure = tokenFailure(token.failure)
        if (failure !== undefined) return yield* settled(write, kind, { status: "refused", failure })
        return yield* new WriteUnavailable(
          token.failure.retryAfterMillis === undefined ? {} : { retryAfterMillis: token.failure.retryAfterMillis },
        )
      }
      const body = GitHub.Issues.withWriteMarker(
        write.via === "agent" ? `${write.payload.body}\n\n${agentAttribution(write.login ?? "unknown")}` : write.payload.body,
        write.id,
      )
      const onGitHub = (accessToken: Redacted.Redacted<string>) =>
        Effect.gen(function* () {
          const since = new Date(write.createdAt - MARKER_SLACK_MS).toISOString()
          const payload = write.payload
          // An attempt before this one may have reached GitHub and lost its answer: look for our marker before writing.
          const earlier = (yield* Store.beginAttempt(write.id)) > 0
          if (payload.op === "issue/create") {
            const adopted = earlier
              ? yield* GitHub.Issues.findIssueByWrite(repository.owner, repository.name, { writeId: write.id, since })
              : Option.none()
            const issue = Option.isSome(adopted)
              ? adopted.value
              : yield* GitHub.Issues.createIssue(repository.owner, repository.name, { title: payload.title, body })
            return { number: issue.number, githubId: issue.id, adopted: Option.isSome(adopted) }
          }
          const adopted = earlier
            ? yield* GitHub.Issues.findCommentByWrite(repository.owner, repository.name, payload.number, {
              writeId: write.id,
              since,
            })
            : Option.none()
          const comment = Option.isSome(adopted)
            ? adopted.value
            : yield* GitHub.Issues.createComment(repository.owner, repository.name, payload.number, body)
          return { number: payload.number, githubId: comment.id, adopted: Option.isSome(adopted) }
        }).pipe(withToken(accessToken, services.apiBaseUrl))
      const made = yield* onGitHub(token.success).pipe(Effect.result)
      if (made._tag === "Failure") {
        const classified = classify(made.failure)
        if (classified.kind === "refused") {
          return yield* settled(write, kind, { status: "refused", failure: refusalOf(classified.status, kind) })
        }
        if (classified.kind === "unknown") {
          yield* Metric.update(Metric.withAttributes(Metrics.writeUnknown, { op: write.op }), 1)
        }
        yield* Effect.logWarning("github.write").pipe(
          Effect.annotateLogs({ writeId, op: write.op, token: kind, outcome: classified.kind, errorCode: codeOf(made.failure) }),
        )
        return yield* new WriteUnavailable(retryAfter(made.failure))
      }
      // GitHub took it: read the issue back, then settle the write with its rows in one transaction. A read-back that
      // fails is tried again; the next attempt finds the write by its marker.
      const result = made.success
      if (result.adopted) yield* Effect.annotateCurrentSpan({ "smithers.github.adopted": true })
      const fetched = yield* fetchIssue(repository, result.number).pipe(withToken(token.success, services.apiBaseUrl))
      return yield* settled(
        write,
        kind,
        { status: "done", itemNumber: result.number, githubId: result.githubId },
        project(repository, result.number, fetched),
      )
    }).pipe(
      Effect.provideService(HttpClient.HttpClient, services.http),
      Effect.provide(services.database),
      Effect.catch((error) =>
        error instanceof WriteUnavailable
          ? Effect.fail(error)
          : Effect.logWarning("github.write").pipe(
            Effect.annotateLogs({ writeId, outcome: "failed", errorCode: codeOf(error) }),
            Effect.andThen(Effect.fail(new WriteUnavailable(retryAfter(error)))),
          )
      ),
      Effect.withSpan("github.write", { attributes: { "smithers.github.write": writeId } }),
    )

  const giveUp = ({ writeId }: typeof GiveUp.payloadSchema.Type) =>
    Effect.gen(function* () {
      const found = yield* Store.writeOf(writeId)
      if (Option.isNone(found)) return { status: "missing", itemNumber: null } satisfies Written
      return yield* settled(found.value, found.value.via === "person" ? "user" : "app", {
        status: "failed",
        failure: "unavailable",
      })
    }).pipe(
      Effect.provide(services.database),
      Effect.mapError(() => new WriteUnavailable({})),
      Effect.withSpan("github.write.give_up", { attributes: { "smithers.github.write": writeId } }),
    )

  return { send, giveUp }
}

/** Registers `github/Write` with its steps over `services`. */
export const registration = <E, R>(services: Services<E, R>) => {
  const implementation = steps(services)
  return Interpreter.layerWithImplementations(
    Write,
    Layer.merge(Send.toLayer(implementation.send), GiveUp.toLayer(implementation.giveUp)),
  ).pipe(Layer.provideMerge(Action.layerImplementations))
}
