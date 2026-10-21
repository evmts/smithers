import { Cause, Clock, Effect, type Layer, Metric, Option, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import type { HttpClient } from "effect/http"
import type { SqlClient } from "effect/sql"
import { isBranchName, MAX_TRACK_BODY_BYTES } from "../../src/features/branch/contract.ts"
import { isRepository, repoId } from "../../src/features/repo/contract.ts"
import { Sessions } from "../Actor.ts"
import { readBounded } from "../Body.ts"
import { codeOf } from "../ErrorCode.ts"
import { branchAccess, canView, isMember } from "./Access.ts"
import * as Conversations from "./Conversations.ts"
import { branchHead, defaultBranch, type Forge } from "./Forge.ts"

// `POST /api/branches` (decision 0013 §2, docs/features/branch-workspace.md#tracking-a-branch): the write path of the
// client flow `branch/track`, which a person opening a branch's page and the agent run alike. It records a branch
// GitHub already has, with its conversation, and answers both ids and what the person may do on it. A branch the app
// tracks already answers at once, to those it is shared with (worker/branch/Access.ts), and 403 to anyone else; a new
// one is read from its forge first (`Forge`), with the read credential the server holds, so a name GitHub doesn't have
// is never recorded, and becomes the Member's who tracked it, private until they share it. The repository's default
// branch is recorded `locked` (decision 0007 §5), and is the team's.

/** `POST /api/branches` requests, by `outcome`: `tracked`, `existing`, or the refusal's code. */
export const tracks = Metric.counter("smithers_branch_tracks", {
  description: "POST /api/branches requests, by outcome",
  incremental: true,
})

const TrackRequest = Schema.Struct({
  owner: Schema.String,
  name: Schema.String,
  ref: Schema.String,
}).check(
  Schema.makeFilter((request) => isRepository(request.owner, request.name) && isBranchName(request.ref)),
)
const decodeTrack = Schema.decodeUnknownEffect(Schema.fromJsonString(TrackRequest))

const noStore = { "cache-control": "no-store" }
const refusal = (status: number, code: string) => HttpServerResponse.jsonUnsafe({ code }, { status, headers: noStore })

type Fields = Record<string, string | number | boolean>

/**
 * The route over `database`, which opens a Postgres client for each request's scope. It reads who is asking from
 * `Sessions` and the branch's forge from `Forge`. Each request is one span `branch.track`, one log line `branch.track`
 * with the repository, the outcome, the status and the duration, and one count; never the branch's name.
 */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const startedAt = yield* Clock.currentTimeMillis
    const fields: Fields = {}
    const response = yield* Effect.gen(function* () {
      if (request.method !== "POST") return HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })
      const actor = yield* (yield* Sessions).resolve
      if (Option.isNone(actor)) return refusal(401, "authentication")
      const body = yield* readBounded(request, MAX_TRACK_BODY_BYTES, (bytes) => (fields.bytes = bytes)).pipe(
        Effect.result,
      )
      if (body._tag === "Failure") return refusal(body.failure.reason === "too_large" ? 413 : 400, "invalid")
      const decoded = yield* decodeTrack(body.success).pipe(Effect.option)
      if (Option.isNone(decoded)) return refusal(400, "invalid")
      const { owner, name, ref } = decoded.value
      const repo = repoId(owner, name)
      fields.repoId = repo
      const known = yield* Conversations.find(repo, ref).pipe(Effect.provide(database))
      if (known !== undefined) {
        // The branch was read a moment ago in this request, and nothing deletes a tracked branch.
        const found = (yield* branchAccess(actor, known.branchId).pipe(Effect.provide(database)))!
        if (!canView(found.access)) return refusal(403, "forbidden")
        fields.outcome = "existing"
        fields.access = found.access
        return HttpServerResponse.jsonUnsafe({ ...known, access: found.access }, { headers: noStore })
      }
      // Tracking a branch makes it the tracker's: only a Member or above may (`repo:branch-create`, decision 0007).
      if (!isMember(actor)) return refusal(403, "forbidden")
      const head = yield* branchHead({ owner, name }, ref).pipe(Effect.result)
      if (head._tag === "Failure") {
        const code = head.failure.code
        fields.forge = code
        return code === "not_found" || code === "ref_not_found" || code === "empty"
          ? refusal(404, "not_found")
          : refusal(503, "unavailable")
      }
      const remoteDefault = yield* defaultBranch({ owner, name }).pipe(Effect.option)
      const mode = Option.isSome(remoteDefault) && remoteDefault.value.branch === ref ? "locked" : "open"
      const tracked = yield* Conversations.track(repo, ref, mode, head.success, actor.value.subject.id).pipe(
        Effect.provide(database),
      )
      // Two people tracking one new branch at once: the one whose insert won owns it; the other may not see it.
      const found = (yield* branchAccess(actor, tracked.branch.branchId).pipe(Effect.provide(database)))!
      if (!canView(found.access)) return refusal(403, "forbidden")
      fields.outcome = tracked.created ? "tracked" : "existing"
      fields.mode = mode
      fields.access = found.access
      return HttpServerResponse.jsonUnsafe(
        { ...tracked.branch, access: found.access },
        { status: tracked.created ? 201 : 200, headers: noStore },
      )
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          fields.errorCode = codeOf(Cause.squash(cause))
          return refusal(503, "unavailable")
        })
      ),
    )
    fields.status = response.status
    fields.durationMs = (yield* Clock.currentTimeMillis) - startedAt
    const outcome = String(fields.outcome ?? (response.status === 405 ? "method" : codeFor(response.status)))
    yield* Metric.update(Metric.withAttributes(tracks, { outcome }), 1)
    yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status, outcome })
    yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
      "branch.track",
    ).pipe(Effect.annotateLogs({ ...fields, outcome }))
    return response
  }).pipe(Effect.withSpan("branch.track", { kind: "server" }))

/** A refusal's outcome by its status. */
const codeFor = (status: number) =>
  status === 401
    ? "authentication"
    : status === 403
    ? "forbidden"
    : status === 404
    ? "not_found"
    : status === 400 || status === 413
    ? "invalid"
    : "unavailable"

/** What the route needs from its host beyond Postgres: who is asking, the forge, and an HTTP client to reach it. */
export type Requirements = Sessions | Forge | HttpClient.HttpClient | HttpServerRequest.HttpServerRequest
