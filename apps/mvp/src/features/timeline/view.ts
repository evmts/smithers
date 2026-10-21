import type { ChatTimelineEntry } from "@smthrs/ui"
import { revisionOf } from "./identity"

export interface RailMessage { readonly id: string; readonly role: string; readonly status: string; readonly text: string; readonly createdAt?: string; readonly inputTokens?: number | null; readonly outputTokens?: number | null }
export interface RailSummary { readonly id: string; readonly revision: string; readonly summary: string }
export const railEntries = (messages: readonly RailMessage[], summaries: readonly RailSummary[], statuses: readonly { readonly id: string; readonly state: string }[]): ChatTimelineEntry[] =>
  messages.filter(message => message.role !== "view").map(message => ({
    id: message.status === "unsent" ? `unsent:${message.id}` : message.id,
    actor: message.role === "user" ? "Person" : "Smithers",
    time: message.createdAt || undefined,
    // A conversation row reads 0 for a message whose tokens aren't known (src/features/chat/queries.ts), as null does here.
    tokens: message.inputTokens != null && message.outputTokens != null && message.inputTokens + message.outputTokens > 0
      ? message.inputTokens + message.outputTokens
      : undefined,
    kind: message.role === "user" ? "ask" : "answer",
    state: statuses.find(status => status.id === message.id)?.state === "needs_you" ? "waiting"
      : statuses.find(status => status.id === message.id)?.state === "waiting" ? "queued"
      : message.status === "streaming" ? "working" : message.status === "failed" || message.status === "unsent" ? "failed"
      : message.status === "queued" ? "queued" : "done",
    summary: message.status === "done" ? summaries.find(summary => summary.id === message.id && summary.revision === revisionOf(message))?.summary : undefined,
  }))
