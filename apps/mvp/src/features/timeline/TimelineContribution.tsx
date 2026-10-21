import { ChatTimeline } from "@smthrs/ui"
import { railEntries, type RailMessage, type RailSummary } from "./view"

/** Compiled first-party chat.rail contribution. Data is supplied by the host, never acquired privately. */
export function TimelineContribution({ messages, summaries, statuses }: {
  readonly messages: readonly RailMessage[]
  readonly summaries: readonly RailSummary[]
  readonly statuses: readonly { readonly id: string; readonly state: string }[]
}) {
  return <ChatTimeline entries={railEntries(messages, summaries, statuses)} />
}
