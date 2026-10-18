/**
 * Runs SQL on an open wa-sqlite database: the one statement loop
 * `BrowserSqlite.make` and the shared database's connection both use.
 *
 * @since 1.0.0
 */

import * as Record from "effect/Record"
import { classifySqliteError, SqlError } from "effect/sql/SqlError"

/**
 * An open wa-sqlite database: the API built from the module, and the
 * database handle `open_v2` returned.
 *
 * @category models
 * @since 1.0.0
 */
export interface Database {
  readonly sqlite3: SQLiteAPI
  readonly db: number
}

/**
 * A `SqlError` for a failure of `operation`, classified by SQLite's result
 * code when `cause` carries one.
 *
 * @category errors
 * @since 1.0.0
 */
export const failed = (cause: unknown, message: string, operation: string): SqlError =>
  new SqlError({ reason: classifySqliteError(cause, { message, operation }) })

/** `SQLITE_ROW`: `sqlite3_step` produced a row. */
const row = 100

/**
 * A value as wa-sqlite binds it:
 * - a JavaScript integer wider than 32 bits as a `bigint`, so it binds with
 *   `sqlite3_bind_int64` rather than `sqlite3_bind_double`;
 * - a `Date` as its ISO 8601 text, which wa-sqlite would otherwise bind as
 *   `NULL`.
 */
const bindable = (value: unknown): unknown =>
  typeof value === "number" && Number.isSafeInteger(value) && (value | 0) !== value ?
    BigInt(value)
    : value instanceof Date ?
    value.toISOString()
    : value

/**
 * Runs every statement in `sql`, binding `params` to each, and collects the
 * rows of those that return any, as objects keyed by column name or as
 * arrays. `columns` is `0` when no statement had result columns.
 *
 * @category running
 * @since 1.0.0
 */
export const runAll = async (
  { db, sqlite3 }: Database,
  sql: string,
  params: ReadonlyArray<unknown>,
  shape: "object" | "array"
): Promise<{ readonly rows: Array<unknown>; readonly columns: number }> => {
  const rows: Array<unknown> = []
  let columns = 0
  for await (const statement of sqlite3.statements(db, sql)) {
    sqlite3.bind_collection(statement, params.map(bindable) as Array<SQLiteCompatibleType>)
    const names = sqlite3.column_names(statement)
    columns += names.length
    while (await sqlite3.step(statement) === row) {
      const values = sqlite3.row(statement)
      if (shape === "array") {
        rows.push(values)
      } else {
        const entry: Record<string, unknown> = {}
        names.forEach((name, index) => Record.assignProperty(entry, name, values[index]))
        rows.push(entry)
      }
    }
  }
  return { rows, columns }
}
