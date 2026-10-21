/**
 * The leader's one connection to the app's database, shared by every tab.
 *
 * Tabs send statements one at a time, and a tab's transaction spans several
 * of them, so the connection belongs to one tab from the statement that
 * opens a transaction to the one that ends it: SQLite's own autocommit flag
 * says which. Another tab's statement waits until then, so it never runs
 * inside a transaction it did not open, nor reads rows one did not commit.
 *
 * Every change a tab's request commits carries the request's receipt
 * (`SqlProtocol.commits`) in the same SQLite transaction, so a later leader
 * can tell whether the request committed and never runs it twice:
 *
 * - A transaction a request opens is receipted inside it at once, after the
 *   statement that opened it.
 * - SQLite's commit hook refuses any commit of a tab's change that carries no
 *   receipt. A request whose change would commit on its own, outside a
 *   transaction, runs again inside a transaction the connection opens with
 *   its receipt, so all of it commits or none does. A request that both does
 *   that and opens a transaction of its own fails as SQLite fails a nested
 *   `BEGIN`.
 * - A read commits nothing, so it never pays for a receipt.
 *
 * @since 1.0.0
 */

import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Metric from "effect/Metric"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import type { SqlError } from "effect/sql/SqlError"
import * as BrowserSqlite from "../BrowserSqlite.ts"
import { statements } from "./Metrics.ts"
import * as SqlProtocol from "./SqlProtocol.ts"
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
 * The tab's request a statement runs for: `id`, its number, names it in the
 * receipt of every change it commits, and `at` is when it arrived. With
 * `undecided`, an earlier leader may have committed it and this one could not
 * read whether it did, so nothing of it may commit.
 *
 * @category models
 * @since 1.0.0
 */
export interface Request {
  readonly id: number
  readonly at: number
  readonly undecided: boolean
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
 * The connection could not record a request's receipt with what it changed,
 * so it rolled the change back: unrecorded, a later leader could not tell
 * whether it committed.
 *
 * @category errors
 * @since 1.0.0
 */
export class TransactionUnrecorded extends Schema.TaggedError<TransactionUnrecorded>()(
  "@smthrs/platform-browser/TransactionUnrecorded",
  {}
) {}

/**
 * The leader could not read whether an earlier leader committed a request,
 * so it committed nothing of it.
 *
 * @category errors
 * @since 1.0.0
 */
export class TransactionUndecided extends Schema.TaggedError<TransactionUndecided>()(
  "@smthrs/platform-browser/TransactionUndecided",
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
   * {@link TransactionLost} when that transaction is no longer open. With
   * `request`, every change it commits carries that request's receipt: a
   * change it can't record fails with {@link TransactionUnrecorded}, and one
   * an undecided request would commit with {@link TransactionUndecided}.
   */
  readonly run: {
    (
      owner: string,
      sql: string,
      params: ReadonlyArray<unknown>,
      continuing: boolean
    ): Effect.Effect<Result, SqlError | TransactionLost>
    (
      owner: string,
      sql: string,
      params: ReadonlyArray<unknown>,
      continuing: boolean,
      request: Request | undefined
    ): Effect.Effect<Result, SqlError | TransactionLost | TransactionUnrecorded | TransactionUndecided>
  }
  /** Whether this owner still holds an open transaction, including after a failed statement. */
  readonly isOpen: (owner: string) => boolean
  /**
   * Rolls back `owner`'s open transaction, if it has one, and lends the connection again.
   * A failed rollback poisons the connection, wakes its waiters with SQL errors,
   * and defects instead of reporting successful abandonment.
   */
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

/** The receipt of a transaction a request opened could not be written. */
class ReceiptFailed {
  readonly _tag = "ReceiptFailed"
}

/** The request running now: whether SQLite's commit hook refused one of its commits, and whether one went through. */
interface Guard {
  readonly undecided: boolean
  vetoed: boolean
  committed: boolean
}

/**
 * Builds the connection's owner bookkeeping over an open database.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = (database: Statements.Database): Effect.Effect<Service, never, Scope.Scope> =>
  Effect.gen(function*() {
    // One statement at a time; `holder`, `opened` and `guard` change only under it.
    const statement = yield* Semaphore.make(1)
    // A rollback SQLite refused: the connection still holds that transaction, so every later statement fails with it.
    let poisoned: SqlError | undefined
    let holder:
      | {
        readonly owner: string
        readonly released: Deferred.Deferred<void>
        readonly number: number
        receipted: boolean
      }
      | undefined
    // How many transactions have opened, so a request can tell the one it opened from a later one.
    let opened = 0
    let guard: Guard | undefined

    // A tab's change commits only in a transaction that holds its request's receipt, and an undecided one never.
    database.sqlite3.commit_hook(database.db, () => {
      if (guard === undefined) return 0
      if (!guard.undecided && holder?.receipted === true) {
        guard.committed = true
        return 0
      }
      guard.vetoed = true
      return 1
    })

    /** Moves ownership by the autocommit flag, receipting a transaction `request` just opened. Under `statement`. */
    const track = async (owner: string, request: Request | undefined) => {
      const open = database.sqlite3.get_autocommit(database.db) === 0
      if (open && holder === undefined) {
        holder = { owner, released: Deferred.makeUnsafe<void>(), number: ++opened, receipted: false }
        if (request !== undefined) {
          await Statements.runAll(
            database,
            `INSERT OR REPLACE INTO ${SqlProtocol.commits} (client, opened, at) VALUES (?, ?, ?)`,
            [owner, request.id, request.at],
            "object"
          ).catch(() => {
            throw new ReceiptFailed()
          })
          holder.receipted = true
        }
      }
      if (!open && holder !== undefined) {
        Deferred.doneUnsafe(holder.released, Exit.void)
        holder = undefined
      }
    }

    /** Runs `sql` and moves ownership after each statement. Under `statement`. */
    const execute = (owner: string, sql: string, params: ReadonlyArray<unknown>, request?: Request) =>
      Effect.tryPromise({
        try: () => Statements.runAll(database, sql, params, "object", () => track(owner, request)),
        catch: (cause) =>
          cause instanceof ReceiptFailed ? cause : Statements.failed(cause, "Failed to execute statement", "execute")
      }).pipe(
        // A statement that fails can still end a transaction, or leave one open.
        Effect.ensuring(Effect.promise(() => track(owner, undefined))),
        Effect.map(({ rows }): Result => ({ rows, open: holder?.owner === owner }))
      )

    /** Rolls back `owner`'s open transaction. Under `statement`. */
    /**
     * Rolls back `owner`'s open transaction. A ROLLBACK SQLite refuses leaves the transaction in the connection, so the
     * connection is poisoned: its waiters wake, and every later statement fails with the refusal. Under `statement`.
     */
    const rollback = (owner: string): Effect.Effect<void, SqlError> => {
      const abandoned = holder
      if (abandoned?.owner !== owner) return Effect.void
      return execute(owner, "ROLLBACK", []).pipe(
        Effect.catchTag("ReceiptFailed", Effect.die),
        Effect.catch((error) => {
          // The connection still contains the abandoned transaction. Fail closed,
          // and wake every waiter so none can hang or read its uncommitted data.
          poisoned = error
          Deferred.doneUnsafe(abandoned.released, Exit.void)
          holder = undefined
          return Metric.update(Metric.withAttributes(statements, { outcome: "abandon_failed" }), 1).pipe(
            Effect.andThen(
              Effect.logError("browser.runtime.statement").pipe(
                Effect.annotateLogs({ outcome: "abandon_failed", "error.type": error._tag })
              )
            ),
            Effect.andThen(Effect.fail(error))
          )
        }),
        Effect.asVoid
      )
    }

    /**
     * Runs a tab's request so that every change it commits carries its receipt. A change that would commit outside a
     * transaction is refused by the commit hook, rolled back, and the request runs again inside one with its receipt.
     * Under `statement`.
     */
    const receipted = (
      owner: string,
      sql: string,
      params: ReadonlyArray<unknown>,
      continuing: boolean,
      request: Request
    ): Effect.Effect<Result, SqlError | TransactionUnrecorded | TransactionUndecided> => {
      const current: Guard = { undecided: request.undecided, vetoed: false, committed: false }
      // What a failed request fails with: its own error, or the refusal of a change the commit hook or the receipt
      // refused.
      const failure = (error: SqlError | ReceiptFailed): SqlError | TransactionUnrecorded | TransactionUndecided =>
        error instanceof ReceiptFailed ?
          new TransactionUnrecorded()
          : current.vetoed ?
          (current.undecided ? new TransactionUndecided() : new TransactionUnrecorded())
          : error
      // A refused change is rolled back with the transaction it was in; a statement SQLite refused leaves its
      // transaction as SQLite left it.
      const refused = (error: SqlError | ReceiptFailed) =>
        error instanceof ReceiptFailed || current.vetoed ?
          rollback(owner).pipe(Effect.andThen(Effect.fail(failure(error))))
          : Effect.fail(error)
      // The request again, in a transaction opened with its receipt and committed at its end if it is still that one:
      // all of it commits, or none of it does.
      const wrapped = Effect.gen(function*() {
        current.vetoed = false
        yield* execute(owner, "BEGIN IMMEDIATE", [], request)
        const wrapper = holder?.number
        const result = yield* execute(owner, sql, params, request)
        if (holder !== undefined && holder.number === wrapper) yield* execute(owner, "COMMIT", [], request)
        return { rows: result.rows, open: holder?.owner === owner }
      }).pipe(Effect.catch((error) => rollback(owner).pipe(Effect.andThen(Effect.fail(failure(error))))))
      return Effect.suspend(() => {
        guard = current
        return execute(owner, sql, params, request)
      }).pipe(
        Effect.catch((error) =>
          // Refused before anything of it committed, outside a transaction it continues: it runs again, wrapped.
          current.vetoed && !current.undecided && !current.committed && !continuing ?
            rollback(owner).pipe(Effect.andThen(wrapped))
            : refused(error)
        ),
        Effect.ensuring(Effect.sync(() => {
          guard = undefined
        }))
      )
    }

    type Outcome =
      | { readonly _tag: "Ran"; readonly result: Result }
      | { readonly _tag: "Wait"; readonly released: Deferred.Deferred<void> }
      | { readonly _tag: "Lost" }

    const run = (
      owner: string,
      sql: string,
      params: ReadonlyArray<unknown>,
      continuing: boolean,
      request?: Request
    ): Effect.Effect<Result, SqlError | TransactionLost | TransactionUnrecorded | TransactionUndecided> =>
      statement.withPermits(1)(Effect.suspend((): Effect.Effect<
        Outcome,
        SqlError | TransactionUnrecorded | TransactionUndecided
      > => {
        if (poisoned !== undefined) return Effect.fail(poisoned)
        const held = holder !== undefined && holder.owner === owner
        if (continuing && !held) return Effect.succeed({ _tag: "Lost" })
        if (holder !== undefined && !held) return Effect.succeed({ _tag: "Wait", released: holder.released })
        // A statement runs to its end once started.
        return Effect.uninterruptible(Effect.map(
          request === undefined ?
            // Only a request's statements write a receipt.
            execute(owner, sql, params).pipe(Effect.catchTag("ReceiptFailed", Effect.die))
            : receipted(owner, sql, params, continuing, request),
          (result) => ({ _tag: "Ran", result })
        ))
      })).pipe(
        Effect.flatMap((outcome): Effect.Effect<
          Result,
          SqlError | TransactionLost | TransactionUnrecorded | TransactionUndecided
        > => {
          switch (outcome._tag) {
            case "Ran":
              return Effect.succeed(outcome.result)
            case "Lost":
              return Effect.fail(new TransactionLost())
            case "Wait":
              // Another owner's transaction is open: wait for it to end, then try again.
              return Effect.andThen(Deferred.await(outcome.released), run(owner, sql, params, continuing, request))
          }
        })
      )

    const abandon: Service["abandon"] = (owner) =>
      statement.withPermits(1)(
        Effect.suspend(() =>
          poisoned !== undefined ? Effect.die(poisoned) : Effect.uninterruptible(Effect.orDie(rollback(owner)))
        )
      ).pipe(Effect.withSpan("browser.runtime.abandon"))

    return SqlConnection.of({ run: run as Service["run"], abandon, isOpen: (owner) => holder?.owner === owner })
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
