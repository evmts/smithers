/**
 * Private read-side bridge between the existing engine and control journals.
 * @since 1.0.0
 */
import type * as DurableEngineState from "@smthrs/engine-store/DurableEngineState";
import * as Journal from "@smthrs/journal/Journal";
import * as JournalEvent from "@smthrs/journal/JournalEvent";
import * as RunStore from "@smthrs/run-store/RunStore";
import { Effect } from "effect";
/**
 * Existing host services and an already-authorized native root.
 * @since 1.0.0
 * @private
 */
export interface Options {
    readonly controlRunId: string;
    readonly executionId: string;
    readonly engineJournal: Journal.Service;
    readonly controlJournal: Journal.Service;
    readonly engineState: Pick<DurableEngineState.Service, "runChildren">;
    /** Native trampoline membership, separate from spawn edges. Legacy adapters may omit it. */
    readonly runLineage?: RunStore.Service["lineage"] | undefined;
    /**
     * Called with each native record BEFORE that record is copied into the
     * control journal.
     *
     * The order is the guarantee: a client reading the copied record can act on
     * what it says, because the host already has. A copy-back receipt naming
     * `.smithers/flows/<id>/flow.ts` is the case that needs it — the host rebuilds that
     * flow's executable first, so the plan a client asks for on seeing the
     * receipt is a plan this host can answer.
     *
     * It fires again for the same record when an interrupted observation is
     * recovered, since recovery rereads its pages. Handlers are therefore
     * expected to be repeatable. Failures here are the caller's to absorb; the
     * projection's own progress does not depend on them.
     */
    readonly onRecord?: ((entry: JournalEvent.Entry, generation: number) => Effect.Effect<void>) | undefined;
}
/**
 * Recorded native envelope in the control run's open event payload.
 * @since 1.0.0
 * @private
 */
export declare const eventKind = "control.engine.event";
/**
 * Missing or discontinuous native evidence, distinct from execution results.
 * @since 1.0.0
 * @private
 */
export declare const gapKind = "control.engine.projection-gap";
/**
 * The caller establishes ownership of the native root. This helper reads only
 * that root and its durable child edges; it never guesses ancestry from IDs.
 * Run its reads outside any native transaction context so they cannot observe
 * the caller's uncommitted writes. The host supervisor supplies a clean context.
 * No durable cursor is introduced: restarting rereads pages and exact source
 * identities deduplicate against the destination journal's existing index.
 * @since 1.0.0
 * @private
 */
export declare const make: (options: Options) => Effect.Effect<{
    catchUp: Effect.Effect<undefined, Journal.JournalError | RunStore.RunStoreError, never>;
    follow: Effect.Effect<undefined, Journal.JournalError | RunStore.RunStoreError, never>;
    followUntilSettled: (runs: Pick<RunStore.Service, "get">) => Effect.Effect<undefined, Journal.JournalError | RunStore.RunStoreError, never>;
}, never, never>;
