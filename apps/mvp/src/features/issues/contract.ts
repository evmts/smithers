// The issues feature's contract between the browser, ChatApi's GitHub routes, the remote GitHub flows and the tests
// (docs/features/issues.md, decision 0012 slice G0): the one home of every value they share. Nothing here imports a
// library, so every side can.

import { REPOS_ROUTE } from "../repo/contract"

/** GitHub's webhook: `POST`, signed with `X-Hub-Signature-256` (decision 0012 §2). */
export const GITHUB_WEBHOOK_ROUTE = "/api/github/webhook"

/** The last segment of `POST /api/repos/<owner>/<name>/writes`, the one route every git write goes through (§4). */
export const WRITES_SEGMENT = "writes"

/** `POST /api/repos/<owner>/<name>/writes`. */
export const writesRoute = (owner: string, name: string): string =>
  `${REPOS_ROUTE}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${WRITES_SEGMENT}`

/** Electric shape proxies: `GET`. Each serves one table with an explicit column list. */
export const ITEMS_SHAPE_ROUTE = "/api/shapes/items"
export const COMMENTS_SHAPE_ROUTE = "/api/shapes/comments"
export const WRITES_SHAPE_ROUTE = "/api/shapes/github-writes"
export const SYNC_SHAPE_ROUTE = "/api/shapes/github-sync"

/** The Postgres tables (migration `0016_github_issues`). */
export const ITEMS_TABLE = "items"
export const COMMENTS_TABLE = "comments"
export const WRITES_TABLE = "github_writes"
export const SYNC_TABLE = "github_sync"

/**
 * The `items` columns a device syncs: all but `source_updated_at` and `fetched_at`, the server's ordering guard. Listed,
 * so a column added later stays on the server until it is named here.
 */
export const ITEM_COLUMNS = [
  "id",
  "repo_id",
  "number",
  "kind",
  "github_id",
  "title",
  "body",
  "state",
  "state_reason",
  "author_login",
  "comments",
  "created_at",
  "updated_at",
  "closed_at",
  "deleted_at",
  "write_id",
] as const

/** The `comments` columns a device syncs. */
export const COMMENT_COLUMNS = [
  "id",
  "repo_id",
  "item_id",
  "github_id",
  "author_login",
  "body",
  "created_at",
  "updated_at",
  "deleted_at",
  "write_id",
] as const

/** The `github_writes` columns a device syncs: never the payload, the session or the actor, which the shape filters on. */
export const WRITE_COLUMNS = ["id", "repo_id", "op", "status", "failure", "item_number", "created_at", "settled_at"] as const

/** The `github_sync` columns a device syncs: never the cursor. */
export const SYNC_COLUMNS = ["repo_id", "stream", "synced_at", "complete", "failure"] as const

/** The one sync stream of G0: a repository's issues and their comments, walked by change time (`GitHub.Sync`). */
export const ISSUES_STREAM = "issues"

/**
 * A row's id: `<repoId>#<number>` for an issue, `<repoId>/comment/<GitHub's comment id>` for a comment. Derived, so the
 * device names a row from its route and the server upserts it from either a webhook or a listing.
 */
export const itemId = (repoId: string, number: number): string => `${repoId}#${number}`
export const commentId = (repoId: string, githubId: number): string => `${repoId}/comment/${githubId}`

/** The writes this slice takes (decision 0012 §3): open an issue, comment on one. */
export const WRITE_OPS = ["issue/create", "issue/comment"] as const
export type WriteOp = (typeof WRITE_OPS)[number]

/**
 * Who a write acts for: the person's own act runs with their GitHub token, so GitHub shows them; the agent's runs as the
 * App and its text says whom it acted for (decision 0012 §5, question 1).
 */
export const WRITE_VIAS = ["person", "agent"] as const
export type WriteVia = (typeof WRITE_VIAS)[number]

/** The longest title GitHub keeps, in characters. */
export const MAX_TITLE_LENGTH = 256

/**
 * The longest body this app sends, in characters: GitHub's 65,536 less room for the hidden write marker and the agent's
 * attribution line.
 */
export const MAX_BODY_LENGTH = 65_000

/** The largest `POST .../writes` body, in bytes: a body of `MAX_BODY_LENGTH` four-byte characters and its JSON. */
export const MAX_WRITE_BYTES = 4 * (MAX_BODY_LENGTH + MAX_TITLE_LENGTH) + 1024

/** The largest webhook body GitHub sends that ChatApi reads; over it, `413` and Reconcile covers the subject. */
export const MAX_WEBHOOK_BYTES = 5 * 1024 * 1024

/** A write's status: on its way to GitHub, done, failed for good after retries, or refused. */
export const WRITE_STATUSES = ["pending", "done", "failed", "refused"] as const
export type WriteStatus = (typeof WRITE_STATUSES)[number]

/**
 * Why a write didn't reach GitHub: the person's session ended (`sign_in_required`), GitHub or our role check refused it
 * (`not_allowed`), the issue is gone (`not_found`), GitHub refused the content (`invalid`), the App isn't installed on
 * the repository (`app_not_installed`), or GitHub stayed unreachable past the retries (`unavailable`).
 */
export const WRITE_FAILURES = [
  "sign_in_required",
  "not_allowed",
  "not_found",
  "invalid",
  "app_not_installed",
  "unavailable",
] as const
export type WriteFailure = (typeof WRITE_FAILURES)[number]

/**
 * The refusal codes the writes route answers with, as `{ code }`: `invalid` (400), `authentication` (401), `forbidden`
 * (403: no role on the repository), `not_found` (404: a repository this deployment doesn't sync), `conflict` (409: the
 * write id was used for another payload), `too_large` (413), `not_configured` (503: no GitHub App) and `unavailable`
 * (503).
 */
export const WRITE_REFUSALS = [
  "invalid",
  "authentication",
  "forbidden",
  "not_found",
  "conflict",
  "too_large",
  "not_configured",
  "unavailable",
] as const
export type WriteRefusal = (typeof WRITE_REFUSALS)[number]

/** How long a repository's sync may get before a read of its issues starts `github/Reconcile` (decision 0012 §2). */
export const SYNC_STALE_MS = 5 * 60 * 1000

/** The reconcile run a stale read starts: one per repository and 5-minute bucket, so every read in it starts the same one. */
export const reconcileExecutionId = (repoId: string, nowMs: number): string =>
  `github-reconcile:${repoId}:${Math.floor(nowMs / SYNC_STALE_MS)}`

/** A webhook delivery's run: one per `X-GitHub-Delivery`. */
export const applyExecutionId = (deliveryId: string): string => `github-apply:${deliveryId}`

/** A write's run: one per write id. */
export const writeExecutionId = (writeId: string): string => `github-write:${writeId}`

/**
 * The namespace a client flow's write id is derived in (RFC 9562 version 5, `@smthrs/crypto`'s `Uuid.v5`): the write id
 * of an `issue/create` or `issue/comment` run is its execution id's UUID in this namespace, so the run's step names the
 * same write however often it runs.
 */
export const WRITE_ID_NAMESPACE = "6f9c1b2e-5d4a-4c8e-9b7f-0a1d2c3e4f50"

/** The engine channel a write step asks the tab that started it on: `<engine name>/issues`. */
export const issuesChannel = (engineName: string): string => `${engineName}/issues`

/** How long a write step waits for the tab that asked to put the write in its outbox. */
export const QUEUE_WITHIN = "10 seconds"

/** The app's issue routes: GitHub's paths (decision 0012 §6). */
export const issuesPath = (owner: string, name: string): string => `/${owner}/${name}/issues`
export const newIssuePath = (owner: string, name: string): string => `/${owner}/${name}/issues/new`
export const issuePath = (owner: string, name: string, number: number): string => `/${owner}/${name}/issues/${number}`

/** The issue on github.com: "Open on GitHub ↗". */
export const githubIssueUrl = (owner: string, name: string, number: number): string =>
  `https://github.com/${owner}/${name}/issues/${number}`

/** The largest issue number a route or a payload takes: Postgres `integer`. */
export const MAX_ISSUE_NUMBER = 2_147_483_647

/** An issue route's `$number` as the number it names, or `undefined` for anything but 1 to `MAX_ISSUE_NUMBER`. */
export const issueNumberOf = (text: string): number | undefined => {
  if (!/^[1-9][0-9]{0,9}$/.test(text)) return undefined
  const number = Number(text)
  return number <= MAX_ISSUE_NUMBER ? number : undefined
}

/** A draft's key on the device: the new-issue form's per repository, the comment composer's per issue. */
export const newDraftKey = (repoId: string): string => `new:${repoId}`
export const commentDraftKey = (repoId: string, number: number): string => `comment:${itemId(repoId, number)}`

/** The line the agent's text ends with on GitHub: agent text never shows under a person's name (decision 0012 §5). */
export const agentAttribution = (login: string): string => `Smithers for @${login}`

/**
 * Why a write this device made stays Not sent: the route refused it (`WriteRefusal`, by its status), or the server's
 * write settled refused or failed (`WriteFailure`). The route's `unavailable` and `not_configured` (503) are sent again,
 * so they never stay.
 */
export const NOT_SENT_REASONS = [
  "invalid",
  "authentication",
  "forbidden",
  "not_found",
  "conflict",
  "too_large",
  "sign_in_required",
  "not_allowed",
  "app_not_installed",
  "unavailable",
] as const satisfies ReadonlyArray<Exclude<WriteRefusal, "unavailable" | "not_configured"> | WriteFailure>
export type NotSentReason = (typeof NOT_SENT_REASONS)[number]

/** The route's refusal of a send, by status: the rest (429, 5xx, no answer) are sent again. */
export const refusalOf = (status: number | undefined): NotSentReason | undefined =>
  status === 400
    ? "invalid"
    : status === 401
    ? "authentication"
    : status === 403
    ? "forbidden"
    : status === 404
    ? "not_found"
    : status === 409
    ? "conflict"
    : status === 413
    ? "too_large"
    : undefined

/** What a Not sent write says, by its reason. */
export const NOT_SENT_COPY: Readonly<Record<NotSentReason, string>> = {
  invalid: "Invalid",
  authentication: "Sign in",
  sign_in_required: "Sign in",
  forbidden: "Not allowed",
  not_allowed: "Not allowed",
  not_found: "Not found",
  conflict: "Conflict",
  too_large: "Too long",
  app_not_installed: "App not installed",
  unavailable: "GitHub unavailable",
}

/** Buttons and states. */
export const NEW_ISSUE = "New issue"
export const ISSUES = "Issues"
export const EDIT = "Edit"
export const DISCARD = "Discard"
export const NOT_FOUND = "Not found"

/** What the issues feature records (docs/observability.md), by name, and the attributes they carry: never text. */
export const ISSUES_TELEMETRY = {
  records: [
    "issues.write.queue",
    "issues.write.send",
    "issues.pending",
    "smithers_issue_writes",
    "smithers_issue_write_sends",
    "smithers_issue_pending_actions",
    "execute_tool issue/create",
    "execute_tool issue/comment",
  ],
  fields: ["op", "door", "via", "outcome", "status", "writeId", "durationMs", "reason", "action"],
} as const
