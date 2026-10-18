/**
 * Logical-run resolution shared by cancellation and child lifetime decisions.
 * Round membership comes from RunStore; child ownership comes from the durable
 * DAG. A parent_run_id alone is not membership (forks also use that column).
 * Call these reads inside the same write transaction as the lifecycle change.
 *
 * @since 1.0.0
 */
import type { RunStore } from "@smthrs/run-store";
import * as Effect from "effect/Effect";
import type * as DurableEngineState from "../DurableEngineState.ts";
/**
 * Binds logical-run reads to the same stores as the owning engine.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const make: (store: RunStore.Service, state: DurableEngineState.Service) => {
    rounds: (runId: string) => Effect.Effect<readonly RunStore.RunRow[], RunStore.RunStoreError, never>;
    descendants: (runId: string) => Effect.Effect<ReadonlyArray<string>, RunStore.RunStoreError>;
};
