import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer, Redacted } from "effect"
import { Migrator } from "effect/sql"
import messages from "./migrations/0001_messages.ts"
import answerAttempts from "./migrations/0002_answer_attempts.ts"
import pairedPositions from "./migrations/0003_paired_positions.ts"
import modelRoles from "./migrations/0004_model_roles.ts"
import signIn from "./migrations/0005_sign_in.ts"
import answerParts from "./migrations/0006_answer_parts.ts"
import repositories from "./migrations/0007_repositories.ts"
import browserAnswering from "./migrations/0008_browser_answering.ts"
import cloneIds from "./migrations/0009_clone_ids.ts"
import views from "./migrations/0010_views.ts"
import questionAskers from "./migrations/0011_question_askers.ts"
import modelReservations from "./migrations/0012_model_reservations.ts"
import runs from "./migrations/0013_runs.ts"
import branchWorkspace from "./migrations/0014_branch_workspace.ts"
import flows from "./migrations/0015_flows.ts"
import githubIssues from "./migrations/0016_github_issues.ts"
import modelCharges from "./migrations/0017_model_charges.ts"
import triage from "./migrations/0018_triage.ts"
import spendAlerts from "./migrations/0019_spend_alerts.ts"
import notifications from "./migrations/0020_notifications.ts"
import secrets from "./migrations/0021_secrets.ts"
import todos from "./migrations/0022_todos.ts"
import branchSharing from "./migrations/0023_branch_sharing.ts"
import sandboxCalls from "./migrations/0024_sandbox_calls.ts"
import flowSource from "./migrations/0025_flow_source.ts"

/** The compose Postgres (`docker-compose.yml`): what `DATABASE_URL` defaults to, and the only one tests use. */
export const LOCAL_URL = "postgresql://smithers:smithers@localhost:54321/smithers"

/** `DATABASE_URL`: the migrations, the tests, and the origin Hyperdrive fronts for ChatApi. */
export const url = Config.Redacted("DATABASE_URL").pipe(Config.withDefault(Redacted.make(LOCAL_URL)))

/**
 * `DATABASE_URL` in the parts Hyperdrive takes: the `origin` (host; port, 5432 when the URL names none; database,
 * user and password, URL-decoded), and the `sslmode` `alchemy dev` reaches it with: `require` when the URL asks for
 * it, otherwise `disable`.
 */
export const hyperdrive = (url: Redacted.Redacted<string>) => {
  const parsed = new URL(Redacted.value(url))
  return {
    origin: {
      scheme: "postgres" as const,
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
      database: decodeURIComponent(parsed.pathname.slice(1)),
      user: decodeURIComponent(parsed.username),
      password: Redacted.make(decodeURIComponent(parsed.password)),
    },
    sslmode: parsed.searchParams.get("sslmode") === "require" ? ("require" as const) : ("disable" as const),
  }
}

/**
 * A Postgres client as `PgClient` and `SqlClient`, connected for as long as the scope that builds the layer.
 * A Worker builds one per request, because workerd ties a socket to the request that opened it.
 */
export const layer = <E, R>(connectionString: Effect.Effect<Redacted.Redacted<string>, E, R>) =>
  Layer.unwrap(Effect.map(connectionString, (url) => PgClient.layer({ url, maxConnections: 1 })))

/** Every migration in `db/migrations`, by `<id>_<name>`. */
export const migrations = {
  "0001_messages": messages,
  "0002_answer_attempts": answerAttempts,
  "0003_paired_positions": pairedPositions,
  "0004_model_roles": modelRoles,
  "0005_sign_in": signIn,
  "0006_answer_parts": answerParts,
  "0007_repositories": repositories,
  "0008_browser_answering": browserAnswering,
  "0009_clone_ids": cloneIds,
  "0010_views": views,
  "0011_question_askers": questionAskers,
  "0012_model_reservations": modelReservations,
  "0013_runs": runs,
  "0014_branch_workspace": branchWorkspace,
  "0015_flows": flows,
  "0016_github_issues": githubIssues,
  "0017_model_charges": modelCharges,
  "0018_triage": triage,
  "0019_spend_alerts": spendAlerts,
  "0020_notifications": notifications,
  "0021_secrets": secrets,
  "0022_todos": todos,
  "0023_branch_sharing": branchSharing,
  "0024_sandbox_calls": sandboxCalls,
  "0025_flow_source": flowSource,
}

/** Applies every migration in `db/migrations` that hasn't run, in order; returns the ones it applied. */
export const migrate = Migrator.make({})({ loader: Migrator.fromRecord(migrations) })

/**
 * `pnpm db:migrate`: `migrate`, then one log line, `db:migrate: applied` with the migrations it applied as `applied`
 * (`<id>_<name>`, comma-separated), or `db:migrate: up to date`.
 */
export const migrateAndReport = Effect.gen(function* () {
  const applied = yield* migrate
  yield* Effect.logInfo(applied.length === 0 ? "db:migrate: up to date" : "db:migrate: applied").pipe(
    Effect.annotateLogs({ applied: applied.map(([id, name]) => `${id}_${name}`).join(", ") }),
  )
})
