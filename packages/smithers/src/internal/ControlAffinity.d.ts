/**
 * Control ownership admission before the native engine takes an execution.
 * @since 1.0.0
 */
import { Ownership, type RunStore } from "@smthrs/run-store";
import { Effect } from "effect";
interface Options {
    readonly runs: RunStore.Service;
    readonly engineRuns?: RunStore.Service | undefined;
    readonly canRetryReleased?: ((executionId: string, ancestorId: string) => Effect.Effect<boolean, unknown>) | undefined;
    readonly claimant: Ownership.OwnerId;
    readonly isAlive?: Ownership.LivenessCheck | undefined;
}
/**
 * A released engine row does not release its separate control claim.
 * Read that claim before engine recovery; the control runtime still performs
 * the authoritative fenced takeover when the handler enters.
 * @since 1.0.0
 * @private
 */
export declare const make: ({ runs, engineRuns, claimant, canRetryReleased, isAlive }: Options) => (runId: string) => Effect.Effect<boolean>;
export {};
