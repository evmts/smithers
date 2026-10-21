import { AgentStatusPill } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useStatus } from "./StatusContext"

// The header's pill (decision 0015): the latest answer's Working, Waiting or Failed; else nothing. A question that
// needs the person shows on the top bar's bell instead, which opens the notifications panel at it (decision 0009).
export function HeaderStatus() {
  const { queries } = useStatus()
  const { data: latest } = useLiveQuery(queries.latest)
  const state = latest[0]?.state
  return state === "working" || state === "waiting" || state === "failed" ? <AgentStatusPill state={state} /> : null
}
