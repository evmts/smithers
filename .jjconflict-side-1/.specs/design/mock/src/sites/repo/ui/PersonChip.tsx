/* Every person and agent avatar uses this identity, including compact list avatars. */
import { person } from "../fixtures"
import { Icon } from "./Icon"

const lanes: Record<string, string> = {
  maya: "maya", will: "will", cora: "cora", "dev-ahn": "dev"
}

export const PersonChip = ({ login, compact = false }: { login: string; compact?: boolean }) => {
  const who = person(login)
  const agent = who.kind === "agent"
  const label = agent ? `${login} (agent)` : login
  return (
    <span className="repo-ui-person" title={label}>
      <span className={`repo-ui-avatar${agent ? " repo-ui-avatar-agent" : ""}`}
        data-lane={agent ? undefined : lanes[login] ?? "guest"}
        aria-label={compact ? label : undefined}>
        {agent ? <Icon name="agent" size={12} /> : (who.initials || who.name || login).slice(0, 1).toUpperCase()}
      </span>
      {!compact && <span>{login}</span>}
    </span>
  )
}
