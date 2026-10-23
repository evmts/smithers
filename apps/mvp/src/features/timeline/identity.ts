import { digestSync } from "@smthrs/crypto"
import { Redaction } from "@smthrs/journal"

/** Scrub recognized credential forms before clipping, including previously cached summaries. */
export const safeTimelineText = (text: string): string => String(Redaction.redact(text))

/** Full content identity; the model may receive a bounded excerpt of it. */
export const revisionOf = (row: { readonly id: string; readonly role: string; readonly text: string }) => digestSync(JSON.stringify([1, row.id, row.role, row.text]))

/** Old cached state-only summaries cannot replace a concrete subject. */
export const isGenericSummary = (value: string): boolean => /^(?:(?:question|reply|answer|tool|run|todo) (?:sent|completed|done|failed|queued|opened)|working|waiting(?: to send| for reply)?|needs you|not sent|done|completed|failed|queued)[.!]?$/i.test(value.trim())
