/**
 * Tool-free review inference. No agent process, local tools, or repository configuration.
 * @since 1.0.0
 */
import { Model } from "@smthrs/model";
import { Effect } from "effect";
import type { Engine } from "../ModelEngine.ts";
/**
 * Output capacity every review request asks for and every batch budget reserves.
 * @category constants
 * @since 1.0.0
 */
export declare const maximumResponseTokens = 16384;
/**
 * Sends only the supplied review text through a host-resolved model seat, such
 * as a subscription seat, with the same tool-free request, output bound,
 * deadline and error masking as {@link reviewModel}.
 * @category execution
 * @since 1.0.0
 */
export declare const seatReviewModel: (model: Model.Model, modelId: string, prompt: string, timeoutMs: number, maximumBytes: number, policy?: string) => Effect.Effect<string, Error>;
/**
 * Sends only the supplied review text to a fixed provider endpoint.
 * @category execution
 * @since 1.0.0
 */
export declare const reviewModel: (engine: Engine, modelId: string, prompt: string, timeoutMs: number, maximumBytes: number, policy?: string) => Effect.Effect<string, Error>;
