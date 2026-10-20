import { Metric } from "effect"

// Usage metrics for chat, exported over OTLP with the rest of the browser's telemetry (docs/observability.md).
// Labels carry how or why, never what anyone wrote.

const MILLISECONDS = Metric.exponentialBoundaries({ start: 50, factor: 2, count: 12 })

/** Composer opens, by `via`: `shortcut` (⌘K or Ctrl+K) or `button`. */
export const composerOpens = Metric.counter("smithers_web_composer_opens", {
  description: "Times a person opened the chat composer",
  incremental: true,
})

/** Questions this tab asked: inserted and sent to ChatApi. */
export const questionsAsked = Metric.counter("smithers_web_questions", {
  description: "Questions asked",
  incremental: true,
})

/** Questions ChatApi didn't take, by `reason`: `unreachable`, `refused`, `invalid_response` or `unconfirmed`. */
export const askFailures = Metric.counter("smithers_web_ask_failures", {
  description: "Questions ChatApi did not take or Electric did not confirm",
  incremental: true,
})

/** From asking to the first text of the answer reaching this tab. */
export const firstAnswerText = Metric.histogram("smithers_web_answer_first_text_ms", {
  description: "Milliseconds from asking to the answer's first text on this tab",
  boundaries: MILLISECONDS,
})

/** Times chat's sync failed, by `reason`: `unreachable`, `refused` or `invalid_response` (schema.ts `SyncHealth`). */
export const syncFailures = Metric.counter("smithers_web_sync_failures", {
  description: "Times chat's sync with Postgres failed",
  incremental: true,
})

/** Times a failed sync was retried, by `via`: `button` (Try again) or `online` (the browser came back online). */
export const syncRetries = Metric.counter("smithers_web_sync_retries", {
  description: "Times chat's failed sync was retried",
  incremental: true,
})

/** "Load earlier" pages, by `outcome`: `loaded` or `failed`. */
export const historyLoads = Metric.counter("smithers_web_history_loads", {
  description: "Earlier pages of the conversation a person loaded",
  incremental: true,
})
