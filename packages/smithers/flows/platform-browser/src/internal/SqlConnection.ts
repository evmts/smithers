/**
 * The leader's one connection to the app's database, shared by every tab.
 *
 * Tabs send statements one at a time, and a tab's transaction spans several
 * of them, so the connection belongs to one tab from the statement that
 * opens a transaction to the one that ends it: SQLite's own autocommit flag
 * says which. Another tab's statement waits until then, so it never runs
 * inside a transaction it did not open, nor reads rows one did not commit.
 *
 * @since 1.0.0
 */

import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import type { SqlError } from "effect/sql/SqlError"
import * as BrowserSqlite from "../BrowserSqlite.ts"
import * as Statements from "./Statements.ts"

/**
 * What one statement returned: its rows, and whether it left a transaction
 * open that the same owner continues.
 *
 * @category models
 * @since 1.0.0
 */
export interface Result {
  readonly rows: ReadonlyArray<unknown>
  readonly open: boolean
}

/**
 * The owner's transaction is gone: rolled back because its tab ended, or held
 * by a leader that stopped.
 *
 * @category errors
 * @since 1.0.0
 */
export class TransactionLost extends Schema.TaggedError<TransactionLost>()(
  "@smthrs/platform-browser/TransactionLost",
  {}
) {}

/**
 * Connection operations.
 *
 * @category models
 * @since 1.0.0
 */
export interface Service {
  /**
   * Runs `sql` with `params` for `owner`. A statement waits while another
   * owner's transaction is open. With `continuing`, the statement belongs to
   * a transaction `owner` opened earlier, and fails with
   * {@link TransactionLost} when that transaction is no longer open.
   */
  readonly run: (
    owner: string,
    sql: string,
    params: ReadonlyArray<unknown>,
    continuing: boolean
  ) => Effect.Effect<Result, SqlError | TransactionLost>
  /** Rolls back `owner`'s open transaction, if it has one, and lends the connection again. */
  readonly abandon: (owner: string) => Effect.Effect<void>
}

/**
 * Service tag for the leader's connection to the app's database.
 *
 * @category services
 * @since 1.0.0
 */
export class SqlConnection extends Context.Service<SqlConnection, Service>()(
  "@smthrs/platform-browser/SqlConnection"
) {}

/**
 * Builds the connection's owner bookkeeping over an open database.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = (database: Statements.Database): Effect.Effect<Service, never, Scope.Scope> =>
  Effect.gen(function*() {
    // One statement at a time; `holder` and `released` change only under it.
    const statement = yield* Semaphore.make(1)
    let holder: { readonly owner: string; readonly released: Deferred.Deferred<void> } | undefined

    /** Runs `sql` and moves ownership by the autocommit flag it leaves. Under `statement`. */
    const execute = (owner: string, sql: string, params: ReadonlyArray<unknown>) =>
      Effect.tryPromise({
        try: () => Statements.runAll(database, sql, params, "object"),
        catch: (cause) => Statements.failed(cause, "Failed to execute statement", "execute")
      }).pipe(
        Effect.exit,
        Effect.flatMap((exit) => {
          const open = database.sqlite3.get_autocommit(database.db) === 0
          if (open && holder === undefined) holder = { owner, released: Deferred.makeUnsafe<void>() }
          if (!open && holder !== undefined) {
            Deferred.doneUnsafe(holder.released, Exit.void)
            holder = undefined
          }
          return Exit.map(exit, ({ rows }): Result => ({ rows, open }))
        })
      )

    type Outcome =
      | { readonly _tag: "Ran"; readonly result: Result }
      | { readonly _tag: "Wait"; readonly released: Deferred.Deferred<void> }
      | { readonly _tag: "Lost" }

    const run: Service["run"] = (owner, sql, params, continuing) =>
      statement.withPermits(1)(Effect.suspend((): Effect.Effect<Outcome, SqlError> => {
        const held = holder !== undefined && holder.owner === owner
        if (continuing && !held) return Effect.succeed({ _tag: "Lost" })
        if (holder !== undefined && !held) return Effect.succeed({ _tag: "Wait", released: holder.released })
        // A statement runs to its end once started.
        return Effect.uninterruptible(Effect.map(execute(owner, sql, params), (result) => ({ _tag: "Ran", result })))
      })).pipe(
        Effect.flatMap((outcome): Effect.Effect<Result, SqlError | TransactionLost> => {
          switch (outcome._tag) {
            case "Ran":
              return Effect.succeed(outcome.result)
            case "Lost":
              return Effect.fail(new TransactionLost())
            case "Wait":
              // Another owner's transaction is open: wait for it to end, then try again.
              return Effect.andThen(Deferred.await(outcome.released), run(owner, sql, params, continuing))
          }
        })
      )

    const abandon: Service["abandon"] = (owner) =>
      statement.withPermits(1)(Effect.suspend(() =>
        holder?.owner === owner ?
          Effect.uninterruptible(Effect.ignore(execute(owner, "ROLLBACK", [])))
          : Effect.void
      ))

    return SqlConnection.of({ run, abandon })
  })

/**
 * Provides the connection over `filename`, opened on the `BrowserSqlite.Sqlite`
 * service's VFS on a connection of its own, until the layer's scope closes.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer = (
  options: { readonly filename: string }
): Layer.Layer<SqlConnection, SqlError, BrowserSqlite.Sqlite> =>
  Layer.effect(SqlConnection, Effect.flatMap(BrowserSqlite.open(options.filename), make))
