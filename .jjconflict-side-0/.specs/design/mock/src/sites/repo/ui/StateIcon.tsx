/* StateIcon accepts issue, pull, run and check states. It includes an accessible state name. */
import { Icon } from "../../app/lib"
export const StateIcon = ({ state, size = 16 }: { state: string; size?: number }) => {
  const name = ["succeeded", "success", "approved"].includes(state) ? "check" : ["failed", "failure", "cancelled", "denied", "changes_requested"].includes(state) ? "x" : state === "draft" ? "change" : state === "closed" ? "issue-closed" : state === "merged" ? "change" : ["running", "waiting", "pending", "queued"].includes(state) ? "clock" : "issue"
  return <span className={`repo-ui-state-icon repo-ui-state-${state}`} role="img" aria-label={state}><Icon name={name} size={size} /></span>
}
