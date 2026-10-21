import { Schema } from "effect"

// The shapes deployed builds stored that this build no longer writes (decision 0021): frozen copies, never imported
// from a feature's schema, so a feature's change can't rewrite history. The lock (schemas.lock.json) records each
// one's fingerprint, and `pnpm test` fails if one changes. Each names the build that last wrote it.

/** The issue writes' operations at `7b96f878`. */
const WRITE_OPS_7B96F878 = ["issue/create", "issue/comment"] as const

/** The issue writes' Not sent reasons at `7b96f878`. */
const NOT_SENT_REASONS_7B96F878 = [
  "invalid",
  "authentication",
  "forbidden",
  "not_found",
  "conflict",
  "too_large",
  "sign_in_required",
  "not_allowed",
  "app_not_installed",
  "unavailable",
] as const

/** An issue write's fields at `7b96f878`: who it acted for (`via`) was the row's to say. */
const QueuedWriteV1 = {
  id: Schema.String,
  repo: Schema.String,
  op: Schema.Literals(WRITE_OPS_7B96F878),
  via: Schema.Literals(["person", "agent"]),
  title: Schema.String,
  number: Schema.Number,
  body: Schema.String,
}

/** `issue-requested`, version 1 (`7b96f878`): a write the server took or refused, kept until GitHub has it. */
export const RequestedV1 = Schema.Struct({
  ...QueuedWriteV1,
  repoId: Schema.String,
  queuedAt: Schema.Number,
  status: Schema.Literals(["requested", "not_sent"]),
  reason: Schema.NullOr(Schema.Literals(NOT_SENT_REASONS_7B96F878)),
})
export type RequestedV1 = typeof RequestedV1.Type

/** The outbox's `issue-sending` rows, version 1 (`7b96f878`): an issue write waiting to be sent. */
export const IssueSendingV1 = Schema.Struct({
  ...QueuedWriteV1,
  repoId: Schema.String,
  queuedAt: Schema.Number,
  v: Schema.Literal(1),
})
export type IssueSendingV1 = typeof IssueSendingV1.Type

/**
 * `chat-drafts`, version 1 (`7b96f878`): the composer's draft in a conversation, by the conversation's id or `home`. It
 * is still the draft wherever the prompt isn't shared; on a branch its owner shared, the composer types a kept draft
 * into the branch's prompt, merged with any text there, and deletes it (src/features/coedit/actions.ts `followPrompt`).
 */
export const ChatDraftV1 = Schema.Struct({ id: Schema.String, text: Schema.String })
export type ChatDraftV1 = typeof ChatDraftV1.Type
