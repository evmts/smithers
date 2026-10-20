import { Metric } from "effect"

// ChatApi's metrics, listed with their log lines in docs/observability.md#chatapi-worker.

/** `POST /api/questions` requests, by HTTP `status`. */
export const questions = Metric.counter("smithers_chat_questions", {
  description: "POST /api/questions requests, by status",
  incremental: true,
})

/** Answers that ended, by `outcome` (`done`, `failed`, `fenced`, `error`) and `failure` (`none` unless failed). */
export const answers = Metric.counter("smithers_chat_answers", {
  description: "Answers that ended, by outcome and failure",
  incremental: true,
})

/** Tokens the model reported for answers that ended, by `type` (`input` or `output`). */
export const tokens = Metric.counter("smithers_chat_tokens", {
  description: "Model tokens of answers that ended, by type",
  incremental: true,
})

/** Milliseconds from the start of answering to the answer's first text. */
export const firstText = Metric.histogram("smithers_chat_answer_first_text_ms", {
  description: "Time from the start of answering to the first text, in milliseconds",
  boundaries: Metric.exponentialBoundaries({ start: 50, factor: 2, count: 12 }),
})

/** Milliseconds from the start of answering to the end, by `outcome`. */
export const duration = Metric.histogram("smithers_chat_answer_ms", {
  description: "Time from the start of answering to the end, in milliseconds, by outcome",
  boundaries: Metric.exponentialBoundaries({ start: 100, factor: 2, count: 12 }),
})

/** Answers the sweep settled as abandoned. */
export const swept = Metric.counter("smithers_chat_swept", {
  description: "Answers the sweep settled as abandoned",
  incremental: true,
})

/**
 * Requests to start answering, by `trigger` (`ask`, `retry` or `sweep`) and `outcome` (`started`, `running` or
 * `error`).
 */
export const dispatches = Metric.counter("smithers_chat_dispatches", {
  description: "Requests to start answering, by trigger and outcome",
  incremental: true,
})

/** `GET /api/shapes/messages` requests, by HTTP `status` and `live` (`true` or `false`). */
export const shapes = Metric.counter("smithers_chat_shape_requests", {
  description: "GET /api/shapes/messages requests, by status and live",
  incremental: true,
})
