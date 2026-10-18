/* <AgentMark agent={commit.agent}/>; mark is an alias. Explicit run/harness are supported for run authors. */
import { Link } from "../../core/router"
import { to } from "../fixtures"
import { Icon } from "./Icon"
import type { AgentMark as Mark } from "../fixtures/types"
export const AgentMark = ({ agent, mark, run, harness }: { agent?: Mark; mark?: Mark; run?: string; harness?: string }) => {
  const data = agent ?? mark
  const id = data?.run ?? run
  if (!id) return null
  return <Link className="repo-ui-agent" to={to(`runs/${id}`)} title={`${data?.harness ?? harness ?? "Agent"}${data ? ` · for ${data.for}` : ""}`}><span><Icon name="agent" size={12} />agent</span>{(data?.harness ?? harness) && <span className="repo-ui-agent-harness">{data?.harness ?? harness}</span>}</Link>
}
