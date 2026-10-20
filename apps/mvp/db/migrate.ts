// pnpm db:migrate: applies db/migrations to DATABASE_URL (the compose Postgres by default).
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import * as Database from "./Database.ts"

NodeRuntime.runMain(Database.migrateAndReport.pipe(Effect.provide(Database.layer(Database.url))))
