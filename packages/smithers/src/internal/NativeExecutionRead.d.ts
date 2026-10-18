/** Exact native observations scoped to one authorized control root.
 * @since 1.0.0
 */
import { PersistenceError } from "@smthrs/control/ControlError";
import type { ExecutionBatch } from "@smthrs/control/ControlSchema";
import type * as Snapshot from "@smthrs/engine-store/ExecutionSnapshot";
import { Effect, Schema } from "effect";
import * as SqlClient from "effect/sql/SqlClient";
/** One transaction holds the batch and all ancestry reads at the same source revision.
 * @since 1.0.0
 * @private
 */
export declare const makeFromSql: () => Effect.Effect<(input: {
    readonly runId: string;
    readonly executionIds: ReadonlyArray<string>;
}) => Effect.Effect<{
    readonly source: string | null;
    readonly revision: number | null;
    readonly snapshots: readonly ({
        readonly _tag: "Missing";
        readonly executionId: string;
        readonly source: string;
        readonly revision: number;
        readonly deleted: boolean;
    } | {
        readonly _tag: "Observed";
        readonly executionId: string;
        readonly source: string;
        readonly revision: number;
        readonly observation: {
            readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
            readonly flowName: string;
            readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
            readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
            readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
            readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
            readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
            readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
            readonly roundOrdinal: number;
            readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
            readonly treeVersion?: 1 | undefined;
            readonly parentPolicy?: "cancel" | "detach" | undefined;
            readonly waiting: {
                readonly reason: string;
                readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly tokenDigest: string | null;
                readonly point?: string | null | undefined;
                readonly request?: Schema.Json | undefined;
            } | null;
        };
    } | {
        readonly _tag: "Unavailable";
        readonly executionId: string;
        readonly reason: "ancestry-unavailable" | "outside-run" | "unsupported";
    })[];
}, PersistenceError, never>, never, SqlClient.SqlClient>;
/** Parent links are immutable. Bound every ancestry walk and refuse incomplete/cyclic evidence.
 * @since 1.0.0
 * @private
 */
export declare const make: (snapshots: Pick<Snapshot.Service, "read">) => (input: {
    readonly runId: string;
    readonly executionIds: ReadonlyArray<string>;
}) => Effect.Effect<ExecutionBatch, PersistenceError>;
