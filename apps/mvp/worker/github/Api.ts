import { digestSync } from "@smthrs/crypto"
import { ShapeProxy } from "@smthrs/effect-electric"
import { Core } from "@smthrs/integrations"
import { Cause, Clock, Effect, type Layer, Metric, Option, Redacted, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import type { SqlClient } from "effect/sql"
import { LOCAL_ELECTRIC_URL } from "../../src/features/chat/contract.ts"
import {
  applyExecutionId,
  COMMENT_COLUMNS,
  COMMENTS_SHAPE_ROUTE,
  COMMENTS_TABLE,
  GITHUB_WEBHOOK_ROUTE,
  ISSUES_STREAM,
  ITEM_COLUMNS,
  ITEMS_SHAPE_ROUTE,
  ITEMS_TABLE,
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_WEBHOOK_BYTES,
  MAX_WRITE_BYTES,
  reconcileExecutionId,
  SYNC_COLUMNS,
  SYNC_SHAPE_ROUTE,
  SYNC_STALE_MS,
  SYNC_TABLE,
  WRITE_COLUMNS,
  WRITE_VIAS,
  writeExecutionId,
  type WriteRefusal,
  WRITES_SEGMENT,
  WRITES_SHAPE_ROUTE,
  WRITES_TABLE,
} from "../../src/features/issues/contract.ts"
import { REPOS_ROUTE, repoId } from "../../src/features/repo/contract.ts"
import { canAsk, Sessions } from "../Actor.ts"
import { readBounded } from "../Body.ts"
import { codeOf } from "../ErrorCode.ts"
import { FlowStarter } from "../Flows.ts"
import * as ShapeAccess from "../ShapeAccess.ts"
import { Apply } from "./Apply.ts"
import type { GitHubApp, Repository } from "./Config.ts"
import * as Metrics from "./Metrics.ts"
import { Reconcile } from "./Reconcile.ts"
import * as Store from "./Store.ts"
import { Write } from "./Write.ts"

// The git loop's routes in ChatApi (decision 0012 §2 and §4, docs/features/issues.md#routes):
// - `POST /api/github/webhook`: GitHub's webhook. Verified with `X-Hub-Signature-256` (`Core.Channel` from
//   `@smthrs/integrations`), it starts `github/Apply` for the issue it names, one execution per delivery, and records
//   the delivery; it never writes a row itself. A payload names a subject; it never sets state.
// - `POST /api/repos/<owner>/<name>/writes`: the one door every git write goes through. It checks sign-in, the role,
//   the App, the repository, the bounds and the payload's hash, records the write, and starts `github/Write` keyed by
//   the device's write id. The settled row is the result; nothing waits on the remote run.
// - `GET /api/shapes/{items,comments,github-sync}`: the synced repository's rows, each with its column list, for a
//   signed-in person with a role on it, or for anyone once GitHub said the repository is public. A read of `items`
//   that finds the sync older than 5 minutes starts `github/Reconcile` without waiting.
// - `GET /api/shapes/github-writes`: the signed-in person's own writes, their status only.
// G0 syncs one repository, `GITHUB_REPOSITORY`, the one sign-in reads roles on (decision 0012, Consequences).

const noStore = { "cache-control": "no-store" }

const refuse = (status: number, code: WriteRefusal | "not_configured" | "invalid_signature") =>
  HttpServerResponse.jsonUnsafe({ code }, { status, headers: noStore })

/** No person's id: what a signed-out writes shape filters on, so it holds no rows. */
const NOBODY = ""

const WriteId = Schema.String.check(Schema.isUUID())
const Via = Schema.Literals(WRITE_VIAS)
const Title = Schema.String.check(
  Schema.makeFilter((value: string) => value.trim().length > 0 && value.length <= MAX_TITLE_LENGTH),
)
const IssueBody = Schema.String.check(Schema.isMaxLength(MAX_BODY_LENGTH))
const CommentBody = Schema.String.check(
  Schema.makeFilter((value: string) => value.trim().length > 0 && value.length <= MAX_BODY_LENGTH),
)

/** A write as the device sends it. */
const WriteBody = Schema.Union([
  Schema.Struct({ writeId: WriteId, via: Via, op: Schema.Literal("issue/create"), title: Title, body: IssueBody }),
  Schema.Struct({
    writeId: WriteId,
    via: Via,
    op: Schema.Literal("issue/comment"),
    number: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 })),
    body: CommentBody,
  }),
])
const decodeWrite = Schema.decodeUnknownOption(Schema.fromJsonString(WriteBody))

/** `/api/repos/<owner>/<name>/writes` as its owner and name, or `undefined` for any other path. */
export const parseWritesPath = (path: string): { readonly owner: string; readonly name: string } | undefined => {
  if (!path.startsWith(`${REPOS_ROUTE}/`)) return undefined
  const segments = path.slice(REPOS_ROUTE.length + 1).split("/")
  if (segments.length !== 3 || segments[2] !== WRITES_SEGMENT) return undefined
  try {
    return { owner: decodeURIComponent(segments[0]!), name: decodeURIComponent(segments[1]!) }
  } catch {
    return undefined
  }
}

const SHAPES: ReadonlySet<string> = new Set([ITEMS_SHAPE_ROUTE, COMMENTS_SHAPE_ROUTE, WRITES_SHAPE_ROUTE, SYNC_SHAPE_ROUTE])

/** Whether ChatApi routes `path` here. */
export const handles = (path: string): boolean =>
  path === GITHUB_WEBHOOK_ROUTE || SHAPES.has(path) || parseWritesPath(path) !== undefined

/** The bounds of a delivery id: GitHub's are UUIDs; anything up to 128 characters is taken. */
const DELIVERY_ID = /^[A-Za-z0-9-]{1,128}$/

/** The subject a delivery names: the repository and issue of an `issues` or `issue_comment` event. */
const Subject = Schema.Struct({
  repository: Schema.Struct({ full_name: Schema.String }),
  issue: Schema.Struct({ number: Schema.Int }),
})
const decodeSubject = Schema.decodeUnknownOption(Subject)

/** The events whose subject is an issue. */
const ISSUE_EVENTS: ReadonlySet<string> = new Set(["issues", "issue_comment"])

/** What the routes need besides Postgres: the synced repository, and the GitHub App when it is configured. */
export interface Options {
  readonly repository: Repository
  readonly app: Option.Option<GitHubApp>
}

/**
 * Reads Electric's connection and returns the GitHub routes' `fetch`. `database` opens a Postgres client for the scope
 * of each request; `Sessions` (who is asking) and `FlowStarter` (where a remote flow starts) come from the request's
 * context, as RepoApi's do.
 */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>, options: Options) =>
  Effect.gen(function* () {
    const connection = yield* ShapeProxy.config({ url: LOCAL_ELECTRIC_URL })
    const { repository } = options
    const repoParams = { "1": repository.id }

    // The webhook's channel (`Core.Channel`): GitHub's HMAC over the exact bytes, then strict JSON into an
    // `ExternalEvent`. Built once, when the secret is configured.
    const channel = Option.flatMap(options.app, (app) =>
      Option.map(app.webhookSecret, (secret) =>
        Core.Channel.make({
          name: "github",
          credential: Redacted.make({ id: "github-webhook", name: "GITHUB_WEBHOOK_SECRET" }),
          secret: Core.Channel.constantSecret(secret),
          verify: (raw, key) =>
            Core.Signature.verifySignature({
              payload: raw.body,
              secret: key,
              signature: raw.headers["x-hub-signature-256"],
              prefix: Core.Signature.GITHUB_SIGNATURE_PREFIX,
            }),
          decode: (raw, payload) => ({
            source: "github",
            eventName: Core.SignalName.eventName("github", raw.headers["x-github-event"] ?? ""),
            correlationId: null,
            payload: payload as Schema.Json,
            dedupeKey: raw.idempotencyKey,
            receivedAtMs: Date.now(),
          }),
          // The routes start `github/Apply` themselves, for the issue a delivery names; a channel needs a route.
          route: Core.Channel.startFlow(Apply._tag),
        })
      ))

    /** `POST /api/github/webhook`. */
    const webhook = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const event = request.headers["x-github-event"] ?? "unknown"
      const fields: Record<string, string | number> = { event }
      const answer = (status: number, outcome: string, code?: "not_configured" | "invalid_signature" | WriteRefusal) =>
        Effect.gen(function* () {
          fields.outcome = outcome
          yield* Metric.update(Metric.withAttributes(Metrics.webhooks, { event, outcome }), 1)
          return code === undefined
            ? HttpServerResponse.empty({ status, headers: noStore })
            : refuse(status, code)
        })
      const response = yield* Effect.gen(function* () {
        if (request.method !== "POST") return HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })
        if (Option.isNone(channel)) return yield* answer(503, "not_configured", "not_configured")
        const deliveryId = request.headers["x-github-delivery"] ?? ""
        if (!DELIVERY_ID.test(deliveryId)) return yield* answer(400, "invalid", "invalid")
        fields.deliveryId = deliveryId
        const text = yield* readBounded(request, MAX_WEBHOOK_BYTES, (bytes) => (fields.bytes = bytes)).pipe(Effect.result)
        if (text._tag === "Failure") {
          return text.failure.reason === "too_large"
            ? yield* answer(413, "too_large", "too_large")
            : yield* answer(400, "invalid", "invalid")
        }
        const raw = {
          body: new TextEncoder().encode(text.success),
          headers: { ...request.headers },
          idempotencyKey: deliveryId,
        }
        const verified = yield* channel.value.verify(raw).pipe(Effect.result)
        if (verified._tag === "Failure") return yield* answer(401, "refused", "invalid_signature")
        const decoded = yield* channel.value.decode(raw).pipe(Effect.result)
        if (decoded._tag === "Failure") return yield* answer(400, "invalid", "invalid")
        // `Core.Channel` checked the decoder's output as an `ExternalEvent`.
        const delivered = decoded.success as Core.ExternalEvent.ExternalEvent
        const action = (delivered.payload as { readonly action?: unknown }).action
        const subject = ISSUE_EVENTS.has(event) ? decodeSubject(delivered.payload) : Option.none()
        const named = Option.filter(subject, (found) => {
          const [owner = "", name = ""] = found.repository.full_name.split("/")
          return repoId(owner, name) === repository.id
        })
        // Only issue events of the synced repository name a subject; the rest (ping, installation, other
        // repositories) are recorded and answered.
        if (Option.isSome(named)) {
          const number = named.value.issue.number
          fields.number = number
          yield* (yield* FlowStarter).start(Apply, {
            executionId: applyExecutionId(deliveryId),
            payload: { deliveryId, repo: `${repository.owner}/${repository.name}`, number, event },
          })
        }
        const first = yield* Store.recordDelivery({
          deliveryId,
          event,
          action: typeof action === "string" ? action.slice(0, 64) : null,
          repoId: Option.isSome(named) ? repository.id : null,
          subject: Option.isSome(named) ? named.value.issue.number : null,
        }).pipe(Effect.provide(database))
        if (!first) return yield* answer(200, "duplicate")
        return yield* answer(200, Option.isSome(named) ? "applied" : "ignored")
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            fields.errorCode = codeOf(Cause.squash(cause))
            return yield* answer(503, "unavailable", "unavailable")
          })
        ),
      )
      yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
      yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
        "github.webhook",
      ).pipe(Effect.annotateLogs({ ...fields, status: response.status }))
      return response
    }).pipe(Effect.withSpan("github.webhook", { kind: "server" }))

    /** `POST /api/repos/<owner>/<name>/writes`. */
    const writes = (target: { readonly owner: string; readonly name: string }) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const startedAt = yield* Clock.currentTimeMillis
        const fields: Record<string, string | number> = {}
        const refused = (status: number, code: WriteRefusal) => {
          fields.outcome = code
          return refuse(status, code)
        }
        const response = yield* Effect.gen(function* () {
          if (request.method !== "POST") {
            fields.outcome = "method"
            return HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })
          }
          const actor = yield* (yield* Sessions).resolve.pipe(Effect.option)
          if (Option.isNone(actor)) return refused(503, "unavailable")
          if (Option.isNone(actor.value)) return refused(401, "authentication")
          const who = actor.value.value
          // Opening an issue and commenting are Guest acts (decision 0007 `repo:issue-open`, `repo:comment`): any role
          // on the repository. No role means a repository the person can't see.
          if (who.role === null) return refused(403, "forbidden")
          if (Option.isNone(options.app)) return refused(503, "not_configured")
          if (repoId(target.owner, target.name) !== repository.id) return refused(404, "not_found")
          const text = yield* readBounded(request, MAX_WRITE_BYTES).pipe(Effect.result)
          if (text._tag === "Failure") {
            return text.failure.reason === "too_large" ? refused(413, "too_large") : refused(400, "invalid")
          }
          const body = decodeWrite(text.success)
          if (Option.isNone(body)) return refused(400, "invalid")
          const write = body.value
          fields.op = write.op
          fields.via = write.via
          fields.writeId = write.writeId
          // A person's own write runs with their GitHub token, which only a signed-in session holds.
          if (write.via === "person" && who.session === undefined) return refused(401, "authentication")
          // The agent's write runs as the App. Only a person who may ask Smithers has an agent (decision 0007
          // `repo:ask`, Member or above), so a Guest's write goes as the Guest or not at all, never as the bot.
          if (write.via === "agent" && !canAsk(who)) return refused(403, "forbidden")
          const payload: Store.WritePayload = write.op === "issue/create"
            ? { op: write.op, title: write.title.trim(), body: write.body }
            : { op: write.op, number: write.number, body: write.body }
          const payloadHash = digestSync(JSON.stringify({ via: write.via, ...payload }))
          const inserted = yield* Store.insertWrite({
            id: write.writeId,
            repoId: repository.id,
            actorId: who.subject.id,
            sessionId: write.via === "person" ? who.session! : null,
            via: write.via,
            payload,
            payloadHash,
          }).pipe(Effect.provide(database))
          if (inserted.kind === "existing" && inserted.payloadHash !== payloadHash) return refused(409, "conflict")
          // A new write starts its run; a resend starts the same execution again, which changes nothing, so a start
          // that never reached its Durable Object gets there now.
          if (inserted.kind === "inserted" || inserted.status === "pending") {
            yield* (yield* FlowStarter).start(Write, {
              executionId: writeExecutionId(write.writeId),
              payload: { writeId: write.writeId },
            })
          }
          if (inserted.kind === "existing") {
            fields.outcome = "existing"
            return HttpServerResponse.jsonUnsafe(
              { txid: null, writeId: write.writeId, status: inserted.status },
              { status: 200, headers: noStore },
            )
          }
          fields.outcome = "started"
          return HttpServerResponse.jsonUnsafe(
            { txid: inserted.txid, writeId: write.writeId },
            { status: 202, headers: noStore },
          )
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              fields.errorCode = codeOf(Cause.squash(cause))
              return refused(503, "unavailable")
            })
          ),
        )
        const outcome = String(fields.outcome)
        yield* Metric.update(
          Metric.withAttributes(Metrics.writeRequests, { op: String(fields.op ?? "unknown"), outcome }),
          1,
        )
        yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
        yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
          "github.write.request",
        ).pipe(
          Effect.annotateLogs({
            ...fields,
            outcome,
            status: response.status,
            durationMs: (yield* Clock.currentTimeMillis) - startedAt,
          }),
        )
        return response
      }).pipe(Effect.withSpan("github.write.request", { kind: "server" }))

    /**
     * Starts `github/Reconcile` when the synced repository's issues are older than `SYNC_STALE_MS`, one execution per
     * 5-minute bucket, without waiting. A failure here is logged and the read goes on.
     */
    const reconcileIfStale = Effect.gen(function* () {
      if (Option.isNone(options.app)) return
      const now = yield* Clock.currentTimeMillis
      const state = yield* Store.syncState(repository.id, ISSUES_STREAM).pipe(Effect.provide(database))
      if (state.syncedAt !== null) yield* Metric.update(Metrics.syncAge, Math.round((now - state.syncedAt) / 1000))
      if (state.syncedAt !== null && now - state.syncedAt < SYNC_STALE_MS) return
      yield* (yield* FlowStarter).start(Reconcile, {
        executionId: reconcileExecutionId(repository.id, now),
        payload: { repo: `${repository.owner}/${repository.name}` },
      })
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("github.reconcile.start").pipe(
          Effect.annotateLogs({ repoId: repository.id, outcome: "not_started", errorCode: codeOf(Cause.squash(cause)) }),
        )
      ),
    )

    /** An Electric shape of `table` with its `columns`, filtered by `where` and `params`. */
    const shape = (
      table: string,
      columns: ReadonlyArray<string>,
      where: string,
      params: Readonly<Record<string, string>>,
    ) =>
      ShapeProxy.make({
        ...connection,
        shape: { table, where, params, columns },
        name: `github.shape.${table}`,
        metric: Metric.withAttributes(Metrics.shapes, { table }),
      })

    /**
     * Who may read the repository's rows (decision 0012, Consequences: until shapes are authorized per request, only a
     * public repository's rows reach a visitor): a signed-in person with a role on it, which GitHub granted because
     * they can see it; anyone else only once GitHub has said the repository is public. `None` when they may read,
     * else the refusal: signed out `401`, no role `403`, sessions or Postgres down `503`.
     */
    const readRefusal = Effect.gen(function* () {
      const actor = yield* (yield* Sessions).resolve.pipe(Effect.option)
      if (Option.isNone(actor)) return Option.some(refuse(503, "unavailable"))
      if (Option.isSome(actor.value) && actor.value.value.role !== null) return Option.none()
      const isPublic = yield* Store.isPublic(repository.id).pipe(Effect.provide(database), Effect.option)
      if (Option.isNone(isPublic)) return Option.some(refuse(503, "unavailable"))
      if (Option.getOrElse(isPublic.value, () => false)) return Option.none()
      return Option.some(Option.isNone(actor.value) ? refuse(401, "authentication") : refuse(403, "forbidden"))
    })

    /** A repository shape, served only to whom `readRefusal` lets read it; the refusal is counted under its table. */
    const readable = (table: string, columns: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        const refused = yield* readRefusal
        if (Option.isSome(refused)) {
          yield* Metric.update(
            Metric.withAttributes(Metrics.shapes, { table, status: String(refused.value.status), live: "false" }),
            1,
          )
          yield* Effect.logWarning(`github.shape.${table}`).pipe(Effect.annotateLogs({ status: refused.value.status }))
          return refused.value
        }
        return yield* shape(table, columns, "repo_id = $1", repoParams)
      })

    /**
     * `GET /api/shapes/github-writes`: the signed-in person's own writes; signed out, none; sessions unreadable, 503
     * (worker/ShapeAccess.ts), never another person's scope under the device's handle.
     */
    const ownWrites = ShapeProxy.make({
      ...connection,
      shape: Effect.map(ShapeAccess.actor, (actor) => ({
        table: WRITES_TABLE,
        where: "actor_id = $1",
        params: { "1": Option.match(actor, { onNone: () => NOBODY, onSome: (actor) => actor.subject.id }) },
        columns: WRITE_COLUMNS,
      })),
      name: `github.shape.${WRITES_TABLE}`,
      metric: Metric.withAttributes(Metrics.shapes, { table: WRITES_TABLE }),
    })

    const fetch = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const path = request.url.split("?")[0]!
      if (path === GITHUB_WEBHOOK_ROUTE) return yield* webhook
      if (path === ITEMS_SHAPE_ROUTE) {
        // Whoever reads, the sync stays fresh: it is what learns whether a visitor may read the rows at all.
        yield* reconcileIfStale
        return yield* readable(ITEMS_TABLE, ITEM_COLUMNS)
      }
      if (path === COMMENTS_SHAPE_ROUTE) return yield* readable(COMMENTS_TABLE, COMMENT_COLUMNS)
      if (path === SYNC_SHAPE_ROUTE) return yield* readable(SYNC_TABLE, SYNC_COLUMNS)
      if (path === WRITES_SHAPE_ROUTE) return yield* ownWrites
      const target = parseWritesPath(path)
      if (target !== undefined) return yield* writes(target)
      return HttpServerResponse.empty({ status: 404 })
    })

    return { fetch }
  })
