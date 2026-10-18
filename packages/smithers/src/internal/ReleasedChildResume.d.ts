/**
 * Durable permission to retry released native children safely.
 * @since 1.0.0
 */
import type * as DurableEngineState from "@smthrs/engine-store/DurableEngineState";
import * as Journal from "@smthrs/journal/Journal";
import type * as RunStore from "@smthrs/run-store/RunStore";
import { Effect, Schema } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
/**
 * Existing native and control durability used to bind retries.
 * @since 1.0.0
 * @private
 */
export interface Options {
    readonly engineJournal: Journal.Service;
    readonly controlJournal: Journal.Service;
    readonly engineRuns: RunStore.Service;
    readonly engineState: Pick<DurableEngineState.Service, "runChildren">;
    /** Native attempt storage; absent adapters retain explicit-resume behavior. */
    readonly engineSql?: SqlClient | undefined;
}
/**
 * Authorizes the release snapshot once per explicit resume and checks its identity.
 * @since 1.0.0
 * @private
 */
export declare const make: (options: Options) => {
    authorize: (root: string, resumeSequence: number) => Effect.Effect<undefined, Journal.JournalError | RunStore.RunStoreError | Schema.SchemaError, never>;
    canRetryReleased: (executionId: string, root: string) => Effect.Effect<boolean, Journal.JournalError | RunStore.RunStoreError | Schema.SchemaError | import("effect/sql/SqlError").SqlError, never>;
};
