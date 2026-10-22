import { ShapeProxy } from "@smthrs/effect-electric"
import { Cause, Clock, Effect, type Layer, Metric, Option, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import type { SqlClient } from "effect/sql"
import { LOCAL_ELECTRIC_URL } from "../../src/features/chat/contract.ts"
import { MAX_ISSUE_NUMBER } from "../../src/features/issues/contract.ts"
import { isRepository, REPOS_ROUTE, repoId } from "../../src/features/repo/contract.ts"
import {
  isAcceptance,
  isPrompt,
  isTitle,
  MAX_STACK_BODY_BYTES,
  MAX_TODO_NUMBER,
  REFUSAL_STATUS,
  STACK_SEGMENT,
  type StackRefusal,
  TODO_COLUMNS,
  TODO_REQUEST_COLUMNS,
  TODO_REQUESTS_SHAPE_ROUTE,
  TODO_REQUESTS_TABLE,
  TODOS_SHAPE_ROUTE,
  TODOS_TABLE,
} from "../../src/features/todos/contract.ts"
import { refusesPersonOnly, Sessions } from "../Actor.ts"
import { readBounded } from "../Body.ts"
import { codeOf } from "../ErrorCode.ts"
import * as ShapeAccess from "../ShapeAccess.ts"
import { mayChange, mayRead, mayRetryAny, viaOf } from "./Access.ts"
import * as Stack from "./Stack.ts"

// The stack's routes in ChatApi (decision 0016 §1, docs/features/todos.md#routes):
//
// - `POST /api/repos/<owner>/<name>/stack`: the one way a person, a button, a slash command, the agent or the API changes
//   a stack. Its body is a closed union of changes, admitted by sign-in, the person's role and bounds, and keyed by the
//   outbox's op id; the writer (worker/stack/Stack.ts) applies it in one transaction. A repeated op id answers what it
//   answered; another payload under it is `409 conflict`. Who acts comes from the session (`Actor.act`), never from the
//   body: only a person in person commits or drops (decision 0016 §3).
// - `GET /api/shapes/todos?repo=<owner>/<name>` and `GET /api/shapes/todo-requests?repo=...`: one repository's TODOs and
//   their prompts, for a Member or above. Signed out, `401`; no role, `403`; sessions unreadable, `503`. Never cached.
//
// Nothing here records a title, a prompt or a login: only ids, numbers, codes and durations.

/** `POST .../stack` requests, by `op` and `outcome`. */
export const requests = Metric.counter("smithers_stack_requests", {
  description: "POST /api/repos/<owner>/<name>/stack requests, by op and outcome",
  incremental: true,
})

/** Shape requests, by `status` and `live`: one counter per shape. */
export const todoShapes = Metric.counter("smithers_todo_shape_requests", {
  description: "GET /api/shapes/todos requests, by status and live",
  incremental: true,
})
export const requestShapes = Metric.counter("smithers_todo_request_shape_requests", {
  description: "GET /api/shapes/todo-requests requests, by status and live",
  incremental: true,
})

const Uuid = Schema.String.check(Schema.isUUID())
const Title = Schema.String.check(Schema.makeFilter(isTitle))
const Prompt = Schema.String.check(Schema.makeFilter(isPrompt))
const Acceptance = Schema.Array(Schema.String).check(Schema.makeFilter(isAcceptance))
const TodoNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_TODO_NUMBER }))
const IssueNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_ISSUE_NUMBER }))

/**
 * The route's body: a commit or a drop, under its op id. It names no door: who acts is the session's to say, so a body
 * that claims a `via` claims nothing.
 */
const Body = Schema.Union([
  Schema.Struct({
    opId: Uuid,
    op: Schema.Literal("commit"),
    title: Title,
    prompt: Prompt,
    acceptance: Schema.optional(Acceptance),
    issue: Schema.optional(IssueNumber),
  }),
  Schema.Struct({ opId: Uuid, op: Schema.Literals(["drop", "retry"]), number: TodoNumber }),
])
const decodeBody = Schema.decodeUnknownOption(Schema.fromJsonString(Body))

/** A stack route's repository, from `/api/repos/<owner>/<name>/stack`; none for any other path. */
export const parseStackPath = (path: string): { readonly owner: string; readonly name: string } | undefined => {
  if (!path.startsWith(`${REPOS_ROUTE}/`)) return undefined
  const segments = path.slice(REPOS_ROUTE.length + 1).split("/")
  if (segments.length !== 3 || segments[2] !== STACK_SEGMENT) return undefined
  try {
    const owner = decodeURIComponent(segments[0]!)
    const name = decodeURIComponent(segments[1]!)
    return isRepository(owner, name) ? { owner, name } : undefined
  } catch {
    return undefined
  }
}

/** Whether a path is one of the stack's routes. */
export const handles = (path: string): boolean =>
  path === TODOS_SHAPE_ROUTE || path === TODO_REQUESTS_SHAPE_ROUTE || parseStackPath(path) !== undefined

/** What a shape filters on when its `repo` isn't a repository: no repository's id, so it holds no rows. */
const NO_REPOSITORY = "-"

/** The repository a shape request names in `?repo=<owner>/<name>`: its id, or `NO_REPOSITORY`. */
const repositoryOf = (url: string): string => {
  const [owner = "", name = "", ...rest] = (new URL(url, "http://localhost").searchParams.get("repo") ?? "").split("/")
  return rest.length === 0 && isRepository(owner, name) ? repoId(owner, name) : NO_REPOSITORY
}

const noStore = { "cache-control": "no-store" }
const refusal = (status: number, code: StackRefusal) =>
  HttpServerResponse.jsonUnsafe({ code }, { status, headers: noStore })

/**
 * Reads Electric's connection and returns the stack's routes over `database`, which opens a Postgres client for each
 * request's scope. They read who is asking from `Sessions`; a host that runs TODOs provides `Stack.TodoRuns`.
 */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const connection = yield* ShapeProxy.config({ url: LOCAL_ELECTRIC_URL })

    /** A shape of one repository's rows of `table`, for a Member or above. */
    const shape = (table: string, columns: ReadonlyArray<string>, name: string, metric: Metric.Counter<number>) =>
      ShapeProxy.make({
        ...connection,
        shape: Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const actor = yield* ShapeAccess.actor
          if (Option.isNone(actor)) return yield* new ShapeProxy.Refused({ status: 401 })
          if (!mayRead(actor)) return yield* new ShapeProxy.Refused({ status: 403 })
          return { table, where: "repo_id = $1", params: { "1": repositoryOf(request.url) }, columns }
        }),
        name,
        metric,
      })
    const todos = shape(TODOS_TABLE, TODO_COLUMNS, "stack.shape.todos", todoShapes)
    const todoRequests = shape(TODO_REQUESTS_TABLE, TODO_REQUEST_COLUMNS, "stack.shape.todo_requests", requestShapes)

    /** `POST /api/repos/<owner>/<name>/stack`. */
    const change = (target: { readonly owner: string; readonly name: string }) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const runs = yield* Effect.serviceOption(Stack.TodoRuns)
        const startedAt = yield* Clock.currentTimeMillis
        const fields: Record<string, string | number> = {}
        const refused = (code: StackRefusal) => {
          fields.outcome = code
          return refusal(REFUSAL_STATUS[code], code)
        }
        const response = yield* Effect.gen(function* () {
          if (request.method !== "POST") {
            fields.outcome = "method"
            return HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })
          }
          const actor = yield* (yield* Sessions).resolve.pipe(Effect.option)
          if (Option.isNone(actor)) return refused("unavailable")
          if (Option.isNone(actor.value)) return refused("authentication")
          const who = actor.value.value
          const text = yield* readBounded(request, MAX_STACK_BODY_BYTES, (bytes) => (fields.bytes = bytes)).pipe(
            Effect.result,
          )
          if (text._tag === "Failure") return refused(text.failure.reason === "too_large" ? "too_large" : "invalid")
          const body = decodeBody(text.success)
          if (Option.isNone(body)) return refused("invalid")
          const admitted = body.value
          const via = viaOf(who)
          fields.op = admitted.op
          fields.via = via
          fields.opId = admitted.opId.toLowerCase()
          // Committing and dropping are the person's presses: anyone acting for them is refused, and counted as such
          // (decision 0017 slice 0).
          const act = admitted.op === "commit" ? "todo/commit" : "todo/drop"
          if (admitted.op !== "retry" && (yield* refusesPersonOnly(who, act))) return refused("forbidden")
          if (admitted.op === "retry" ? !mayRead(Option.some(who)) : !mayChange(who)) return refused("forbidden")
          let stoppedAttemptId: string | undefined
          if (admitted.op === "retry" && Option.isSome(runs) && runs.value.isStopped !== undefined) {
            const candidate = yield* Stack.retryCandidate(repoId(target.owner, target.name), admitted.number).pipe(Effect.provide(database))
            if (candidate !== undefined && (yield* runs.value.isStopped(candidate))) stoppedAttemptId = candidate
          }
          const applied = yield* Stack.apply(
            {
              opId: admitted.opId.toLowerCase(),
              repoId: repoId(target.owner, target.name),
              actor: { id: who.subject.id, login: who.login ?? who.subject.id },
              via,
              retryAny: mayRetryAny(who),
              op: admitted.op === "commit"
                ? {
                  kind: "commit",
                  title: admitted.title.trim(),
                  prompt: admitted.prompt,
                  acceptance: admitted.acceptance ?? [],
                  ...(admitted.issue === undefined ? {} : { issue: admitted.issue }),
                }
                : { kind: admitted.op, number: admitted.number },
            },
            { runs: Option.isSome(runs), ...(stoppedAttemptId === undefined ? {} : { stoppedAttemptId }) },
          ).pipe(Effect.provide(database), Effect.catchTag("@smthrs/mvp/stack/RetryForbidden", () => Effect.succeed({ kind: "forbidden" as const })))
          if (applied.kind === "forbidden") return refused("forbidden")
          if (applied.kind === "conflict") return refused("conflict")
          const receipt = applied.receipt
          if (Stack.isRefusal(receipt.outcome)) return refused(receipt.outcome)
          // A repeated op starts and stops the same runs again, which changes nothing, so a start an earlier answer
          // never made gets made now.
          if (Option.isSome(runs)) {
            const handed = yield* (receipt.stopped === undefined ? Effect.void : runs.value.stop(receipt.stopped)).pipe(
              Effect.andThen(Effect.forEach(receipt.starts, (start) => runs.value.start(start), { discard: true })),
              Effect.result,
            )
            if (handed._tag === "Failure") {
              fields.errorCode = handed.failure.errorCode
              return refused("unavailable")
            }
          }
          fields.outcome = applied.kind === "applied" ? receipt.outcome : "repeated"
          fields.number = receipt.number!
          return HttpServerResponse.jsonUnsafe(
            {
              txid: applied.kind === "applied" ? applied.txid : null,
              opId: admitted.opId.toLowerCase(),
              outcome: receipt.outcome,
              number: receipt.number,
            },
            { status: applied.kind === "applied" ? 202 : 200, headers: noStore },
          )
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              fields.errorCode = codeOf(Cause.squash(cause))
              return refused("unavailable")
            })
          ),
        )
        const outcome = String(fields.outcome)
        fields.status = response.status
        fields.durationMs = (yield* Clock.currentTimeMillis) - startedAt
        yield* Metric.update(Metric.withAttributes(requests, { op: String(fields.op ?? "unknown"), outcome }), 1)
        yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status, outcome })
        yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
          "stack.request",
        ).pipe(Effect.annotateLogs({ ...fields, outcome }))
        return response
      }).pipe(Effect.withSpan("stack.request", { kind: "server" }))

    const fetch = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const path = request.url.split("?")[0]!
      if (path === TODOS_SHAPE_ROUTE) return yield* todos
      if (path === TODO_REQUESTS_SHAPE_ROUTE) return yield* todoRequests
      const target = parseStackPath(path)
      return target === undefined ? HttpServerResponse.empty({ status: 404 }) : yield* change(target)
    })
    return { fetch }
  })
