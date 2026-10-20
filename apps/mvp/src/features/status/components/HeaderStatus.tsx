import { AgentStatusPill } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useStatus } from "./StatusContext"

// The header's pill (decision 0015): Needs you, with a count above 1, while any question needs the person, and pressing
// it brings the oldest into view; else the latest answer's Working, Waiting or Failed; else nothing.
export function HeaderStatus() {
  const { queries, actions } = useStatus()
  const { data: needs } = useLiveQuery(queries.needs)
  const { data: latest } = useLiveQuery(queries.latest)
  if (needs.length > 0) {
    return (
      <AgentStatusPill
        state="needs_you"
        count={needs.length}
        label={needs.length > 1 ? `Smithers needs you: ${needs.length} questions` : "Smithers needs you"}
        onClick={actions.focusFirst}
      />
    )
  }
  const state = latest[0]?.state
  return state === "working" || state === "waiting" || state === "failed" ? <AgentStatusPill state={state} /> : null
}
