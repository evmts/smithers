// VibeLang limitation: top-level Effect values cannot be constructed in a program module.
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"
import { migration } from "./0001_initial-body.vibe"
export const value: Effect.Effect<void, unknown, SqlClient.SqlClient> = Effect.suspend(migration)
