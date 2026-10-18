/**
 * Committed native results and the control binding that authorizes them.
 * @since 1.0.0
 */
import type { ControlSchema } from "@smthrs/control";
interface Identity {
    readonly runId: string;
    readonly executionId: string;
}
/**
 * Kept across bounded journal windows; only the host's root binding authorizes output.
 * @category models
 * @since 1.0.0
 */
export interface NativeResolution {
    readonly binding?: Identity | undefined;
    readonly result?: (Identity & {
        readonly text: string;
    }) | undefined;
    readonly conflict?: true | undefined;
}
/**
 * A root's committed success is authoritative; child outputs and telemetry are not.
 * @category projections
 * @since 1.0.0
 */
export declare const fromEvent: (event: ControlSchema.ControlEvent) => NativeResolution | undefined;
/**
 * Combining adjacent windows retains the binding even after its event is evicted.
 * @category projections
 * @since 1.0.0
 */
export declare const combine: (earlier: NativeResolution | undefined, later: NativeResolution | undefined) => NativeResolution | undefined;
/**
 * Returns output only for one unambiguous, bound root.
 * @category projections
 * @since 1.0.0
 */
export declare const output: (value: NativeResolution | undefined) => string | undefined;
export {};
