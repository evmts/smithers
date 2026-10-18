// The `ChatDatabase` Hyperdrive config ChatApi binds, and in production the deploy step that migrates Postgres first.
// Only alchemy.run.ts imports this file: it runs `db/migrations` from the deploying machine.
import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Output from "alchemy/Output"
import { Effect, FileSystem, type Redacted } from "effect"
import * as Database from "../db/Database.ts"
import { directUrl, Postgres } from "./Postgres.ts"

/**
 * Applies `db/migrations` to the production database with `Database.migrate`, the migrations `pnpm db:migrate` runs
 * locally. Alchemy runs it during a deploy whose input changed: a new database or a new migration file. It returns
 * the migration files it was run for.
 */
const Migrations = Alchemy.Action(
  "ChatMigrations",
  (input: { readonly database: Redacted.Redacted<string>; readonly migrations: ReadonlyArray<string> }) =>
    Database.migrateAndReport.pipe(
      Effect.as(input.migrations),
      Effect.provide(Database.layer(Effect.succeed(input.database))),
    ),
)

/** The migration files in `db/migrations`, in order. */
const migrationFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const files = yield* fs.readDirectory("db/migrations")
  return files.filter((file) => file.endsWith(".ts")).sort()
}).pipe(Effect.orDie)

/**
 * The `ChatDatabase` Hyperdrive config, with its query cache off: an answer's history must see the latest writes.
 * - Production: fronts the Neon project's direct host, and is created or updated only after the migrations ran, so
 *   ChatApi never deploys against an unmigrated database.
 * - `alchemy dev`: passes the binding straight through to `DATABASE_URL`, the compose Postgres by default.
 *
 * alchemy.run.ts declares it before ChatApi, so ChatApi's own `Hyperdrive.Connection("ChatDatabase", …)` resolves to
 * this one.
 */
export const ChatDatabase = Effect.gen(function* () {
  if (yield* Alchemy.ALCHEMY_DEV) {
    const { origin, sslmode } = Database.hyperdrive(yield* Database.url)
    return yield* Cloudflare.Hyperdrive.Connection("ChatDatabase", {
      origin,
      caching: { disabled: true },
      dev: { ...origin, sslmode },
    })
  }
  const postgres = yield* Postgres
  const migrated = yield* Migrations({ database: directUrl(postgres), migrations: yield* migrationFiles })
  return yield* Cloudflare.Hyperdrive.Connection("ChatDatabase", {
    origin: Output.map(Output.all(postgres.origin, migrated), ([origin]) => origin),
    caching: { disabled: true },
  })
})
