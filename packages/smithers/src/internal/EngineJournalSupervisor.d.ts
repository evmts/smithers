/**
 * Private host lifetime for the existing native-to-control journal projection.
 * @since 1.0.0
 */
import type * as ControlExecutor from "@smthrs/control/ControlExecutor";
import type * as ControlRuntime from "@smthrs/control/ControlRuntime";
import type * as DurableEngineState from "@smthrs/engine-store/DurableEngineState";
import * as Journal from "@smthrs/journal/Journal";
import * as RunStore from "@smthrs/run-store/RunStore";
import { Duration, Effect, Scope } from "effect";
/**
 * Existing host services retained by the observer.
 * @since 1.0.0
 * @private
 */
export interface Options {
    readonly engineJournal: Journal.Service;
    readonly controlJournal: Journal.Service;
    readonly engineState: Pick<DurableEngineState.Service, "runChildren" | "runParents">;
    readonly runs: Pick<RunStore.Service, "get"> & Partial<Pick<RunStore.Service, "lineage">>;
    readonly control: Pick<ControlRuntime.Service, "getRun" | "pageRunIds">;
    /** Whether the caller holds a control write transaction that the projection needs. */
    readonly inControlTransaction: Effect.Effect<boolean>;
    /** Overrides {@link orderingGrace}; a suite with no follower to wait for shortens it. */
    readonly orderingGrace?: Duration.Duration | undefined;
    /**
     * Called with each discovered flow whose registry entry file a settled
     * copy-back applied, as the observation copies that record across.
     *
     * This is the host's one notice that its own `.smithers/flows/` directory changed
     * under it. A native host's executable catalog is built once at startup, so
     * without it a flow an agent authors mid-run has a descriptor and no
     * executable: `flow.plan` answers `FlowNotFound` or a plan with no nodes
     * until the host is restarted. The observer already reads every native
     * record for the projection, so nothing new is opened to see this.
     *
     * A capture alone never fires it: see {@link module:AuthoredSources}.
     */
    readonly onSourceApplied?: ((flowId: string) => Effect.Effect<void>) | undefined;
}
/**
 * Durable start of observing one native generation.
 * @since 1.0.0
 * @private
 */
export declare const startedKind = "control.engine.projection-started";
/**
 * Observation drained after native root terminal commit.
 * @since 1.0.0
 * @private
 */
export declare const settledKind = "control.engine.projection-settled";
/**
 * Construct in the host scope, outside an admission transaction. No new service,
 * table or checkpoint: recovery reads native wrapper identity and existing markers.
 * @since 1.0.0
 * @private
 */
export declare const make: (options: Options) => Effect.Effect<{
    start: (id: string) => Effect.Effect<void, never, never>;
    wrap: (executor: ControlExecutor.Service) => ControlExecutor.Service;
    recover: Effect.Effect<void, import("@smthrs/control/ControlError").PersistenceError, never>;
    awaitSettled: (id: string) => Effect.Effect<void>;
}, never, Scope.Scope>;
