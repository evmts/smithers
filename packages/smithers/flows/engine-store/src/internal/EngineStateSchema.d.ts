/**
 * The schema objects `DurableEngineState` creates outside the journal
 * migration, and the inventory of what porting them to another
 * dialect costs.
 *
 * Each durable package owns its migration ladder. Spawn edges and their GC
 * trigger moved into engine-store migration 0006. The remaining
 * statements are engine-store-owned storage created idempotently at
 * construction instead (issues #40/#41/#79/#81). That is a deliberate lane
 * boundary, not an oversight — but it left the statements invisible to the
 * pg-porting plan in the database roadmap, which
 * scoped only the journal migration's SQLite-specific DDL. Declaring them here
 * makes the inventory machine-readable: a test diffs the database's schema
 * objects across `make` against this list, so no engine-owned statement can
 * be added without appearing in the porting inventory (issue #92).
 *
 * @since 0.1.0
 */
import type { Service as WriterService } from "@smthrs/database/DurableWriter";
import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/sql/SqlClient";
/**
 * SQL dialects a statement is known to be accepted by, verbatim.
 *
 * @since 0.1.0
 * @category models
 */
export type Dialect = "sqlite" | "postgres";
/**
 * One engine-store-owned schema object.
 *
 * @since 0.1.0
 * @category models
 */
export interface Statement {
    /** The schema object's name, as it appears in the catalog. */
    readonly name: string;
    /** Why the object exists, by issue. */
    readonly reason: string;
    /**
     * Dialects that accept this statement unchanged. A statement listing only
     * `"sqlite"` must be rewritten before a Postgres/PGlite `Database` layer
     * can construct this service — `make` pipes every one of them through
     * `Effect.orDie`, so an unported statement is a construction-time defect,
     * not a recoverable error.
     */
    readonly dialects: ReadonlyArray<Dialect>;
    readonly ddl: string;
}
/**
 * The porting inventory: every engine-store-owned statement, in creation order.
 *
 * @since 0.1.0
 * @category constants
 */
export declare const statements: ReadonlyArray<Statement>;
/**
 * Creates the engine-store-owned objects, idempotently, in inventory order.
 *
 * `flows_runs` must already exist — every query in this service assumes a
 * migrated database, so `make` composes over one by construction. A read-only
 * client installs nothing.
 *
 * @since 0.1.0
 * @category constructors
 */
export declare const apply: (sql: SqlClient.SqlClient, writer: WriterService) => Effect.Effect<void>;
