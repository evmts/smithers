import { ShapeProxy } from "@smthrs/effect-electric"
import { Cause, Clock, Config, Effect, type Layer, Metric, Option, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { SqlClient } from "effect/sql"
import { LOCAL_ELECTRIC_URL } from "../src/features/chat/contract.ts"
import { MAX_VIEW_TEXT_BYTES } from "../src/features/docs/contract.ts"
import { cutText } from "../src/features/docs/text.ts"
import { isRepository } from "../src/features/repo/contract.ts"
import { MAX_VIEW_BODY_BYTES, VIEWS_TABLE } from "../src/features/views/contract.ts"
import { type ViewProps, ViewWrite } from "../src/features/views/schema.ts"
import { checkUrl } from "../src/features/web/url.ts"
import { canAsk, Sessions } from "./Actor.ts"
import { branchAccess, canEdit, canView } from "./branch/Access.ts"
import * as Conversations from "./branch/Conversations.ts"
import { readBounded } from "./Body.ts"
import { DocsSource } from "./docs/Source.ts"
import { codeOf } from "./ErrorCode.ts"
import * as ShapeAccess from "./ShapeAccess.ts"

// The conversation's views in ChatApi (docs/features/web-pages.md#the-views-table, decision 0004 §8): `POST /api/views`
// adds one, and `GET /api/shapes/views` is Electric's `views`, which every device syncs like the messages. Only a
// person who may ask (Member or above, decision 0007) adds a view, as only they may ask: a view is the browser's
// agent's or their own `/web`. A view is added once by the id its writer chose, so a step run again changes nothing.
//
// A view's props are the page's URL and what the flow's check read from its head: a title, a description and an
// `https:` icon, each bounded (src/features/views/schema.ts). The route checks the page again, as `app/web/open` does
// (src/features/web/url.ts), against the host the request came to: no row ever holds a `javascript:`, `data:`, `file:` or `blob:` URL, one with a name or password, a page of
// the app itself, or a `webpage` that isn't `https:` on another site. A `link` may be `http:` on `localhost` only where
// `WEB_PAGES_LOCAL_HTTP` says so: `alchemy dev` (worker/DevChatApi.ts), never a deployment unless it is set. Whatever
// a row holds, the browser checks it again before it renders (`@smthrs/ui`'s `WebPageView` and `WebLinkCard`).
//
// A `docs` view names a repository and a page's path (docs/features/docs.md#the-docs-view): ChatApi reads that page
// from the repository's own docs index (worker/docs/Source.ts) and keeps its URL, title and at most 64 KiB of its
// Markdown in the row, so a row never holds Markdown a client chose and every device shows it offline.

/** `POST /api/views` requests, by `status`. */
export const requests = Metric.counter("smithers_view_requests", {
  description: "POST /api/views requests, by status",
  incremental: true,
})

/** `GET /api/shapes/views` requests, by `status` and `live`. */
export const shapes = Metric.counter("smithers_view_shape_requests", {
  description: "GET /api/shapes/views requests, by status and live",
  incremental: true,
})

const decodeWrite = Schema.decodeUnknownEffect(Schema.fromJsonString(ViewWrite))

/**
 * `WEB_PAGES_LOCAL_HTTP`: whether a `link` to an `http:` page on `localhost` is kept. `localHttp` unless set, which only
 * `alchemy dev` passes as `true`: a deployment keeps `https:` pages alone.
 */
export const localHttpConfig = (localHttp: boolean) =>
  Config.Boolean("WEB_PAGES_LOCAL_HTTP").pipe(Config.withDefault(localHttp))

/** The policy for `request`: the app is the origin it came to (its absolute URL, as Workers and `fetch` get it). */
export const policyFor = (request: HttpServerRequest.HttpServerRequest, localHttp: boolean) => ({
  localHttp,
  appOrigin: new URL(request.originalUrl).origin,
})

type Fields = Record<string, string | number | boolean>

const noStore = { "cache-control": "no-store" }

/** A refusal: its status and code, logged and answered as `{ code }`. */
const refusal = (status: number, code: string) => HttpServerResponse.jsonUnsafe({ code }, { status, headers: noStore })

/** A view as the route keeps it: its id, template and props. */
interface Stored {
  readonly id: string
  readonly template: ViewWrite["template"]
  readonly props: ViewProps
}

/** Adds the view to conversation `conversationId` unless its id is taken: the transaction it added it in, or nothing. */
const insert = (write: Stored, conversationId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly txid: string }>`
      INSERT INTO views (id, template, props, conversation_id)
      VALUES (${write.id}, ${write.template}, ${JSON.stringify(write.props)}::jsonb, ${conversationId})
      ON CONFLICT (id) DO NOTHING
      RETURNING pg_current_xact_id()::xid::text AS txid`
    return row === undefined ? undefined : Number(row.txid)
  })

/**
 * Whether the view under `write`'s id is `write` itself, in the same conversation: the same add, landed before. A
 * `docs` view is the same page of the same repository's docs, whatever its Markdown says now.
 */
const landed = (write: Stored, conversationId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = write.template === "docs"
      ? yield* sql<{ readonly same: boolean }>`
        SELECT template = 'docs' AND props->>'repository' = ${write.props.repository ?? ""}
          AND props->>'path' = ${write.props.path ?? ""} AND conversation_id = ${conversationId} AS same
        FROM views WHERE id = ${write.id}`
      : yield* sql<{ readonly same: boolean }>`
        SELECT template = ${write.template} AND props = ${JSON.stringify(write.props)}::jsonb
          AND conversation_id = ${conversationId} AS same
        FROM views WHERE id = ${write.id}`
    return row?.same === true
  })

/** Whether a `docs` view of the same repository's same page is already under `id`. */
const addedDocs = (id: string, docs: { readonly owner: string; readonly name: string; readonly path: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly id: string }>`
      SELECT id FROM views WHERE id = ${id} AND template = 'docs'
        AND props->>'repository' = ${`${docs.owner}/${docs.name}`} AND props->>'path' = ${docs.path}`
    return row !== undefined
  })

/** The repository and page a `docs` write names: `owner/name` GitHub could have, and a path; none otherwise. */
const docsTarget = (props: ViewWrite["props"]) => {
  const [owner, name] = (props.repository ?? "").split("/")
  return owner === undefined || name === undefined || props.path === undefined || !isRepository(owner, name)
    ? undefined
    : { owner, name, path: props.path }
}

/** The conversation of answer `answerId` when `askedBy` asked its question: where its agent's views go. */
const answerConversation = (answerId: string, askedBy: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly conversationId: string }>`
      SELECT a.conversation_id AS "conversationId" FROM messages a JOIN messages q ON q.id = a.question_id
      WHERE a.id = ${answerId} AND a.role = 'assistant' AND q.asked_by = ${askedBy}`
    return row?.conversationId
  })

/** What a shape filters on for someone who may not watch a conversation: no conversation's id, so it holds no rows. */
const NO_CONVERSATION = "00000000-0000-0000-0000-000000000000"

const isUuid = Schema.is(Schema.String.check(Schema.isUUID()))

/**
 * Reads Electric's connection (`ShapeProxy.config`) and `WEB_PAGES_LOCAL_HTTP` (`localHttp` unless set, `false` unless
 * given), and returns the views routes: `add` for `POST /api/views` and `shape` for `GET /api/shapes/views`. Each add
 * is a log line `chat.view.add`, a span `chat.view.request` and a count; none carries the page. `database` opens a
 * Postgres client for the scope of each request.
 */
export const make = <E, R>(
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
  options: { readonly localHttp?: boolean } = {},
) =>
  Effect.gen(function* () {
    const localHttp = yield* localHttpConfig(options.localHttp ?? false)
    // GET /api/shapes/views?conversation=<id>: one conversation's views (decision 0013 §1), the home conversation's
    // when it names none. Anyone who may not watch the branch gets a shape with no rows; a request the server can't
    // decide, because sessions or the home conversation can't be read, is 503 (worker/ShapeAccess.ts).
    const connection = yield* ShapeProxy.config({ url: LOCAL_ELECTRIC_URL })
    const shape = ShapeProxy.make({
      ...connection,
      shape: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const named = new URL(request.url, "http://localhost").searchParams.get("conversation")
        const conversation = named !== null && isUuid(named)
          ? named.toLowerCase()
          : named === null
          ? yield* Conversations.home.pipe(Effect.provide(database), Effect.mapError(() => ShapeAccess.unavailable))
          : undefined
        const actor = yield* ShapeAccess.actor
        // Only someone who may view the conversation's branch gets its views (worker/branch/Access.ts).
        const found = conversation === undefined
          ? undefined
          : yield* branchAccess(actor, conversation, "conversation").pipe(
            Effect.provide(database),
            Effect.mapError(() => ShapeAccess.unavailable),
          )
        return {
          table: VIEWS_TABLE,
          where: "conversation_id = $1",
          params: { "1": found !== undefined && canView(found.access) ? found.conversationId : NO_CONVERSATION },
        }
      }),
      name: "chat.views.shape",
      metric: shapes,
    })

    const add = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const startedAt = yield* Clock.currentTimeMillis
      const fields: Fields = {}
      const response = yield* Effect.gen(function* () {
        if (request.method !== "POST") {
          return HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })
        }
        const actor = yield* (yield* Sessions).resolve
        if (Option.isNone(actor)) return refusal(401, "authentication")
        // A Guest, or a person with no role, may not ask, so may not add to the conversation either.
        if (!canAsk(actor.value)) return refusal(403, "forbidden")
        const body = yield* readBounded(request, MAX_VIEW_BODY_BYTES, (bytes) => (fields.bytes = bytes)).pipe(
          Effect.result,
        )
        if (body._tag === "Failure") {
          return body.failure.reason === "too_large" ? refusal(413, "too_large") : refusal(400, "invalid")
        }
        const decoded = yield* decodeWrite(body.success).pipe(Effect.option)
        if (Option.isNone(decoded)) return refusal(400, "invalid")
        // Lowercase, as Postgres prints a uuid: one view has one id in rows, logs and the browser.
        const write = { ...decoded.value, id: decoded.value.id.toLowerCase() }
        fields.viewId = write.id
        fields.template = write.template
        const docs = write.template === "docs" ? docsTarget(write.props) : undefined
        if (write.template === "docs" && docs === undefined) return refusal(400, "invalid")
        const page = checkUrl(
          write.props.url,
          write.template === "webpage" ? "embed" : "tab",
          policyFor(request, localHttp),
        )
        if (!page.ok) {
          fields.reason = page.reason
          return refusal(400, "refused")
        }
        // The view's conversation (decision 0013 §1): an agent's call names its answer, and the view goes to that
        // answer's conversation, only for the person who asked it; a person's names its conversation, which must
        // exist; neither means the home conversation.
        const named = write.answerId !== undefined
          ? yield* answerConversation(write.answerId.toLowerCase(), actor.value.subject.id).pipe(Effect.provide(database))
          : write.conversationId === undefined
          ? yield* Conversations.home.pipe(Effect.provide(database))
          : write.conversationId.toLowerCase()
        // What the row keeps, decided before the conversation's lock is taken: a docs page is read from its site.
        let stored: Stored
        if (docs !== undefined && (yield* addedDocs(write.id, docs).pipe(Effect.provide(database)))) {
          // The same page under the same id, added before: a resend whose answer was lost. The site isn't asked again,
          // so it lands as before even once the site dropped the page; the conversation is still checked below.
          stored = {
            id: write.id,
            template: "docs",
            props: { url: write.props.url, repository: `${docs.owner}/${docs.name}`, path: docs.path },
          }
        } else if (docs === undefined) {
          // The page's own title, description and https icon, as the flow's check read them (ViewWrite bounds each).
          const { url: _url, repository: _repository, path: _path, ...preview } = write.props
          stored = { id: write.id, template: write.template, props: { url: page.page.href, ...preview } }
        } else {
          // The page as the repository's own docs index lists it, and its Markdown as the docs site answers it now.
          const read = yield* (yield* DocsSource).page(docs.owner, docs.name, docs.path)
          if (read._tag === "Refused") {
            fields.reason = read.code
            return read.code === "unavailable"
              ? refusal(503, "unavailable")
              : read.code === "docs_unreachable"
              ? refusal(502, "docs_unreachable")
              : refusal(400, "refused")
          }
          const site = checkUrl(read.page.url, "tab", policyFor(request, localHttp))
          if (!site.ok) {
            fields.reason = site.reason
            return refusal(400, "refused")
          }
          const text = cutText(read.text, MAX_VIEW_TEXT_BYTES)
          fields.truncated = text.truncated
          stored = {
            id: write.id,
            template: "docs",
            props: {
              url: site.page.href,
              title: read.page.title,
              repository: `${docs.owner}/${docs.name}`,
              path: read.page.path,
              text: text.text,
              ...(text.truncated ? { truncated: true } : {}),
            },
          }
        }
        return yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          return yield* sql.withTransaction(Effect.gen(function* () {
            // Shares.write holds this same row lock. Read policy only after acquiring it, and keep it through insert.
            if (named !== undefined) yield* sql`
              SELECT b.id FROM branches b JOIN conversations c ON c.branch_id = b.id
              WHERE c.id = ${named} FOR UPDATE OF b`
            const found = named === undefined
              ? undefined
              : yield* branchAccess(actor, named, "conversation")
            if (found === undefined) return refusal(404, "conversation_not_found")
            // Only someone who may edit the branch adds to its conversation (worker/branch/Access.ts).
            if (!canEdit(found.access)) return refusal(403, "forbidden")
            const conversationId = found.conversationId
            fields.conversationId = conversationId
            const txid = yield* insert(stored, conversationId)
            if (txid !== undefined) return HttpServerResponse.jsonUnsafe({ txid }, { status: 202, headers: noStore })
            if (yield* landed(stored, conversationId)) {
              fields.existing = true
              return HttpServerResponse.jsonUnsafe({ txid: null }, { status: 200, headers: noStore })
            }
            return refusal(409, "id_taken")
          }))
        }).pipe(Effect.provide(database))
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
      yield* Metric.update(Metric.withAttributes(requests, { status: String(response.status) }), 1)
      yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
      yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
        "chat.view.add",
      ).pipe(Effect.annotateLogs(fields))
      return response
    }).pipe(Effect.withSpan("chat.view.request", { kind: "server" }))

    return { add, shape }
  })
