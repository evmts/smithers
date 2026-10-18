import { Config, Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import type { CapacityReason, Failure, Status } from "../src/features/repo/contract.ts"

// The `repositories` table and Code Storage's spend (docs/features/repo.md, decision 0006 "Capacity and spend"): asking
// for a clone, admission, settling, and metering what Code Storage serves. Code Storage bills usage above its minimum
// and never stops us, so the budgets here are the only cap. Every function runs against the `SqlClient` in context.

/** Code Storage's prices (code.storage/pricing, 2026-10-19), for the monthly estimate the alerts read. */
const USD_PER_GB_MONTH_STORED = 3.6
const USD_PER_GB_READ = 0.15
const USD_PER_GB_IMPORTED = 0.06
const GB = 1_000_000_000

/** The thresholds of `REPO_BUDGET_USD` that alert, once a month each. */
export const ALERT_THRESHOLDS = [50, 80, 100] as const

/**
 * The deployment's Code Storage budgets, read from Effect `Config` (defaults hold a worst-case month to about $17):
 * - `maxRepositories` (`REPO_MAX_REPOSITORIES`, 100): `cloning` and `ready` rows;
 * - `maxStoredBytes` (`REPO_MAX_STORED_GB`, 3): their `stored_bytes` together;
 * - `maxReadBytes` (`REPO_MAX_READ_GB_PER_MONTH`, 40): what Code Storage served this UTC month;
 * - `maxRepositoryBytes` (`REPO_MAX_SIZE_MB`, 1,000): one repository's size on GitHub;
 * - `budgetUsd` (`REPO_BUDGET_USD`, 20): the base the spend alerts compare with.
 */
export interface Budgets {
  readonly maxRepositories: number
  readonly maxStoredBytes: number
  readonly maxReadBytes: number
  readonly maxRepositoryBytes: number
  readonly budgetUsd: number
}

const positive = Schema.Number.check(Schema.isGreaterThan(0))
const count = Schema.Int.check(Schema.isGreaterThan(0))

/** Reads {@link Budgets}. */
export const budgets = Effect.gen(function* () {
  const maxRepositories = yield* Config.schema(count, "REPO_MAX_REPOSITORIES").pipe(Config.withDefault(100))
  const storedGb = yield* Config.schema(positive, "REPO_MAX_STORED_GB").pipe(Config.withDefault(3))
  const readGb = yield* Config.schema(positive, "REPO_MAX_READ_GB_PER_MONTH").pipe(Config.withDefault(40))
  const sizeMb = yield* Config.schema(positive, "REPO_MAX_SIZE_MB").pipe(Config.withDefault(1_000))
  const budgetUsd = yield* Config.schema(positive, "REPO_BUDGET_USD").pipe(Config.withDefault(20))
  return {
    maxRepositories,
    maxStoredBytes: storedGb * GB,
    maxReadBytes: readGb * GB,
    maxRepositoryBytes: sizeMb * 1_000_000,
    budgetUsd,
  } satisfies Budgets
})

/** The attempt's columns: `attempt`, `clone_id` as `"cloneId"`, and `requested_at` in epoch ms as `"requestedAt"`. */
const attemptColumns = (sql: SqlClient.SqlClient) =>
  sql`attempt, clone_id::text AS "cloneId", (extract(epoch FROM requested_at) * 1000)::float8 AS "requestedAt"`

/** This UTC month's first day, as `code_storage_usage.month`. */
const thisMonth = (sql: SqlClient.SqlClient) => sql`(date_trunc('month', now() AT TIME ZONE 'UTC'))::date`

/**
 * What asking for a clone did:
 * - `started`: a new row, or a failed or refused one reset for a new attempt, in transaction `txid`;
 * - `existing`: the repository is already `cloning` or `ready`, and nothing changed;
 * - `limit`: `maxRepositories` rows are already `cloning` or `ready`.
 */
export type Requested =
  | ({ readonly kind: "started"; readonly txid: number } & Clone)
  | ({ readonly kind: "existing"; readonly status: Status } & Clone)
  | { readonly kind: "limit" }

/**
 * The clone a row asks for: who asked for it as which repository; its attempt, counted from 1, and the attempt's own
 * id, a UUID drawn when the attempt was created, which names its execution and fences its writes; and when it was
 * asked for (epoch ms).
 */
export interface Clone {
  readonly owner: string
  readonly name: string
  readonly attempt: number
  readonly cloneId: string
  readonly requestedAt: number
}

/** The attempt that owns a row: the repository and the attempt's own id. */
export interface Attempt {
  readonly id: string
  readonly cloneId: string
}

/**
 * Asks for a clone of `owner/name` under `id`, in one transaction that holds `repo_imports`' row, so two requests
 * can't both take the last place under `maxRepositories`.
 */
export const request = (repository: { readonly id: string; readonly owner: string; readonly name: string }, limits: Budgets) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function* () {
      yield* sql`SELECT 1 FROM repo_imports WHERE id = 1 FOR UPDATE`
      const [existing] = yield* sql<Clone & { readonly status: Status }>`
        SELECT status, owner, name, ${attemptColumns(sql)} FROM repositories WHERE id = ${repository.id} FOR UPDATE`
      if (existing !== undefined && (existing.status === "cloning" || existing.status === "ready")) {
        const { status, owner, name, attempt, cloneId, requestedAt } = existing
        return { kind: "existing", status, owner, name, attempt, cloneId, requestedAt } satisfies Requested
      }
      const [held] = yield* sql<{ readonly n: number }>`
        SELECT count(*)::int AS n FROM repositories WHERE status IN ('cloning', 'ready')`
      if (held!.n >= limits.maxRepositories) return { kind: "limit" } satisfies Requested
      const [row] = existing === undefined
        ? yield* sql<Clone & { readonly txid: string }>`
          INSERT INTO repositories (id, owner, name, status) VALUES (${repository.id}, ${repository.owner}, ${repository.name}, 'cloning')
          RETURNING owner, name, ${attemptColumns(sql)}, pg_current_xact_id()::xid::text AS txid`
        : yield* sql<Clone & { readonly txid: string }>`
          UPDATE repositories SET status = 'cloning', attempt = attempt + 1, clone_id = gen_random_uuid(),
            owner = ${repository.owner},
            name = ${repository.name}, failure = NULL, capacity = NULL, stored_bytes = NULL, retry_at = NULL,
            requested_at = now(), settled_at = NULL
          WHERE id = ${repository.id}
          RETURNING owner, name, ${attemptColumns(sql)}, pg_current_xact_id()::xid::text AS txid`
      const { txid, owner, name, attempt, cloneId, requestedAt } = row!
      return { kind: "started", txid: Number(txid), owner, name, attempt, cloneId, requestedAt } satisfies Requested
    }))
  })

/** What GitHub said about a repository's size: its bytes, or that it is rate limiting until `retryAt` (epoch ms). */
export type Size = { readonly bytes: number } | { readonly retryAt: number }

/** Admission's verdict: admitted with the size it recorded, or refused by a budget. */
export type Admission =
  | { readonly admitted: true; readonly storedBytes: number }
  | {
    readonly admitted: false
    readonly reason: CapacityReason
    readonly storedBytes: number | null
    readonly retryAt: number | null
  }

/**
 * Admits attempt `cloneId` of clone `id` against the budgets, in one transaction that holds `repo_imports`' row so
 * two imports can't both take the last headroom. The first rule that holds decides: imports `paused`; GitHub withheld
 * the size (`size_unknown`); over `maxRepositoryBytes` (`too_large`); stored bytes plus this one over
 * `maxStoredBytes` (`storage`); this month's reads at `maxReadBytes` (`reads`); else admitted, writing `stored_bytes`.
 * Running it again for the same attempt decides the same: the repository's own row never counts against it.
 */
export const admit = (clone: Attempt, size: Size, limits: Budgets) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function* () {
      const [imports] = yield* sql<{ readonly paused: boolean }>`
        SELECT paused FROM repo_imports WHERE id = 1 FOR UPDATE`
      const refuse = (reason: CapacityReason, storedBytes: number | null = null, retryAt: number | null = null) =>
        ({ admitted: false, reason, storedBytes, retryAt }) satisfies Admission
      if (imports!.paused) return refuse("paused")
      if ("retryAt" in size) return refuse("size_unknown", null, size.retryAt)
      if (size.bytes > limits.maxRepositoryBytes) return refuse("too_large", size.bytes)
      const [stored] = yield* sql<{ readonly bytes: string }>`
        SELECT coalesce(sum(stored_bytes), 0)::text AS bytes FROM repositories
        WHERE status IN ('cloning', 'ready') AND id <> ${clone.id}`
      if (Number(stored!.bytes) + size.bytes > limits.maxStoredBytes) return refuse("storage", size.bytes)
      if ((yield* readThisMonth) >= limits.maxReadBytes) return refuse("reads", size.bytes)
      yield* sql`
        UPDATE repositories SET stored_bytes = ${size.bytes}
        WHERE id = ${clone.id} AND clone_id = ${clone.cloneId} AND status = 'cloning'`
      return { admitted: true, storedBytes: size.bytes } satisfies Admission
    }))
  })

/** Bytes Code Storage served this UTC month. */
export const readThisMonth = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const [row] = yield* sql<{ readonly bytes: string }>`
    SELECT coalesce(sum(bytes_read), 0)::text AS bytes FROM code_storage_usage WHERE month = ${thisMonth(sql)}`
  return Number(row!.bytes)
})

/** Whether this month's reads have reached the budget: a cache miss is then refused. */
export const readsSpent = (limits: Budgets) => Effect.map(readThisMonth, (bytes) => bytes >= limits.maxReadBytes)

/**
 * What a metered write found: this month's estimated spend in dollars, the bytes stored, and the threshold it
 * crossed for the first time this month, if any.
 */
export interface Spend {
  readonly estimateUsd: number
  readonly storedBytes: number
  readonly alert: number | null
}

/**
 * Recomputes this month's estimate (stored GB × $3.60 + read GB × $0.15 + imported GB × $0.06) after a write to
 * `code_storage_usage`, and raises `alerted_pct` to the highest threshold of `budgetUsd` it crossed. Run inside the
 * write's transaction, so each threshold is crossed once a month.
 */
const recompute = (sql: SqlClient.SqlClient, limits: Budgets, usage: { readonly read: number; readonly imported: number; readonly alerted: number }) =>
  Effect.gen(function* () {
    const [stored] = yield* sql<{ readonly bytes: string }>`
      SELECT coalesce(sum(stored_bytes), 0)::text AS bytes FROM repositories WHERE status IN ('cloning', 'ready')`
    const storedBytes = Number(stored!.bytes)
    const estimateUsd = (storedBytes * USD_PER_GB_MONTH_STORED + usage.read * USD_PER_GB_READ +
      usage.imported * USD_PER_GB_IMPORTED) / GB
    const percent = (estimateUsd / limits.budgetUsd) * 100
    const crossed = ALERT_THRESHOLDS.filter((threshold) => percent >= threshold && threshold > usage.alerted).at(-1)
    if (crossed !== undefined) {
      yield* sql`UPDATE code_storage_usage SET alerted_pct = ${crossed} WHERE month = ${thisMonth(sql)}`
    }
    return { estimateUsd, storedBytes, alert: crossed ?? null } satisfies Spend
  })

interface UsageRow {
  readonly read: string
  readonly imported: string
  readonly alerted: number
}

const usageOf = (row: UsageRow) => ({ read: Number(row.read), imported: Number(row.imported), alerted: row.alerted })

/** Adds `bytes` Code Storage served to this month's reads, and recomputes the spend. */
export const meterRead = (bytes: number, limits: Budgets) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function* () {
      const [row] = yield* sql<UsageRow>`
        INSERT INTO code_storage_usage (month, bytes_read) VALUES (${thisMonth(sql)}, ${bytes})
        ON CONFLICT (month) DO UPDATE SET bytes_read = code_storage_usage.bytes_read + EXCLUDED.bytes_read
        RETURNING bytes_read::text AS read, bytes_imported::text AS imported, alerted_pct AS alerted`
      return yield* recompute(sql, limits, usageOf(row!))
    }))
  })

/** A clone's head commit once Code Storage has synced it. */
export interface Head {
  readonly sha: string
  readonly message: string
  readonly author: string
  readonly at: string
}

/** How a clone ended, as `repo/Settle` writes it. */
export type Outcome =
  | { readonly status: "ready"; readonly defaultBranch: string; readonly head: Head }
  | { readonly status: "failed"; readonly failure: Failure }
  | {
    readonly status: "capacity"
    readonly capacity: CapacityReason
    readonly storedBytes: number | null
    readonly retryAt: number | null
  }

/**
 * Writes how attempt `cloneId` of clone `id` ended, only while that attempt still owns a `cloning` row: a stale
 * attempt, one settled already, or one from before the table was reset or restored, changes nothing and answers
 * `settled: false`. The attempt's id fences it, never the `attempt` counter, which restarts after a reset. A clone
 * that became `ready` adds its `stored_bytes` to this month's imported bytes and recomputes the spend, in the same
 * transaction.
 */
export const settle = (clone: Attempt, outcome: Outcome, limits: Budgets) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function* () {
      const fields = outcome.status === "ready"
        ? {
          status: "ready",
          default_branch: outcome.defaultBranch,
          head_sha: outcome.head.sha,
          head_message: outcome.head.message,
          head_author: outcome.head.author,
          head_at: outcome.head.at,
        }
        : outcome.status === "failed"
        ? { status: "failed", failure: outcome.failure }
        : {
          status: "capacity",
          capacity: outcome.capacity,
          stored_bytes: outcome.storedBytes,
          retry_at: outcome.retryAt === null ? null : new Date(outcome.retryAt).toISOString(),
        }
      const [row] = yield* sql<{ readonly bytes: string | null }>`
        UPDATE repositories SET ${sql.update(fields)}, settled_at = now()
        WHERE id = ${clone.id} AND clone_id = ${clone.cloneId} AND status = 'cloning'
        RETURNING stored_bytes::text AS bytes`
      if (row === undefined) return { settled: false, spend: null }
      if (outcome.status !== "ready") return { settled: true, spend: null }
      // Admission wrote the size before Import, so a ready row always has one.
      const imported = Number(row.bytes)
      const [usage] = yield* sql<UsageRow>`
        INSERT INTO code_storage_usage (month, bytes_imported) VALUES (${thisMonth(sql)}, ${imported})
        ON CONFLICT (month) DO UPDATE SET bytes_imported = code_storage_usage.bytes_imported + EXCLUDED.bytes_imported
        RETURNING bytes_read::text AS read, bytes_imported::text AS imported, alerted_pct AS alerted`
      return { settled: true, spend: yield* recompute(sql, limits, usageOf(usage!)) }
    }))
  })
