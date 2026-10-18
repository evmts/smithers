// Chat's contract between the browser and ChatApi (docs/features/chat.md#contract): the one home of every value the
// browser, ChatApi, the end-to-end tests and the unit tests share. Nothing here imports a library, so every side can.

/** ChatApi's question route: `POST`. */
export const QUESTIONS_ROUTE = "/api/questions"

/** ChatApi's Electric shape proxy for `messages`: `GET`. */
export const SHAPE_ROUTE = "/api/shapes/messages"

/** Where the browser posts its OTLP telemetry: `<route>/v1/{logs,traces,metrics}`. */
export const TELEMETRY_ROUTE = "/api/telemetry"

/** The Postgres table the shape proxy serves. */
export const MESSAGES_TABLE = "messages"

/** The longest question, in characters after trimming. */
export const MAX_QUESTION_LENGTH = 8_000

/**
 * How many messages the conversation shows at first, and how many more each "Load earlier" adds; the device has them
 * all, since the shape proxy serves the whole shape.
 */
export const PAGE_SIZE = 50

// The app's status copy (docs/decisions/0002-local-first.md §2). No other loading, saving or syncing copy exists.

/** What an answer reads when Smithers couldn't answer, beside Retry. */
export const COULDNT_ANSWER = "Couldn't answer"

/** The connection pill while the device is offline or can't reach Smithers; ` · <n>` follows with questions queued. */
export const OFFLINE = "Offline"

/** The connection pill when Electric refused the shape, beside Retry. */
export const SYNC_FAILED = "Sync failed"

/** The connection pill when this tab's engine worker failed, so this device can't answer; beside Reload. */
export const ENGINE_FAILED = "Smithers can't run in this browser"

/** The badge on a question asked while the pill shows, until Postgres has it. */
export const QUEUED = "Queued"

/** The badge on a question the server refused, or the outbox couldn't store. */
export const NOT_SENT = "Not sent"

/** The compose Electric (`docker-compose.yml`): what `ELECTRIC_URL` defaults to, and the one tests use. */
export const LOCAL_ELECTRIC_URL = "http://localhost:30001"

/**
 * What chat records in the browser (docs/observability.md#browser): its log messages, span names and metric names,
 * and the attributes they carry, the outbox's and the device store's (`@smthrs/effect-tanstack-db`) included. ChatApi's
 * relay keeps exactly what src/telemetry.ts merges from every feature; none of these fields carries what someone wrote.
 */
export const CHAT_TELEMETRY = {
  records: [
    "question asked",
    "question stored",
    "question not sent",
    "question not admitted",
    "unsent question handled",
    "chat connection changed",
    "chat retried",
    "chat.ask",
    "chat.ask.send",
    "chat.question.post",
    "smithers_web_questions",
    "smithers_web_ask_failures",
    "smithers_web_unsent_actions",
    "smithers_web_composer_opens",
    "smithers_web_answer_first_text_ms",
    "smithers_web_sync_failures",
    "smithers_web_sync_retries",
    "smithers_web_history_loads",
    // The outbox every write goes through, and the device store (@smthrs/effect-tanstack-db).
    "outbox.send",
    "outbox write failed",
    "outbox couldn't load its writes",
    "outbox_attempts",
    "outbox_refused",
    "outbox_queued_ms",
    "outbox_leader_changes",
    "persistence unavailable",
    "persistence_unavailable",
    "persistence_restore_ms",
    "persisted write failed",
    "persistence_write_failures",
    "collection cleanup failed",
  ],
  fields: [
    "questionId",
    "answerId",
    "question.length",
    "queued",
    "taken",
    "reason",
    "status",
    "action",
    "via",
    "name",
    "attempt",
    "outcome",
    "leader",
    "collection",
    "operation",
    "error",
  ],
} as const
