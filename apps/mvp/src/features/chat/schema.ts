import { Schema } from "effect"

export const CHAT_FAILED = "Smithers couldn't answer. Try again."

/** What a frontend shows while chat's sync has stopped (`SyncHealth` `failed`), beside a Retry action. */
export const SYNC_LOST = "Smithers lost its connection."

/** How many messages a tab loads at first, and how many more each "Load earlier" adds. */
export const PAGE_SIZE = 50

// The longest question a person can ask, in characters after trimming (docs/features/chat.md#post-apiquestions).
export const QUESTION_MAX_LENGTH = 8_000

/**
 * One row of Postgres `messages`, as Electric delivers it (docs/features/chat.md#messages-postgres): column names in
 * camelCase, `position` (int8) parsed to a number, timestamps as Postgres prints them.
 */
export const Message = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  status: Schema.Literals(["done", "streaming", "failed"]),
  questionId: Schema.NullOr(Schema.String),
  failure: Schema.NullOr(Schema.Literals(["rate_limited", "model_error", "empty", "abandoned"])),
  modelId: Schema.NullOr(Schema.String),
  stopReason: Schema.NullOr(Schema.String),
  inputTokens: Schema.NullOr(Schema.Number),
  outputTokens: Schema.NullOr(Schema.Number),
  attempts: Schema.Number,
  position: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Message = typeof Message.Type

/**
 * Where a row this tab inserted sorts until Electric delivers its real `position`: after every synced row, in the
 * order this tab asked. Postgres identity positions never reach 2^52.
 */
export const PENDING_POSITION = 2 ** 52

// This tab's composer: open or hidden, and the unsent draft. One row.
export const COMPOSER = "composer"
export type Composer = { id: typeof COMPOSER; open: boolean; draft: string }

// An answer this tab asked for, keyed by the answer's id: what "this tab is waiting" joins on.
export type Ask = { id: string }

/**
 * This tab's sync with Postgres, through Electric. One row:
 * - `syncing`: until a shape request first succeeds, and after one fails until another succeeds;
 * - `ready`: the last request succeeded, so the conversation follows every change;
 * - `failed`: the conversation shown may be stale. `reason` is `unreachable` (requests kept failing on the network, or
 *   with 5xx, for `openWithin`; they keep retrying, and the first to succeed makes it `ready`), `refused` (a 4xx) or
 *   `invalid_response` (a response Electric couldn't read); those two wait for a retry. `httpStatus` is the last status
 *   when there was one. Both are null unless `failed`.
 */
export const SYNC = "sync"
export type SyncFailure = "unreachable" | "refused" | "invalid_response"
export type SyncHealth = {
  id: typeof SYNC
  status: "syncing" | "ready" | "failed"
  reason: SyncFailure | null
  httpStatus: number | null
}

/**
 * This tab's view of the conversation's history. One row:
 * - `opened`: the first window has loaded;
 * - `limit`: how many of the most recent messages the conversation shows;
 * - `earlier`: whether there may be messages before them (the window is full);
 * - `loading`: a "Load earlier" is loading.
 */
export const HISTORY = "history"
export type History = { id: typeof HISTORY; opened: boolean; limit: number; earlier: boolean; loading: boolean }

/**
 * A question this tab couldn't ask, kept so it and the failure copy stay where they were shown after TanStack DB
 * rolls the optimistic rows back. Two rows per question, shaped like messages: they sort after the synced row at
 * `position`, then by `seq`, the order they were asked in.
 */
export type FailedMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  status: "done" | "failed"
  position: number
  seq: number
}

// A row of the conversation as every frontend shows it.
export type ConversationMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  status: Message["status"]
}
