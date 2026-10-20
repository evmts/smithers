import { PgClient } from "@effect/sql-pg"
import { Redacted } from "effect"

// The compose Postgres and Electric the tests run against (`pnpm db:up`), as docs/features/chat.md configures them.
export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://smithers:smithers@localhost:54321/smithers"
export const ELECTRIC_URL = process.env.ELECTRIC_URL ?? "http://localhost:30001"

/** A SqlClient on the compose Postgres. */
export const postgres = PgClient.layer({ url: Redacted.make(DATABASE_URL) })

/** A schema name no other test uses. */
export const scratchSchema = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`
