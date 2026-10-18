/**
 * Product entry points replaced by the pinned TODO composition (E-19).
 * Verify and review remain ordinary engine launches. Existing journals and
 * recovery codecs remain readable; this fence applies only to registration.
 *
 * @since 1.0.0
 */
import { FlowRuntime } from "@smthrs/flow";
import { Layer } from "effect";
/**
 * Wraps `FlowRuntime` so registering `coding/Request` or `coding/Vibe` dies with
 * an `entry_point_replaced` refusal (`replaced: <tag> ...`); every other flow
 * registers unchanged.
 *
 * @since 1.0.0
 * @private
 */
export declare const layer: Layer.Layer<FlowRuntime.FlowRuntime, never, FlowRuntime.FlowRuntime>;
