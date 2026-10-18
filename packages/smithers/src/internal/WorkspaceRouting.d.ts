/**
 * Portable history admission over the control and engine SQL clients the host
 * already owns, shared by the host and native CLI.
 * @since 1.0.0
 */
import { Effect, Path, Schema } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";
declare const WorkspaceRoutingError_base: Schema.Class<WorkspaceRoutingError, Schema.TaggedStruct<"history/WorkspaceRoutingError", {
    readonly runId: Schema.String;
    readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/** Corrupt ancestry cannot grant permission to execute a workspace.
 * @since 1.0.0
 * @category errors
 */
export declare class WorkspaceRoutingError extends WorkspaceRoutingError_base {
}
/** Captured clients are separate authorities; this module opens no database.
 * @since 1.0.0
 * @category models
 */
export interface Options {
    readonly root: string;
    readonly engine: SqlClient;
    readonly control: SqlClient | undefined;
}
/** Build the admission functions once in the host's existing Effect scope.
 * @since 1.0.0
 * @category constructors
 */
export declare const make: ({ root, engine, control }: Options) => Effect.Effect<{
    workspaceFor: (runId: string) => Effect.Effect<string | undefined, SqlError | WorkspaceRoutingError, never>;
    canExecute: (workspace: string, runId: string) => Effect.Effect<boolean, SqlError | WorkspaceRoutingError, never>;
}, never, Path.Path>;
export {};
