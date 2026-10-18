/**
 * Replay-safe policy for native deferred provider tool loading.
 *
 * @since 0.1.0
 */
import type { ModelRequest, ToolDefinition } from "./ModelRequest.ts";
/**
 * Provider protocol ids with a native deferred-tool representation.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ProtocolId = "anthropic-messages" | "openai-responses" | "openai-responses-chatgpt";
/**
 * The immediate and lazy tool definitions derived from a sealed request.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Resolution {
    readonly immediate: ReadonlyArray<ToolDefinition>;
    readonly deferred: ReadonlyArray<ToolDefinition>;
    readonly activatedNames: ReadonlyArray<string>;
}
/**
 * Reports whether a protocol and model pair supports pi's native deferred
 * tool-loading wire representation.
 *
 * Each protocol answers from an explicit allowlist, matched case-insensitively.
 * An id absent from its provider's list answers false, including a family or
 * version released after this code, because native deferral changes the wire
 * body and an unverified body must not be enabled without a release. Such a
 * model still receives every tool through the portable non-native lowering.
 *
 * @category predicates
 * @since 0.1.0
 * @slop
 */
export declare const supportsDeferred: (protocolId: ProtocolId, modelId: string) => boolean;
/**
 * Resolves immediate and deferred tools from declared `deferred` annotations
 * and the chronological transcript only. Unsupported models receive
 * non-deferred definitions plus additively activated lazy definitions. No
 * process-local activation state is consulted, so replay produces the
 * identical tool partition.
 *
 * @category operations
 * @since 0.1.0
 * @slop
 */
export declare const resolve: (request: ModelRequest, native: boolean) => Resolution;
