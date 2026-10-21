import { Effect, Option } from "effect"
import { SqlClient } from "effect/sql"
import {
  itemId,
  type PausedReason,
  type TriageDecision,
  type TriageReason,
  type TriageState,
} from "../../src/features/issues/contract.ts"

// Triage's rows in Postgres (decision 0012 §5 and §6, docs/features/issues.md#triage, migration 0018_triage): the
// repository's settings, each issue's pin, and the decisions with their receipts. Each function is one statement on the
// `SqlClient` in context.

/** A repository's triage settings: who enabled it (the flow acts under their role), whether it is paused, its budget. */
export interface Settings {
  readonly repoId: string
  readonly enabledBy: string
  /** The enabler's GitHub login, for the App's attribution and the role re-check. */
  readonly enabledLogin: string | null
  readonly paused: boolean
  readonly pausedReason: PausedReason | null
  readonly dailyTokens: number
}

/** Repository `repoId`'s triage settings, or `None` when no Maintainer ever enabled triage on it. */
export const settingsOf = (repoId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<Settings>`
      SELECT repo_id AS "repoId", enabled_by AS "enabledBy", enabled_login AS "enabledLogin", paused,
        paused_reason AS "pausedReason", daily_tokens AS "dailyTokens"
      FROM triage_settings WHERE repo_id = ${repoId}`
    return Option.fromNullishOr(row)
  })

/** Whether triage runs on `repoId`: enabled and not paused. */
export const isOn = (repoId: string) =>
  Effect.map(settingsOf(repoId), (settings) => Option.isSome(settings) && !settings.value.paused)

/** Enables triage on `repoId` under `by` (a Maintainer), with a daily budget: unpaused, whoever enabled it before. */
export const enable = (
  repoId: string,
  by: { readonly actorId: string; readonly login: string | null; readonly dailyTokens: number },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO triage_settings (repo_id, enabled_by, enabled_login, enabled_at, paused, paused_reason, daily_tokens)
      VALUES (${repoId}, ${by.actorId}, ${by.login}, now(), false, NULL, ${by.dailyTokens})
      ON CONFLICT (repo_id) DO UPDATE SET enabled_by = EXCLUDED.enabled_by, enabled_login = EXCLUDED.enabled_login,
        enabled_at = EXCLUDED.enabled_at, paused = false, paused_reason = NULL, daily_tokens = EXCLUDED.daily_tokens,
        updated_at = now()`
  })

/** Pauses triage on `repoId` for `reason`, when it is enabled and running. Returns whether this paused it. */
export const pause = (repoId: string, reason: PausedReason) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      UPDATE triage_settings SET paused = true, paused_reason = ${reason}, updated_at = now()
      WHERE repo_id = ${repoId} AND NOT paused RETURNING repo_id`
    return rows.length > 0
  })

/** Issue `number`'s triage state and pin, as the projection has them; `None` before the issue's first read. */
export const itemTriage = (repoId: string, number: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly triage: TriageState; readonly pinned: boolean }>`
      SELECT triage, triage_pinned AS pinned FROM items WHERE id = ${itemId(repoId, number)} AND deleted_at IS NULL`
    return Option.fromNullishOr(row)
  })

/**
 * Pins issue `number` (a person triaged it: the flow never re-decides it) or unpins it (a person pressed Run triage
 * again). Returns whether the row changed.
 */
export const pin = (repoId: string, number: number, pinned: boolean) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      UPDATE items SET triage_pinned = ${pinned}
      WHERE id = ${itemId(repoId, number)} AND triage_pinned IS DISTINCT FROM ${pinned} RETURNING id`
    return rows.length > 0
  })

/** The tokens `repoId`'s flow decisions spent today (UTC): what its daily budget is checked against. */
export const spentToday = (repoId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly spent: string }>`
      SELECT COALESCE(sum(tokens), 0)::text AS spent FROM triage_decisions
      WHERE repo_id = ${repoId} AND via = 'flow' AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
    return Number(row!.spent)
  })

/** Why a decision wrote nothing. */
export type Dropped = "off" | "paused" | "pinned" | "relabeled" | "edited" | "gone" | "enabler_demoted" | "refused"

/** One decision: the flow's or a person's, with its receipts. */
export interface Decision {
  readonly id: string
  readonly repoId: string
  readonly number: number
  readonly via: "flow" | "person" | "github"
  readonly decidedBy: string | null
  readonly runId: string | null
  readonly writeId: string | null
  readonly guidelinesSha: string | null
  readonly inputDigest: string | null
  readonly triageBefore: TriageState | null
  readonly decision: TriageDecision | "abstain"
  readonly reason: TriageReason | null
  readonly abstained: string | null
  readonly tokens: number
  readonly labeled: boolean
  readonly commentGithubId: number | null
  readonly commentFailed: boolean
  readonly dropped: Dropped | null
}

/** Records decision `decision` once: a step run again after a crash finds its row there. Returns whether it inserted. */
export const recordDecision = (
  decision: Omit<Decision, "labeled" | "commentGithubId" | "commentFailed" | "dropped"> & {
    readonly labeled?: boolean
    readonly commentGithubId?: number | null
  },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      INSERT INTO triage_decisions (id, repo_id, item_id, number, via, decided_by, run_id, write_id, guidelines_sha,
        input_digest, triage_before, decision, reason, abstained, tokens, labeled_at, comment_github_id)
      VALUES (${decision.id}::uuid, ${decision.repoId}, ${itemId(decision.repoId, decision.number)}, ${decision.number},
        ${decision.via}, ${decision.decidedBy}, ${decision.runId}, ${decision.writeId}::uuid, ${decision.guidelinesSha},
        ${decision.inputDigest}, ${decision.triageBefore}, ${decision.decision}, ${decision.reason}, ${decision.abstained},
        ${decision.tokens}, ${decision.labeled === true ? sql`now()` : null}, ${decision.commentGithubId ?? null})
      ON CONFLICT (id) DO NOTHING RETURNING id`
    return rows.length > 0
  })

/** Decision `id`, or `None`. */
export const decisionOf = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<Omit<Decision, "commentGithubId"> & { readonly commentGithubId: string | null }>`
      SELECT id::text, repo_id AS "repoId", number, via, decided_by AS "decidedBy", run_id AS "runId",
        write_id::text AS "writeId", guidelines_sha AS "guidelinesSha", input_digest AS "inputDigest",
        triage_before AS "triageBefore", decision, reason, abstained, tokens, labeled_at IS NOT NULL AS labeled,
        comment_github_id::text AS "commentGithubId", comment_failed AS "commentFailed", dropped
      FROM triage_decisions WHERE id = ${id}::uuid`
    return Option.map(Option.fromNullishOr(row), (found): Decision => ({
      ...found,
      commentGithubId: found.commentGithubId === null ? null : Number(found.commentGithubId),
    }))
  })

/** The label receipt: decision `id` labeled the issue. Only a decision neither labeled nor dropped takes it. */
export const labeled = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE triage_decisions SET labeled_at = now()
      WHERE id = ${id}::uuid AND labeled_at IS NULL AND dropped IS NULL`
  })

/** Decision `id` wrote nothing, for `why`. Only a decision neither labeled nor dropped takes it. */
export const drop = (id: string, why: Dropped) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE triage_decisions SET dropped = ${why}
      WHERE id = ${id}::uuid AND labeled_at IS NULL AND dropped IS NULL`
  })

/** The comment receipt: GitHub's id of the comment decision `id` posted. */
export const commented = (id: string, githubId: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE triage_decisions SET comment_github_id = ${githubId}, comment_failed = false WHERE id = ${id}::uuid`
  })

/** Decision `id`'s comment failed past its retries: its label receipt stands, and nothing says the author was told. */
export const commentFailed = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE triage_decisions SET comment_failed = true WHERE id = ${id}::uuid AND comment_github_id IS NULL`
  })
