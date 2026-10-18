/**
 * Shared HTTP status and provider vocabulary classification.
 *
 * @since 0.1.0
 */
import { type ModelErrorCode } from "./ModelError.ts";
/**
 * Where a failure's words came from.
 *
 * `provider` is the provider's own error envelope: a `code`/`type` and the
 * `message` beside it. `opaque` is every other text a failed call leaves
 * behind — a gateway's page, a proxy's sentence, a body that quotes the
 * request or an agent's own report.
 *
 * The distinction governs the limit classes alone. A quota or rate limit
 * decides whether a run parks, moves to another seat, or stops as unfundable,
 * so reading one out of text nobody meant as a verdict loses the run: on
 * 2026-10-15 two agent attempts failed `quota_exceeded` within the same second
 * on their own source and report prose, while the account was at a quarter of
 * its session budget. For those classes an opaque body establishes nothing and
 * the HTTP status governs. The other classes still read opaque text: a gateway
 * that names a content filter, an overflowing request or a rejected key is
 * reporting a verdict about this call, and no failure has shown one of those
 * read out of quoted prose. Each of them is terminal too, so narrowing one
 * waits for a failing case of its own rather than a guess.
 *
 * @category models
 * @since 1.0.0-rc.7
 */
export type MessageSource = "provider" | "opaque";
/**
 * Classifies normalized provider error fields. Protocols own envelope decoding
 * and provider-specific overrides; HTTP and vocabulary precedence live here.
 *
 * `source` is stated by every caller rather than defaulted: a classifier that
 * assumes its words came from a provider is how process output became a quota
 * refusal.
 *
 * @category utilities
 * @since 0.1.0
 */
export declare const classifyHttpStatus: (status: number | undefined, code: string | undefined, message: string, source: MessageSource) => ModelErrorCode;
