import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer, Redacted } from "effect"
import { Migrator } from "effect/sql"
import messages from "./migrations/0001_messages.ts"
import answerAttempts from "./migrations/0002_answer_attempts.ts"

/** The compose Postgres (`docker-compose.yml`): what `DATABASE_URL` defaults to. */
export const LOCAL_URL = "postgresql://smithers:smithers@localhost:54321/smithers"

/** `DATABASE_URL`: the migrations, the tests, and the origin Hyperdrive fronts for ChatApi. */
export const url = Config.Redacted("DATABASE_URL").pipe(Config.withDefault(Redacted.make(LOCAL_URL)))

/**
 * A Postgres client as `PgClient` and `SqlClient`, connected for as long as the scope that builds the layer.
 * A Worker builds one per request and one per background answer, because workerd ties a socket to the
 * request that opened it.
 */
export const layer = <E, R>(connectionString: Effect.Effect<Redacted.Redacted<string>, E, R>) =>
  Layer.unwrap(Effect.map(connectionString, (url) => PgClient.layer({ url, maxConnections: 1 })))

/** Applies every migration in `db/migrations` that hasn't run, in order; returns the ones it applied. */
export const migrate = Migrator.make({})({
  loader: Migrator.fromRecord({ "0001_messages": messages, "0002_answer_attempts": answerAttempts }),
})
