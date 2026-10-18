/**
 * Shared HTTP status and provider vocabulary classification.
 *
 * @since 0.1.0
 */

import { isContextOverflow, isQuotaExhausted, type ModelErrorCode } from "./ModelError.ts"

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
export type MessageSource = "provider" | "opaque"

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
export const classifyHttpStatus = (
  status: number | undefined,
  code: string | undefined,
  message: string,
  source: MessageSource
): ModelErrorCode => {
  const normalized = `${code ?? ""} ${message}`.toLowerCase()
  // Only the provider's own fields may name a limit no status carries.
  const named = source === "provider"
  if (status === 401 || status === 403) return "authentication"
  if (status === 402 && code === "out_of_credit") return "out_of_credit"
  if (status === 402 || (named && isQuotaExhausted(code, message))) return "quota_exceeded"
  if (
    /authentication|invalid[-_\s]?api[-_\s]?key|incorrect[-_\s]?api[-_\s]?key|permission[-_\s]?denied/.test(normalized)
  ) {
    return "authentication"
  }
  if (status === 429 || (named && /rate[-_\s]?limit|usage[-_\s]?limit|too many requests/.test(normalized))) {
    return "rate_limited"
  }
  if (/content[-_\s]?policy|content[-_\s]?filter|safety/.test(normalized)) return "content_policy"
  // Quota and overflow must precede their generic invalid-request envelopes.
  if (isContextOverflow(code, message)) return "context_overflow"
  if (
    status === 400 || status === 404 || status === 409 || status === 413 || status === 422 ||
    /invalid[-_\s]?request/.test(normalized)
  ) return "invalid_request"
  // A stream that fails after HTTP 200 carries no status, only the provider's
  // words: ChatGPT's `response.failed` says "Our servers are currently
  // overloaded" and Anthropic's event says `overloaded_error`. Both are the
  // provider's transient fault, so they retry like the 5xx they stand for.
  if (
    (status !== undefined && status >= 500) ||
    /server[-_\s]?error|internal[-_\s]?error|overloaded|service[-_\s]?unavailable/.test(normalized)
  ) {
    return "provider_internal"
  }
  return "unknown"
}
