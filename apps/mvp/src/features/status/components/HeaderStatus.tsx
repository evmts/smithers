import { AgentStatusPill } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useChat } from "../../../AppContext"
import { useStatus } from "./StatusContext"

// The header's pill (decision 0015): the latest answer's Working, Waiting or Failed, in the conversation the tab shows;
// else nothing. A question that needs the person shows on the top bar's bell instead, which opens the notifications
// panel at it (decision 0009).
export function HeaderStatus() {
  const { data: place } = useLiveQuery(useChat().queries.place)
  const { data: latest } = useLiveQuery(useStatus().queries.of(place?.conversationId).latest)
  const state = latest[0]?.state
  return state === "working" || state === "waiting" || state === "failed" ? <AgentStatusPill state={state} /> : null
}
