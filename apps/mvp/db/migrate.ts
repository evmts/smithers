// pnpm db:migrate: applies db/migrations to DATABASE_URL (the compose Postgres by default).
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import * as Database from "./Database.ts"

const program = Effect.gen(function* () {
  const applied = yield* Database.migrate
  yield* Effect.logInfo(applied.length === 0 ? "db:migrate: up to date" : "db:migrate: applied").pipe(
    Effect.annotateLogs({ applied: applied.map(([id, name]) => `${id}_${name}`).join(", ") }),
  )
})

NodeRuntime.runMain(program.pipe(Effect.provide(Database.layer(Database.url))))
