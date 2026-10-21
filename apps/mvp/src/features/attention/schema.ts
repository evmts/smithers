import { Inbox } from "@smthrs/notifications"
import { Schema } from "effect"
import { MAX_SUBJECT_LENGTH } from "./contract"

// The personal feed's rows and wire shapes (decision 0009): the two requests, the `notifications` row Electric
// delivers, this device's acts on their way, and the entries the views read. A row stored on the device is read by the
// next version of the app too: change its shape only with its collection's `schemaVersion`.

/** `POST /api/watches`: follow the branch and repository of a conversation; `null` is the home conversation. */
export const WatchRequest = Schema.Struct({ conversationId: Schema.NullOr(Schema.String.check(Schema.isUUID())) })
export type WatchRequest = typeof WatchRequest.Type

/** `POST /api/notifications/ack`: an act on one notification, at the version the person saw. */
export const AckRequest = Schema.Struct({
  subject: Schema.String.check(Schema.isBetweenLength(1, MAX_SUBJECT_LENGTH)),
  version: Schema.Int.check(Schema.isGreaterThan(0)),
  act: Inbox.Act,
})
export type AckRequest = typeof AckRequest.Type

/** What either route answers: the transaction it wrote in, or `null` when it changed nothing. */
export const Written = Schema.Struct({ txid: Schema.NullOr(Schema.Number) })

/** A refusal's body: its code. */
export const Refusal = Schema.Struct({ code: Schema.String })

/** What a notification is about: a run's state, or `update` for a repository's event. */
export const NoticeState = Schema.Literals(["working", "waiting", "needs_you", "failed", "done", "update"])
export type NoticeState = typeof NoticeState.Type

/** What raised it: a run, `main` moving, or a new release. */
export const NoticeKind = Schema.Literals(["run", "main", "release"])
export type NoticeKind = typeof NoticeKind.Type

/**
 * One row of Postgres `notifications` as Electric delivers it to its recipient: columns in camelCase. `mine` is the
 * person's own run; `quiet` someone else's run on a branch they watch, a toast while it lives and never an entry.
 * `href` is where Open goes.
 */
export const Notice = Schema.Struct({
  recipient: Schema.String,
  subject: Schema.String,
  kind: NoticeKind,
  state: NoticeState,
  mine: Schema.Boolean,
  quiet: Schema.Boolean,
  runId: Schema.NullOr(Schema.String),
  repoId: Schema.NullOr(Schema.String),
  conversationId: Schema.NullOr(Schema.String),
  actor: Schema.NullOr(Schema.String),
  title: Schema.NullOr(Schema.String),
  ref: Schema.NullOr(Schema.String),
  href: Schema.String,
  version: Schema.Number,
  readVersion: Schema.Number,
  dismissedVersion: Schema.Number,
  hiddenVersion: Schema.Number,
  occurredAt: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Notice = typeof Notice.Type

/**
 * An act this device took that the synced row may not show yet, keyed `<subject>:<act>`: kept on the device until the
 * row reaches its version, so a reload offline still shows it taken.
 */
export const Pending = Schema.Struct({
  id: Schema.String,
  subject: Schema.String,
  act: Inbox.Act,
  version: Schema.Number,
})
export type Pending = typeof Pending.Type

/** An entry's one action: Answer the person's own question, or Open where it happened. */
export const EntryAction = Schema.Literals(["answer", "open"])
export type EntryAction = typeof EntryAction.Type

/**
 * One feed entry as the views read it, keyed by its subject: the row with this device's acts applied, its words, and
 * where it shows. `word` replaces the state's word (`main`, `Release`); `detail` follows it. `stack` and `stackHere` say
 * it shows as a toast on a page, and over a conversation (where the conversation's own runs show in it instead, unless
 * they need the person). `listed` says it is in the person's list behind `+N`; `here` that it is a run of the
 * conversation the tab shows; `settled` that it is done, failed or an update, which the list's × dismisses; `unread` that
 * it is listed and the person hasn't opened this version. `order` sorts both: needs you, failed, live, done, updates; the newest first within each.
 */
export const Entry = Schema.Struct({
  id: Schema.String,
  kind: NoticeKind,
  state: NoticeState,
  mine: Schema.Boolean,
  runId: Schema.NullOr(Schema.String),
  word: Schema.NullOr(Schema.String),
  detail: Schema.NullOr(Schema.String),
  action: EntryAction,
  href: Schema.String,
  version: Schema.Number,
  unread: Schema.Boolean,
  settled: Schema.Boolean,
  stack: Schema.Boolean,
  stackHere: Schema.Boolean,
  listed: Schema.Boolean,
  here: Schema.Boolean,
  order: Schema.Number,
})
export type Entry = typeof Entry.Type

