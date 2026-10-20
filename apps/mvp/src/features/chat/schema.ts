import { Schema } from "effect"
import { COPY_ANSWERS, EDIT_ANSWERS } from "./contract"
import { copyPayload, editPayload } from "./flows"

// Every row chat's collections hold, as the Effect Schema its collection checks it with. Constants the browser shares
// with ChatApi live in contract.ts. A row stored on the device (`messages`, `unsent`) or in the outbox (`asking`) is
// read by the next version of the app too: change its shape only with its collection's `schemaVersion`, or its `v`.

/**
 * One row of Postgres `messages` as Electric delivers it (docs/features/chat.md#messages-postgres): columns in
 * camelCase, `position` (int8) parsed to a number, timestamps as Postgres prints them. The Electric collection decodes
 * every synced row with it, column by column, and keeps them on the device.
 */
export const Message = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  status: Schema.Literals(["done", "streaming", "failed"]),
  questionId: Schema.NullOr(Schema.String),
  failure: Schema.NullOr(Schema.Literals(["rate_limited", "model_error", "empty", "abandoned", "unfinished"])),
  modelId: Schema.NullOr(Schema.String),
  stopReason: Schema.NullOr(Schema.String),
  inputTokens: Schema.NullOr(Schema.Number),
  outputTokens: Schema.NullOr(Schema.Number),
  position: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  /** The branch's conversation the row belongs to (decision 0013 §1); a row synced before it existed has none. */
  conversationId: Schema.optional(Schema.String),
})
export type Message = typeof Message.Type

/**
 * A question asked on this device that Postgres doesn't have yet: the optimistic row of its outbox write, keyed by the
 * question's id. `answerId` is the id its answer gets. `queuedAt` (epoch ms) orders it among other local rows, after
 * every synced one; it never orders synced rows (docs/state.md rule 7). `v` is the row's version in the outbox.
 */
export const Asking = Schema.Struct({
  id: Schema.String,
  answerId: Schema.String,
  text: Schema.String,
  queuedAt: Schema.Number,
  v: Schema.Literal(1),
  /** The branch conversation it is asked in (decision 0013 §1); absent for the home conversation `/app` shows. */
  conversationId: Schema.optional(Schema.String),
})
export type Asking = typeof Asking.Type

/**
 * Why a question stays unsent on this device:
 * - `refused`: ChatApi refused it (400);
 * - `conflict`: its id already holds another message (409);
 * - `too_large`: its body was over ChatApi's limit (413);
 * - `not_admitted`: the outbox couldn't take it, so it was never sent.
 */
export const UnsentReason = Schema.Literals(["refused", "conflict", "too_large", "not_admitted"])
export type UnsentReason = typeof UnsentReason.Type

/**
 * A question that stays on this device until the person edits or discards it, or, when it was never admitted, sends
 * it again. Keyed by the question's id; kept on the device, so it survives a reload.
 */
export const Unsent = Schema.Struct({
  id: Schema.String,
  answerId: Schema.String,
  text: Schema.String,
  queuedAt: Schema.Number,
  reason: UnsentReason,
  /** The branch conversation it was asked in; absent for the home conversation. */
  conversationId: Schema.optional(Schema.String),
})
export type Unsent = typeof Unsent.Type

/**
 * This tab's composer: open or hidden, the unsent draft, and whether the device has stored that draft (`saved`), so a
 * reload finds it. One row.
 */
export const COMPOSER = "composer"
export const Composer = Schema.Struct({
  id: Schema.Literal(COMPOSER),
  open: Schema.Boolean,
  draft: Schema.String,
  saved: Schema.Boolean,
})
export type Composer = typeof Composer.Type

/**
 * This tab's connection, as the connection pill shows it. One row:
 * - `up`: nothing to show;
 * - `offline`: the device is offline, or, with `retry`, Smithers has been unreachable for `unreachableAfter`;
 * - `failed`: Electric refused the shape, or answered with something it couldn't read; it waits for Retry;
 * - `stopped`: this tab's engine worker failed, so this device can't answer or keep its rows; only a reload can help.
 */
export const CONNECTION = "connection"
export const Connection = Schema.Struct({
  id: Schema.Literal(CONNECTION),
  status: Schema.Literals(["up", "offline", "failed", "stopped"]),
  retry: Schema.Boolean,
})
export type Connection = typeof Connection.Type

/**
 * This tab's view of the conversation. One row:
 * - `opened`: the conversation has been restored from the device or synced, so an empty one is truly empty;
 * - `limit`: how many of the most recent messages it shows;
 * - `earlier`: whether the device has messages before them.
 */
export const HISTORY = "history"
export const History = Schema.Struct({
  id: Schema.Literal(HISTORY),
  opened: Schema.Boolean,
  limit: Schema.Number,
  earlier: Schema.Boolean,
})
export type History = typeof History.Type

/**
 * Which conversation this tab shows and asks in: a branch's (decision 0013 §1), or, `null`, the home conversation `/app`
 * shows. The route that shows a branch sets it. One row.
 */
export const PLACE = "place"
export const Place = Schema.Struct({ id: Schema.Literal(PLACE), conversationId: Schema.NullOr(Schema.String) })
export type Place = typeof Place.Type

/**
 * The draft the composer had in a conversation, kept on the device so a reload finds it: keyed by the conversation's
 * id, or `HOME_DRAFT` for the home conversation. A row exists only while its draft isn't empty.
 */
export const HOME_DRAFT = "home"
export const Draft = Schema.Struct({ id: Schema.String, text: Schema.String })
export type Draft = typeof Draft.Type

// What `chat/copy`'s and `chat/edit`'s steps ask the tab that started their run, and what it answers
// (src/features/chat/steps.ts, src/flows/askingTab.ts).

/** Copy the message, or, without one, the latest finished answer. */
export const CopyCall = Schema.Struct(copyPayload)

/** How the copy went; `gone` is the step's own, for a tab that never answered. */
export const CopyAnswer = Schema.Struct({ outcome: Schema.Literals(COPY_ANSWERS) })
export type CopyAnswer = typeof CopyAnswer.Type

/** Take the question, or, without one, the latest one Smithers doesn't have yet, back into the composer. */
export const EditCall = Schema.Struct(editPayload)

/** How the edit went; `gone` is the step's own. */
export const EditAnswer = Schema.Struct({ outcome: Schema.Literals(EDIT_ANSWERS) })
export type EditAnswer = typeof EditAnswer.Type
