import { PgClient } from "@effect/sql-pg"
import { Context, Data, Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import * as Database from "./Database.ts"

// The Postgres a test uses (docs/infrastructure.md#tests): the compose Postgres only, and there only a schema of its
// own, built by db/migrations and dropped after. A test never migrates the dev database, never touches the dev
// conversation, and never sees another test file's rows.

/** Tests can't use Postgres: `DATABASE_URL` names another server, or nothing answers at the compose Postgres. */
export class Unusable extends Data.TaggedError("TestDatabaseUnusable")<{ readonly message: string }> {}

/**
 * A test file's schema on the compose Postgres: its `name`, and `database`, which opens a client with the schema as
 * its `search_path` for the scope that builds it, as `Database.layer` does for ChatApi.
 */
export class Scratch extends Context.Service<
  Scratch,
  {
    readonly name: string
    readonly database: Layer.Layer<SqlClient.SqlClient | PgClient.PgClient, unknown>
  }
>()("@smthrs/mvp/test/Scratch") {}

const compose = new URL(Database.LOCAL_URL)

/** `DATABASE_URL`, the compose Postgres when unset, refused when it names another host or port. */
export const serverUrl = Effect.gen(function* () {
  const url = new URL(Redacted.value(yield* Database.url))
  if (url.hostname !== compose.hostname || url.port !== compose.port) {
    return yield* new Unusable({
      message: `Tests use only the compose Postgres at ${compose.host}, and DATABASE_URL names ${url.host}. Unset it.`,
    })
  }
  return url
})

/** Socket error codes that only say nothing listens there, or there is no route to it. */
const UNREACHABLE = new Set(["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN"])

/** Whether a failure only says the server isn't there: an unreachable socket error's code, on it or a cause of it. */
const unreachable = (error: unknown): boolean =>
  typeof error === "object" && error !== null &&
  (UNREACHABLE.has(String((error as { readonly code?: unknown }).code)) ||
    unreachable((error as { readonly cause?: unknown }).cause))

/**
 * A failure as a test reports it: `Unusable`, naming `pnpm db:up`, when it only says nothing answers at `host`, where
 * the compose `service` runs; any other failure as it is.
 */
export const explain = (service: string, host: string) => (error: unknown) =>
  unreachable(error) ? new Unusable({ message: `No ${service} answers at ${host}. Start it with pnpm db:up.` }) : error

/**
 * A schema named `<prefix>_<random>` on the compose Postgres, migrated by db/migrations: `Scratch`, and a `SqlClient`
 * of up to 4 connections on it. Connections name the schema as their `application_name`, so `pg_stat_activity`
 * tells them apart. The schema is dropped, with everything in it, when the layer's scope closes. Fails with
 * `Unusable` naming `pnpm db:up` when nothing answers at the compose Postgres; any other failure passes as it is.
 */
export const layer = (prefix: string) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const server = yield* serverUrl
      const name = `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`
      const scoped = new URL(server)
      scoped.searchParams.set("options", `-c search_path=${name}`)
      scoped.searchParams.set("application_name", name)
      const url = Redacted.make(scoped.toString())
      const database = Database.layer(Effect.succeed(url))
      const admin = yield* Layer.build(PgClient.layer({ url: Redacted.make(server.toString()), maxConnections: 1 }))
      const sql = Context.get(admin, SqlClient.SqlClient)
      yield* Effect.acquireRelease(
        sql`CREATE SCHEMA ${sql(name)}`,
        () => Effect.orDie(sql`DROP SCHEMA ${sql(name)} CASCADE`),
      )
      yield* Effect.provide(Database.migrate, database)
      return Layer.merge(
        Layer.succeed(Scratch, Scratch.of({ name, database })),
        PgClient.layer({ url, maxConnections: 4 }),
      )
    }).pipe(Effect.mapError(explain("Postgres", compose.host))),
  )
