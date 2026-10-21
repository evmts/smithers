import { COMMITMENTS, commitmentOf } from "../../src/features/issues/lifecycle.ts"
import { GitHub } from "@smthrs/integrations"
import { Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import {
  commentId,
  itemId,
  TRIAGE_DECISIONS,
  triageOf,
  type WriteFailure,
  type WriteOp,
  type WriteStatus,
  type WriteVia,
} from "../../src/features/issues/contract.ts"
import { MERGE_METHODS } from "../../src/features/pulls/contract.ts"
import { Sealed } from "../SessionStore.ts"

// The git loop's rows in Postgres (docs/features/issues.md#postgres, migration 0016_github_issues). GitHub is the truth:
// only the server's GitHub flows write `items` and `comments`, and only under the newer-than guard, so a duplicate or
// reordered read changes nothing. Each function is one statement, or one transaction, on the `SqlClient` in context.

type Issue = GitHub.Issues.Issue
type IssueComment = GitHub.Issues.IssueComment

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The write id a body's hidden marker names, when it is one of ours (a UUID); else null. */
export const markedWrite = (body: string | null): string | null => {
  const id = GitHub.Issues.writeIdOf(body)
  return id !== undefined && UUID.test(id) ? id : null
}

/** A body as the projection keeps it: GitHub's text without our hidden marker. */
export const shownBody = (body: string | null): string => GitHub.Issues.withoutWriteMarker(body ?? "")

/**
 * Upserts issue `issue` of repository `repoId`, read at `fetchedAt` (epoch ms): inserted, or updated only when GitHub's
 * `updated_at` and the read time are newer than the row's and what GitHub said differs, so a repeated read writes
 * nothing and Electric sends nothing. A row seen again is no longer deleted. Its triage state is what its labels say
 * (`triageOf`); whether a person pinned it is Smithers' own and never changes here. Returns whether the row changed.
 */
export const upsertIssue = (repoId: string, issue: Issue, fetchedAt: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const triage = triageOf(issue.labels.map((label) => label.name))
    const commitment = commitmentOf(issue.labels.map((label) => label.name))
    const rows = yield* sql`
      INSERT INTO items (id, repo_id, number, kind, github_id, title, body, state, state_reason, author_login, comments,
        created_at, updated_at, closed_at, deleted_at, write_id, triage, commitment, source_updated_at, fetched_at)
      VALUES (${itemId(repoId, issue.number)}, ${repoId}, ${issue.number},
        ${issue.pull_request === undefined ? "issue" : "pull"}, ${issue.id}, ${issue.title}, ${shownBody(issue.body)},
        ${issue.state}, ${issue.state_reason}, ${issue.user?.login ?? null}, ${issue.comments},
        ${issue.created_at}::timestamptz, ${issue.updated_at}::timestamptz, ${issue.closed_at}::timestamptz, NULL,
        ${markedWrite(issue.body)}::uuid, ${triage}, ${commitment}, ${issue.updated_at}::timestamptz,
        ${new Date(fetchedAt).toISOString()}::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind, github_id = EXCLUDED.github_id, title = EXCLUDED.title, body = EXCLUDED.body,
        state = EXCLUDED.state, state_reason = EXCLUDED.state_reason, author_login = EXCLUDED.author_login,
        comments = EXCLUDED.comments, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
        closed_at = EXCLUDED.closed_at, deleted_at = NULL, write_id = COALESCE(EXCLUDED.write_id, items.write_id),
        commitment = EXCLUDED.commitment, triage = EXCLUDED.triage, source_updated_at = EXCLUDED.source_updated_at, fetched_at = EXCLUDED.fetched_at
      WHERE (items.source_updated_at, items.fetched_at) < (EXCLUDED.source_updated_at, EXCLUDED.fetched_at)
        AND (items.kind, items.github_id, items.title, items.body, items.state, items.state_reason, items.author_login,
          items.comments, items.created_at, items.updated_at, items.closed_at, items.deleted_at,
          COALESCE(EXCLUDED.write_id, items.write_id), items.triage, items.commitment)
        IS DISTINCT FROM (EXCLUDED.kind, EXCLUDED.github_id, EXCLUDED.title, EXCLUDED.body, EXCLUDED.state,
          EXCLUDED.state_reason, EXCLUDED.author_login, EXCLUDED.comments, EXCLUDED.created_at, EXCLUDED.updated_at,
          EXCLUDED.closed_at, NULL::timestamptz, items.write_id, EXCLUDED.triage, EXCLUDED.commitment)
      RETURNING id`
    return rows.length > 0
  })

/** Upserts comment `comment` on issue `number` of `repoId`, under the same guard. Returns whether the row changed. */
export const upsertComment = (repoId: string, number: number, comment: IssueComment, fetchedAt: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      INSERT INTO comments (id, repo_id, item_id, github_id, author_login, body, created_at, updated_at, deleted_at,
        write_id, source_updated_at, fetched_at)
      VALUES (${commentId(repoId, comment.id)}, ${repoId}, ${itemId(repoId, number)}, ${comment.id},
        ${comment.user?.login ?? null}, ${shownBody(comment.body)}, ${comment.created_at}::timestamptz,
        ${comment.updated_at}::timestamptz, NULL, ${markedWrite(comment.body)}::uuid, ${comment.updated_at}::timestamptz,
        ${new Date(fetchedAt).toISOString()}::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        item_id = EXCLUDED.item_id, author_login = EXCLUDED.author_login, body = EXCLUDED.body,
        updated_at = EXCLUDED.updated_at, deleted_at = NULL, write_id = COALESCE(EXCLUDED.write_id, comments.write_id),
        source_updated_at = EXCLUDED.source_updated_at, fetched_at = EXCLUDED.fetched_at
      WHERE (comments.source_updated_at, comments.fetched_at) < (EXCLUDED.source_updated_at, EXCLUDED.fetched_at)
        AND (comments.item_id, comments.author_login, comments.body, comments.updated_at, comments.deleted_at,
          COALESCE(EXCLUDED.write_id, comments.write_id))
        IS DISTINCT FROM (EXCLUDED.item_id, EXCLUDED.author_login, EXCLUDED.body, EXCLUDED.updated_at,
          NULL::timestamptz, comments.write_id)
      RETURNING id`
    return rows.length > 0
  })

/** Tombstones issue `number` of `repoId` and its comments: GitHub no longer has it here. Returns whether it was live. */
export const tombstoneIssue = (repoId: string, number: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const id = itemId(repoId, number)
    return yield* sql.withTransaction(Effect.gen(function* () {
      const rows = yield* sql`UPDATE items SET deleted_at = now() WHERE id = ${id} AND deleted_at IS NULL RETURNING id`
      yield* sql`UPDATE comments SET deleted_at = now() WHERE item_id = ${id} AND deleted_at IS NULL`
      return rows.length > 0
    }))
  })

/**
 * Tombstones issue `number`'s comments that a complete listing didn't contain (`kept`, GitHub's comment ids), when
 * nothing newer than `fetchedAt` touched them since. Returns how many it tombstoned.
 */
export const tombstoneCommentsExcept = (repoId: string, number: number, kept: ReadonlyArray<number>, fetchedAt: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      UPDATE comments SET deleted_at = now()
      WHERE item_id = ${itemId(repoId, number)} AND deleted_at IS NULL
        AND NOT (github_id = ANY(${kept.map(String)}::bigint[]))
        AND fetched_at <= ${new Date(fetchedAt).toISOString()}::timestamptz
      RETURNING id`
    return rows.length
  })

/** Records webhook delivery `deliveryId` once. Returns whether this was its first time. */
export const recordDelivery = (delivery: {
  readonly deliveryId: string
  readonly event: string
  readonly action: string | null
  readonly repoId: string | null
  readonly subject: number | null
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      INSERT INTO github_deliveries (delivery_id, event, action, repo_id, subject)
      VALUES (${delivery.deliveryId}, ${delivery.event}, ${delivery.action}, ${delivery.repoId}, ${delivery.subject})
      ON CONFLICT (delivery_id) DO NOTHING
      RETURNING delivery_id`
    return rows.length > 0
  })

/** When delivery `deliveryId` arrived (epoch ms), once the route recorded it. */
export const receivedAt = (deliveryId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly at: string }>`
      SELECT (extract(epoch FROM received_at) * 1000)::bigint::text AS at
      FROM github_deliveries WHERE delivery_id = ${deliveryId}`
    return Option.map(Option.fromNullishOr(row), (found) => Number(found.at))
  })

/** A write's payload as the route admitted it, by operation. */
export const WritePayload = Schema.Union([
  Schema.Struct({ op: Schema.Literal("issue/commitment"), number: Schema.Int, commitment: Schema.Literals(COMMITMENTS) }),
  Schema.Struct({ op: Schema.Literal("issue/create"), title: Schema.String, body: Schema.String }),
  Schema.Struct({ op: Schema.Literal("issue/comment"), number: Schema.Int, body: Schema.String }),
  Schema.Struct({
    op: Schema.Literal("issue/triage"),
    number: Schema.Int,
    decision: Schema.Literals(TRIAGE_DECISIONS),
    reason: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({ op: Schema.Literal("triage/run"), number: Schema.Int }),
  Schema.Struct({ op: Schema.Literal("triage/enable"), dailyTokens: Schema.Int }),
  Schema.Struct({ op: Schema.Literal("triage/pause") }),
  Schema.Struct({
    op: Schema.Literal("pr/merge"),
    number: Schema.Int,
    headSha: Schema.String,
    baseSha: Schema.String,
    method: Schema.Literals(MERGE_METHODS),
  }),
])
export type WritePayload = typeof WritePayload.Type
const decodePayload = Schema.decodeUnknownSync(WritePayload)

/** What `insertWrite` did: inserted it in transaction `txid`, or found the write id already taken. */
export type Inserted =
  | { readonly kind: "inserted"; readonly txid: number }
  | { readonly kind: "existing"; readonly status: WriteStatus; readonly payloadHash: string }

/** Records a write the route admitted, once per write id. */
export const insertWrite = (write: {
  readonly id: string
  readonly repoId: string
  readonly actorId: string
  readonly sessionId: string | null
  readonly via: WriteVia
  readonly payload: WritePayload
  readonly payloadHash: string
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [inserted] = yield* sql<{ readonly txid: string }>`
      INSERT INTO github_writes (id, repo_id, actor_id, session_id, via, op, payload, payload_hash)
      VALUES (${write.id}::uuid, ${write.repoId}, ${write.actorId}, ${write.sessionId}::uuid, ${write.via},
        ${write.payload.op}, ${JSON.stringify(write.payload)}::jsonb, ${write.payloadHash})
      ON CONFLICT (id) DO NOTHING
      RETURNING pg_current_xact_id()::xid::text AS txid`
    if (inserted !== undefined) return { kind: "inserted", txid: Number(inserted.txid) } satisfies Inserted
    const [existing] = yield* sql<{ readonly status: WriteStatus; readonly payloadHash: string }>`
      SELECT status, payload_hash AS "payloadHash" FROM github_writes WHERE id = ${write.id}::uuid`
    return { kind: "existing", status: existing!.status, payloadHash: existing!.payloadHash } satisfies Inserted
  })

/** A write as its flow reads it. */
export interface Write {
  readonly id: string
  readonly repoId: string
  readonly actorId: string
  /** The person's GitHub login, for the agent's attribution line; null when no person row has it. */
  readonly login: string | null
  readonly sessionId: string | null
  readonly via: WriteVia
  readonly op: WriteOp
  readonly payload: WritePayload
  readonly status: WriteStatus
  readonly attempts: number
  readonly itemNumber: number | null
  readonly githubId: number | null
  /** Epoch milliseconds. */
  readonly createdAt: number
}

/** Write `id`, or `None`. */
export const writeOf = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly id: string
      readonly repoId: string
      readonly actorId: string
      readonly login: string | null
      readonly sessionId: string | null
      readonly via: WriteVia
      readonly op: WriteOp
      readonly payload: unknown
      readonly status: WriteStatus
      readonly attempts: number
      readonly itemNumber: number | null
      readonly githubId: string | null
      readonly createdAt: string
    }>`
      SELECT w.id::text, w.repo_id AS "repoId", w.actor_id AS "actorId", p.github_login AS login,
        w.session_id::text AS "sessionId", w.via, w.op, w.payload, w.status, w.attempts, w.item_number AS "itemNumber",
        w.github_id::text AS "githubId", (extract(epoch FROM w.created_at) * 1000)::bigint::text AS "createdAt"
      FROM github_writes w LEFT JOIN people p ON p.id::text = w.actor_id
      WHERE w.id = ${id}::uuid`
    return Option.map(Option.fromNullishOr(row), (found): Write => ({
      ...found,
      payload: decodePayload(found.payload),
      githubId: found.githubId === null ? null : Number(found.githubId),
      createdAt: Number(found.createdAt),
    }))
  })

/** Counts one call to GitHub for write `id`, before it is made. Returns how many were made before it. */
export const beginAttempt = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly before: number }>`
      UPDATE github_writes SET attempts = attempts + 1 WHERE id = ${id}::uuid RETURNING attempts - 1 AS before`
    // The route recorded the write before its flow started, so the row is there.
    return row!.before
  })

/**
 * How a write ended: done, with the issue it wrote and what GitHub gave it (none for a write that made nothing on
 * GitHub, such as enabling triage); or failed or refused, with why.
 */
export type Settlement =
  | { readonly status: "done"; readonly itemNumber: number | null; readonly githubId: number | null }
  | { readonly status: "failed" | "refused"; readonly failure: WriteFailure }

/**
 * Settles write `id` while it is still pending, and, for a write GitHub took, upserts what GitHub answered in the same
 * transaction (`project`). Returns whether this settled it.
 */
export const settleWrite = <E, R>(id: string, settlement: Settlement, project: Effect.Effect<unknown, E, R> = Effect.void) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function* () {
      const rows = settlement.status === "done"
        ? yield* sql`
          UPDATE github_writes SET status = 'done', item_number = ${settlement.itemNumber},
            github_id = ${settlement.githubId}, settled_at = now()
          WHERE id = ${id}::uuid AND status = 'pending' RETURNING id`
        : yield* sql`
          UPDATE github_writes SET status = ${settlement.status}, failure = ${settlement.failure}, settled_at = now()
          WHERE id = ${id}::uuid AND status = 'pending' RETURNING id`
      const settled = rows.length > 0
      yield* settled && settlement.status === "done" ? project : Effect.void
      return settled
    }))
  })

/** A repository's sync stream: its cursor and when a walk last finished (epoch ms), if ever. */
export interface SyncState {
  readonly cursor: string | null
  readonly syncedAt: number | null
}

/** Sync stream `stream` of `repoId`; a stream never synced has neither. */
export const syncState = (repoId: string, stream: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly cursor: string | null; readonly syncedAt: string | null }>`
      SELECT cursor, (extract(epoch FROM synced_at) * 1000)::bigint::text AS "syncedAt"
      FROM github_sync WHERE repo_id = ${repoId} AND stream = ${stream}`
    return {
      cursor: row?.cursor ?? null,
      syncedAt: row?.syncedAt === null || row === undefined ? null : Number(row.syncedAt),
    } satisfies SyncState
  })

/** Commits one page's cursor of `repoId`'s `stream`. */
export const commitCursor = (repoId: string, stream: string, cursor: string | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO github_sync (repo_id, stream, cursor) VALUES (${repoId}, ${stream}, ${cursor})
      ON CONFLICT (repo_id, stream) DO UPDATE SET cursor = EXCLUDED.cursor`
  })

/** Records the end of a walk of `repoId`'s `stream`: complete, or stopped early (`partial`), or failed with a code. */
export const finishSync = (
  repoId: string,
  stream: string,
  outcome: { readonly complete: boolean; readonly failure: string | null },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO github_sync (repo_id, stream, synced_at, complete, failure)
      VALUES (${repoId}, ${stream}, now(), ${outcome.complete}, ${outcome.failure})
      ON CONFLICT (repo_id, stream) DO UPDATE SET synced_at = now(), complete = EXCLUDED.complete,
        failure = EXCLUDED.failure`
  })

/** The App's installation on `repoId`, if a step found it before. */
export const installationOf = (repoId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly installationId: string }>`
      SELECT installation_id::text AS "installationId" FROM github_repositories
      WHERE repo_id = ${repoId} AND installation_id IS NOT NULL`
    return Option.map(Option.fromNullishOr(row), (found) => Number(found.installationId))
  })

/** Remembers the App's installation on `repoId`. */
export const rememberInstallation = (repoId: string, installationId: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO github_repositories (repo_id, installation_id) VALUES (${repoId}, ${installationId})
      ON CONFLICT (repo_id) DO UPDATE SET installation_id = EXCLUDED.installation_id, checked_at = now()`
  })

/** Forgets the App's installation on `repoId`: GitHub said it is gone. */
export const forgetInstallation = (repoId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE github_repositories SET installation_id = NULL, checked_at = now() WHERE repo_id = ${repoId}`
  })

/** Records what GitHub said of `repoId`: its numeric id and whether it is private. */
export const recordRepository = (repoId: string, repository: { readonly githubId: number; readonly private: boolean }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO github_repositories (repo_id, github_id, private) VALUES (${repoId}, ${repository.githubId},
        ${repository.private})
      ON CONFLICT (repo_id) DO UPDATE SET github_id = EXCLUDED.github_id, private = EXCLUDED.private, checked_at = now()`
  })

/** Whether GitHub said `repoId` is public: `None` until a step has read it. */
export const isPublic = (repoId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly private: boolean }>`
      SELECT private FROM github_repositories WHERE repo_id = ${repoId} AND private IS NOT NULL`
    return Option.map(Option.fromNullishOr(row), (found) => !found.private)
  })

/** What a person's write reads of their session: whether it is live, its sealed GitHub token, and when it expires. */
export interface SessionToken {
  readonly live: boolean
  readonly access: Sealed | null
  /** Epoch milliseconds; null for a token that doesn't expire. */
  readonly accessExpiresAt: number | null
  /** The role check the session's next check replaces (epoch ms): it names `auth/RecheckRole`'s execution. */
  readonly roleCheckedAt: number
}

const decodeSealed = Schema.decodeUnknownSync(Sealed)

/** Session `id`'s GitHub token, or `None` when there is no such session. */
export const sessionToken = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly live: boolean
      readonly access: unknown
      readonly accessExpiresAt: string | null
      readonly roleCheckedAt: string
    }>`
      SELECT revoked_at IS NULL AND expires_at > now() AS live, github_access AS access,
        (extract(epoch FROM github_access_expires_at) * 1000)::bigint::text AS "accessExpiresAt",
        (extract(epoch FROM role_checked_at) * 1000)::bigint::text AS "roleCheckedAt"
      FROM sessions WHERE id = ${id}::uuid`
    return Option.map(Option.fromNullishOr(row), (found): SessionToken => ({
      live: found.live,
      access: found.access === null ? null : decodeSealed(found.access),
      accessExpiresAt: found.accessExpiresAt === null ? null : Number(found.accessExpiresAt),
      roleCheckedAt: Number(found.roleCheckedAt),
    }))
  })
