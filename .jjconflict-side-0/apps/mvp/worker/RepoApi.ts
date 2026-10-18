import type { ImmutableCache } from "@smthrs/artifacts"
import type { CodeStorage } from "@smthrs/effect-code-storage"
import { ShapeProxy } from "@smthrs/effect-electric"
import { Cause, Clock, Effect, type Layer, Metric, Option, Schema } from "effect"
import { type HttpClient, HttpServerRequest, HttpServerResponse } from "effect/http"
import type { SqlClient } from "effect/sql"
import { LOCAL_ELECTRIC_URL } from "../src/features/chat/contract.ts"
import {
  cloneExecutionId,
  isFilePath,
  isRepository,
  MAX_REQUEST_BYTES,
  type Refusal,
  repoId,
  REPOS_ROUTE,
  REPOSITORIES_SHAPE_ROUTE,
  REPOSITORIES_TABLE,
  SHA_PATTERN,
} from "../src/features/repo/contract.ts"
import { Sessions } from "./Actor.ts"
import { readBounded } from "./Body.ts"
import { codeOf } from "./ErrorCode.ts"
import { FlowStarter } from "./Flows.ts"
import { Clone } from "./flows/RepoClone.ts"
import * as RepoMetrics from "./RepoMetrics.ts"
import * as RepoReads from "./RepoReads.ts"
import * as Repos from "./Repos.ts"

// RepoApi (decision 0006 §1, docs/features/repo.md#repoapi): asking for a clone, the `repositories` shape, and reading a
// cloned repository at a commit. ChatApi routes `/api/repos/*` and `/api/shapes/repositories` here. Who is asking comes
// from `Sessions`, where a clone runs from `FlowStarter` (a Durable Object in ChatApi), and the immutable cache from
// `ImmutableCache` (the Workers Cache API in ChatApi): all three are in context per request.
//
// Reading is open to everyone; cloning needs sign-in (decision 0008, "Sign-in is needed to: import"). Every input is
// bounded: the body, the owner and name, the SHA and the path.

const noStore = { "cache-control": "no-store" }
const immutable = { "cache-control": "public, max-age=31536000, immutable" }

/** A refusal: its status, `{ code }` and any extra fields, never cached. */
const refuse = (status: number, code: Refusal, extra: Record<string, number> = {}, headers: Record<string, string> = {}) =>
  HttpServerResponse.jsonUnsafe({ code, ...extra }, { status, headers: { ...noStore, ...headers } })

const CloneBody = Schema.fromJsonString(Schema.Struct({ owner: Schema.String, name: Schema.String }))
const decodeCloneBody = Schema.decodeUnknownOption(CloneBody)

/** A `/api/repos/<owner>/<name>/<kind>/<sha>[/<path>]` request, decoded, or `undefined` for any other path. */
const parseRead = (path: string) => {
  const segments = path.slice(REPOS_ROUTE.length + 1).split("/")
  const [rawOwner, rawName, rawKind, sha, ...rest] = segments
  if (rawKind !== "tree" && rawKind !== "blob") return undefined
  const kind: "tree" | "blob" = rawKind
  try {
    const owner = decodeURIComponent(rawOwner!)
    const name = decodeURIComponent(rawName!)
    const file = rest.map(decodeURIComponent).join("/")
    return { owner, name, kind, sha: sha!, file, extra: kind === "tree" ? rest.length : 0 }
  } catch {
    return undefined
  }
}

/** What RepoApi needs besides its database: the Code Storage client, when this deployment has an organization. */
export interface Options {
  readonly codeStorage: Option.Option<CodeStorage.Client>
}

/**
 * Reads the budgets and Electric's connection (`Repos.budgets`, `RepoReads.maxTreePaths`, `ShapeProxy.config`) and
 * returns RepoApi's `fetch` handler, and the reads it answers with, for the agent's flows on this host.
 */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>, options: Options) =>
  Effect.gen(function* () {
    const budgets = yield* Repos.budgets
    const maxTreePaths = yield* RepoReads.maxTreePaths
    const reads = Option.map(
      options.codeStorage,
      (codeStorage) => RepoReads.make({ codeStorage, database, budgets, maxTreePaths }),
    )
    // GET /api/shapes/repositories: Electric's `repositories`, whole, with no subset requests.
    const shape = ShapeProxy.make({
      ...(yield* ShapeProxy.config({ url: LOCAL_ELECTRIC_URL })),
      shape: { table: REPOSITORIES_TABLE },
      name: "repo.shape",
      metric: RepoMetrics.shapes,
    })

    /**
     * Starts the clone a row asks for and answers whether it did. Its execution id names the attempt's own id, so
     * starting it again changes nothing. That id never repeats, so another payload under it (`StartConflict`) is a
     * bug: the attempt settles `failed` `unavailable`, which shows Try again, rather than staying `cloning` with no
     * execution to finish it.
     */
    const start = (id: string, clone: Repos.Clone) =>
      Effect.flatMap(FlowStarter, (starter) =>
        starter.start(Clone, {
          executionId: cloneExecutionId(id, clone.cloneId),
          payload: { id, owner: clone.owner, name: clone.name, cloneId: clone.cloneId, requestedAt: clone.requestedAt },
        })).pipe(
          Effect.as(true),
          Effect.catchTag("@smthrs/mvp/flows/StartConflict", () =>
            Repos.settle({ id, cloneId: clone.cloneId }, { status: "failed", failure: "unavailable" }, budgets).pipe(
              Effect.provide(database),
              Effect.as(false),
            )),
        )

    const clone = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const startedAt = yield* Clock.currentTimeMillis
      const fields: Record<string, string | number> = {}
      /** A refusal, recorded as the request's outcome: the refusal's code unless `outcome` says otherwise. */
      const refused = (status: number, code: Refusal, outcome: string = code) => {
        fields.outcome = outcome
        return refuse(status, code)
      }
      /** A start another payload held: its attempt settled `failed`, and the request is refused as unavailable. */
      const conflicted = () => {
        fields.errorCode = "conflict"
        return refused(503, "unavailable", "conflict")
      }
      const response = yield* Effect.gen(function* () {
        if (request.method !== "POST") {
          fields.outcome = "method"
          return HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })
        }
        const actor = yield* (yield* Sessions).resolve.pipe(Effect.option)
        if (Option.isNone(actor)) return refused(503, "unavailable")
        if (Option.isNone(actor.value)) return refused(401, "authentication")
        if (Option.isNone(options.codeStorage)) return refused(503, "not_configured")
        const text = yield* readBounded(request, MAX_REQUEST_BYTES).pipe(Effect.result)
        if (text._tag === "Failure") {
          return text.failure.reason === "too_large" ? refused(413, "too_large") : refused(400, "invalid")
        }
        const body = decodeCloneBody(text.success)
        if (Option.isNone(body) || !isRepository(body.value.owner, body.value.name)) return refused(400, "invalid")
        const id = repoId(body.value.owner, body.value.name)
        fields.id = id
        yield* Effect.annotateCurrentSpan({ "smithers.repo.id": id })
        const requested = yield* Repos.request({ id, ...body.value }, budgets).pipe(Effect.provide(database))
        if (requested.kind === "limit") return refused(429, "repository_limit")
        fields.attempt = requested.attempt
        fields.cloneId = requested.cloneId
        if (requested.kind === "existing") {
          // A clone that is still running is started again with its own execution id: a start that never reached
          // its Durable Object gets there now, and one that did changes nothing.
          if (requested.status === "cloning" && !(yield* start(id, requested))) return conflicted()
          fields.outcome = "existing"
          fields.row = requested.status
          return HttpServerResponse.jsonUnsafe(
            { txid: null, id, status: requested.status },
            { status: 200, headers: noStore },
          )
        }
        if (!(yield* start(id, requested))) return conflicted()
        fields.outcome = "started"
        return HttpServerResponse.jsonUnsafe(
          { txid: requested.txid, id, attempt: requested.attempt },
          { status: 202, headers: noStore },
        )
      }).pipe(
        // Postgres or the Durable Object couldn't be reached: the row may say `cloning`, and the next request starts
        // its clone again.
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            fields.errorCode = codeOf(Cause.squash(cause))
            return refused(503, "unavailable")
          })
        ),
      )
      const outcome = String(fields.outcome)
      yield* Metric.update(Metric.withAttributes(RepoMetrics.cloneRequests, { outcome }), 1)
      yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
      yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
        "repo.clone.request",
      ).pipe(
        Effect.annotateLogs({
          ...fields,
          outcome,
          status: response.status,
          durationMs: (yield* Clock.currentTimeMillis) - startedAt,
        }),
      )
      return response
    }).pipe(Effect.withSpan("repo.clone.request", { kind: "server" }))

    /** A tree or file read: validated, answered from the cache or Code Storage, and recorded. */
    const read = (path: string) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const startedAt = yield* Clock.currentTimeMillis
        const target = parseRead(path)
        const kind = target?.kind ?? "tree"
        const fields: Record<string, string | number> = {}
        const response = yield* Effect.gen(function* () {
          if (target === undefined || !isRepository(target.owner, target.name) || target.extra > 0) {
            return refuse(404, "not_found")
          }
          if (request.method !== "GET") return HttpServerResponse.empty({ status: 405, headers: { allow: "GET" } })
          if (!SHA_PATTERN.test(target.sha)) return refuse(400, "invalid")
          if (target.kind === "blob" && !isFilePath(target.file)) return refuse(400, "invalid")
          fields.repoId = repoId(target.owner, target.name)
          fields.sha = target.sha
          if (Option.isNone(reads)) return refuse(503, "not_configured")
          const answered = target.kind === "tree"
            ? reads.value.tree(target.owner, target.name, target.sha).pipe(
              Effect.map((bytes) => {
                fields.bytes = bytes.length
                return HttpServerResponse.uint8Array(bytes, { headers: immutable, contentType: "application/json" })
              }),
            )
            : reads.value.blob(target.owner, target.name, target.sha, target.file).pipe(
              Effect.map(({ bytes, metadata }) => {
                fields.bytes = bytes.length
                return HttpServerResponse.uint8Array(bytes, {
                  headers: { ...immutable, ...(metadata.blobSha === undefined ? {} : { "x-blob-sha": metadata.blobSha }) },
                  contentType: "application/octet-stream",
                })
              }),
            )
          return yield* answered.pipe(
            Effect.catchTag("ReadRefused", (refused) => {
              fields.errorCode = refused.code
              switch (refused.code) {
                case "not_found":
                  return Effect.succeed(refuse(404, "not_found"))
                case "too_large":
                  return Effect.succeed(refuse(413, "too_large", refused.size === undefined ? {} : { size: refused.size }))
                case "capacity":
                  return Effect.succeed(refuse(503, "capacity"))
                case "unavailable":
                  return Effect.succeed(
                    refuse(
                      503,
                      "unavailable",
                      {},
                      refused.retryAfterMillis === undefined
                        ? {}
                        : { "retry-after": String(Math.max(1, Math.ceil(refused.retryAfterMillis / 1000))) },
                    ),
                  )
              }
            }),
          )
        }).pipe(
          Effect.catchDefect((defect) =>
            Effect.sync(() => {
              fields.errorCode = codeOf(defect)
              return refuse(503, "unavailable")
            })
          ),
        )
        const bytes = Number(fields.bytes ?? 0)
        yield* RepoReads.counted(kind, response.status, bytes)
        yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status, "smithers.repo.bytes": bytes })
        yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
          `repo.${kind}`,
        ).pipe(
          Effect.annotateLogs({
            ...fields,
            status: response.status,
            durationMs: (yield* Clock.currentTimeMillis) - startedAt,
          }),
        )
        return response
      }).pipe(Effect.withSpan(`repo.${parseRead(path)?.kind ?? "tree"}`, { kind: "server" }))

    const fetch: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      | HttpServerRequest.HttpServerRequest
      | HttpClient.HttpClient
      | Sessions
      | FlowStarter
      | ImmutableCache.ImmutableCache
      | R
    > = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const path = request.url.split("?")[0]!
      if (path === REPOSITORIES_SHAPE_ROUTE) return yield* shape
      if (path === REPOS_ROUTE) return yield* clone
      if (path.startsWith(`${REPOS_ROUTE}/`)) return yield* read(path)
      return HttpServerResponse.empty({ status: 404 })
    })

    return { fetch, reads }
  })
