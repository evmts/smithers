/** PostgreSQL adapter for the same injected SQL and durable-write services.
 *
 * It is correct behind a transaction-pooling proxy such as Cloudflare
 * Hyperdrive or PgBouncer with `pool_mode=transaction`. Such a proxy runs each
 * transaction on whichever server connection is free, so a session setting is
 * lost for the client that made it, and a proxy that does not reset its
 * connections hands it to the next client. This adapter therefore changes no
 * session state: every statement runs inside a transaction that sets the
 * schema for itself alone.
 *
 * The socket driver is injected. `@effect/sql-pg` connects through `node:net`
 * and `node:tls`, which Node, Bun and Workers with `nodejs_compat` supply and
 * a browser does not, so the composition root passes the driver in and this
 * module imports only its types.
 * @since 1.0.0
 */

import type * as Pg from "@effect/sql-pg"
import { Effect, Exit, Layer, Metric, Redacted, Result, Scope, Stream } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import { SqlError, UnknownError } from "effect/sql/SqlError"
import type { Compiler } from "effect/sql/Statement"
import * as DatabaseMetrics from "../DatabaseMetrics.ts"
import * as ReadOnly from "../internal/ReadOnly.ts"
import * as ReadTransaction from "../internal/ReadTransaction.ts"
import { UnsupportedDatabase } from "../internal/UnsupportedDatabase.ts"

export { isUnsupportedDatabase, UnsupportedDatabase, UnsupportedDatabaseCode } from "../internal/UnsupportedDatabase.ts"

/**
 * The `@effect/sql-pg` modules this adapter drives. Pass the package itself:
 * `import * as Pg from "@effect/sql-pg"`, then `driver: Pg`.
 *
 * @category models
 * @since 1.0.0
 */
export type Driver = Pick<typeof Pg, "PgClient" | "PgTypes">

/**
 * PostgreSQL connection and schema configuration.
 *
 * @category models
 * @since 1.0.0
 */
export interface PostgresDatabaseOptions {
  readonly url: string
  /** The `@effect/sql-pg` driver; see {@link Driver}. */
  readonly driver: Driver
  readonly schema?: string | undefined
  readonly postgres?: Omit<Pg.PgClient.PgPoolConfig, "url" | "types"> | undefined
  /**
   * Reads an existing schema only: no schema creation, no writer lock, and
   * every transaction is `READ ONLY`.
   */
  readonly readOnly?: boolean | undefined
}

// Why `SET LOCAL` and not schema-qualified SQL: every store and migration over
// this client writes unqualified table names, and `Dialect.tables`,
// `Dialect.columns` and the test fixtures read `current_schema()`. Qualifying
// them would touch every store, and one missed name would silently read or
// write another schema. Setting the schema once per transaction keeps that
// guarantee in this file. `set_config(..., true)` is `SET LOCAL` in function
// form, so the schema reaches the server as a bound parameter, never as SQL text.
const scopeStatement = "SELECT set_config('search_path', quote_ident($1), true)"
// The writer lock is keyed by the schema's name. Earlier releases hashed
// `current_schema()`, which is that name while the schema exists, so processes
// on either release serialize against each other.
const lockStatement =
  "SELECT set_config('search_path', quote_ident($1), true), pg_advisory_xact_lock(hashtextextended($1, 2099))"

/** Provides PostgreSQL with serialized transactions and exact safe-number reads.
 * A dedicated schema keeps flow state separate from backend product tables.
 * @category layers
 * @since 1.0.0
 */
export const layer = (options: PostgresDatabaseOptions): Layer.Layer<SqlClient.SqlClient> => {
  const schema = options.schema ?? "smithers_flows"
  if (schema.length === 0 || schema.includes("\0") || new TextEncoder().encode(schema).length > 63) {
    throw new UnsupportedDatabase({
      code: "postgres_schema_invalid",
      message: "PostgreSQL schema must contain 1 to 63 UTF-8 bytes and no NUL"
    })
  }
  const { PgClient, PgTypes } = options.driver
  const readOnly = options.readOnly === true
  const types = PgTypes.makeRegistry()
  for (const oid of [PgTypes.OID.int8, PgTypes.OID.numeric]) {
    types.register(oid, {
      encode: (value: unknown) =>
        PgTypes.encode(oid === PgTypes.OID.numeric ? String(value) : BigInt(value as number), oid),
      decode: (bytes) =>
        Result.flatMap(PgTypes.decode(bytes, oid, 1), (value) => {
          const number = Number(value)
          return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER
            ? Result.succeed(number)
            : Result.fail(new PgTypes.CodecError({ message: "Stored SQL number exceeds the safe numeric range" }))
        })
    })
  }
  // A reader takes one snapshot and no writer lock. A lone statement on the
  // writable client runs read-write: its text does not say whether it writes.
  // READ WRITE is explicit because a pooler that never resets its connections
  // can hand over another client's `default_transaction_read_only`.
  const readBegin = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
  const begin = readOnly ? readBegin : "BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE"
  const rollback = (conn: Connection) => conn.executeUnprepared("ROLLBACK", [], undefined)
  const open = (conn: Connection, scope: Effect.Effect<unknown, SqlError>, statement = begin) =>
    conn.executeUnprepared(statement, [], undefined).pipe(
      Effect.andThen(scope),
      Effect.onError(() => Effect.orDie(rollback(conn)))
    )
  const scoped = (conn: Connection) => open(conn, conn.execute(scopeStatement, [schema], undefined))
  // `Dialect.readTransaction` on either client: one snapshot, no writer lock.
  const snapshot = (conn: Connection) => open(conn, conn.execute(scopeStatement, [schema], undefined), readBegin)
  const locked = (conn: Connection) =>
    open(
      conn,
      Effect.flatMap(
        Effect.timed(conn.execute(lockStatement, [schema], undefined)),
        ([waited]) => Metric.update(DatabaseMetrics.writerLockWait, waited)
      )
    )
  // PostgreSQL answers COMMIT in an aborted transaction with the tag ROLLBACK
  // and no error; that is a failed write, never a committed one.
  const commit = (conn: Connection) =>
    conn.executeRaw("COMMIT", []).pipe(
      Effect.flatMap((result) =>
        (result as Pg.PgConnection.Result).command === "ROLLBACK"
          ? Effect.fail(
            new SqlError({
              reason: new UnknownError({
                cause: new Error("COMMIT rolled back an aborted transaction"),
                message: "PostgresDatabase: COMMIT rolled back an aborted transaction",
                operation: "commit"
              })
            })
          )
          : Effect.void
      ),
      Effect.onError(() => Effect.orDie(rollback(conn)))
    )
  // A statement outside `withTransaction` runs as the only statement of its own
  // transaction, which costs BEGIN, the schema and COMMIT around it.
  const alone = <A>(conn: Connection, run: Effect.Effect<A, SqlError>): Effect.Effect<A, SqlError> =>
    Effect.uninterruptibleMask((restore) =>
      Effect.flatMap(
        restore(scoped(conn)),
        () =>
          Effect.flatMap(Effect.exit(restore(run)), (exit) =>
            Exit.isSuccess(exit)
              ? Effect.as(commit(conn), exit.value)
              : Effect.andThen(Effect.orDie(rollback(conn)), exit))
      )
    )
  const statements = (conn: Connection): Connection => ({
    execute: (sql, params, transformRows) => alone(conn, conn.execute(sql, params, transformRows)),
    executeRaw: (sql, params) => alone(conn, conn.executeRaw(sql, params)),
    executeValues: (sql, params) => alone(conn, conn.executeValues(sql, params)),
    executeValuesUnprepared: (sql, params) => alone(conn, conn.executeValuesUnprepared(sql, params)),
    executeUnprepared: (sql, params, transformRows) => alone(conn, conn.executeUnprepared(sql, params, transformRows)),
    // A stream commits after its last row; one abandoned early, failed or
    // interrupted rolls back when its scope closes.
    executeStream: (sql, params, transformRows) =>
      Stream.unwrap(Effect.suspend(() => {
        let settled = false
        const settle = Effect.sync(() => {
          settled = true
        })
        return Effect.acquireRelease(
          scoped(conn),
          () => settled ? Effect.void : Effect.orDie(rollback(conn))
        ).pipe(Effect.as(
          conn.executeStream(sql, params, transformRows).pipe(
            Stream.concat(Stream.fromEffectDrain(Effect.ensuring(commit(conn), settle)))
          )
        ))
      }))
  })
  return Layer.effect(
    SqlClient.SqlClient,
    Effect.gen(function*() {
      const pg = yield* PgClient.make({ ...options.postgres, url: Redacted.make(options.url), types })
      const baseCompiler = PgClient.makeCompiler()
      const compiler: Compiler = {
        dialect: "pg",
        withoutTransform: baseCompiler,
        compile: (statement, withoutTransform) => {
          const [query, parameters] = baseCompiler.compile(statement, withoutTransform)
          // The native driver infers unsafe integral numbers as float8, whose
          // numeric cast rounds to 15 digits and can evade a safe-integer CHECK.
          return [
            query,
            parameters.map((value) =>
              typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)
                ? PgTypes.numeric(String(value)) :
                value
            )
          ]
        }
      }
      Object.defineProperty(compiler, "withoutTransform", { value: compiler })
      const sql = yield* SqlClient.make({
        acquirer: Effect.map(pg.reserve, statements),
        compiler,
        spanAttributes: [["db.system.name", "postgresql"]]
      })
      const transactions = (start: (conn: Connection) => Effect.Effect<unknown, SqlError>) =>
        SqlClient.makeWithTransaction({
          transactionService: sql.transactionService,
          spanAttributes: [["db.system.name", "postgresql"]],
          acquireConnection: Effect.gen(function*() {
            const reservation = yield* Scope.make()
            const conn = yield* Scope.provide(pg.reserve, reservation).pipe(
              Effect.onExit((exit) => exit._tag === "Failure" ? Scope.close(reservation, exit) : Effect.void)
            )
            return [reservation, conn] as const
          }),
          begin: start,
          savepoint: (conn, id) => conn.executeUnprepared(`SAVEPOINT effect_sql_${id}`, [], undefined),
          commit,
          rollback,
          rollbackSavepoint: (conn, id) =>
            conn.executeUnprepared(`ROLLBACK TO SAVEPOINT effect_sql_${id}`, [], undefined)
        })
      // A transaction-scoped lock preserves SQLite's one-writer semantics across
      // processes. READ COMMITTED takes each snapshot after the lock is acquired.
      const withTransaction = transactions(readOnly ? scoped : locked)
      Object.assign(sql, { withTransaction })
      // Every statement of `sql.reserve` runs alone, so a caller cannot open a
      // read transaction on a reserved connection; this client opens its own.
      ReadTransaction.register(sql, transactions(snapshot))
      if (readOnly) ReadOnly.mark(sql)
      // Under the writer lock, so concurrent first opens create the schema once.
      else yield* sql.withTransaction(sql`CREATE SCHEMA IF NOT EXISTS ${sql(schema)}`)
      return sql
    })
  ).pipe(Layer.provide(Reactivity.layer), Layer.orDie)
}
