// VibeLang defaults interface fields to readonly; preserve the exact mutable TypeScript contract.
import type { Effect } from "effect"
import type * as SqlClient from "effect/sql/SqlClient"

export interface CommitScope {
  readonly key: SqlClient.SqlClient["transactionService"]
  readonly transaction: SqlClient.TransactionConnection.Service
  readonly effects: Array<Effect.Effect<void>>
  open: boolean
}
