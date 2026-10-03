import { Eye } from "lucide-react"
import type { ReactNode } from "react"
import type { TerminalViewProps as TerminalMetadataProps } from "@smthrs/rpc/TerminalCard"
import { ActorChip, actorName } from "./ActorChip"

export type TerminalViewProps = TerminalMetadataProps & { terminal: ReactNode }

export function TerminalView({ model, actions, onAction, terminal }: TerminalViewProps) {
  const readOnly = !model.viewer_is_owner || model.frozen
  return <section className="smithers-card terminal-view" data-kind="terminal" data-keyboard-pane="Terminal" aria-label={model.title}>
    <header className="smithers-card-header">
      <h2 className="smithers-card-title">{model.title}</h2>
      <code className="terminal-branch">{model.branch}</code>
      <div className="terminal-people">
        <span className="terminal-person" title={`${actorName(model.owner)}'s terminal`}><ActorChip actor={model.owner} size="s" /></span>
        {model.agents.map((actor, i) => <span className="terminal-person" key={i}><ActorChip actor={actor} size="s" live={!model.frozen} /><span>{actorName(actor)}</span></span>)}
        {model.watchers.map((actor, i) => <span className="terminal-person" data-watching key={i} title={`${actorName(actor)} · Watching`}><ActorChip actor={actor} size="s" /><Eye size={11} aria-hidden="true" /></span>)}
      </div>
    </header>
    <div className="smithers-card-body">
      {model.command ? <code className="terminal-command" data-live={!model.frozen || undefined}>{model.command}</code> : null}
      <div className="terminal-output" inert={readOnly} aria-label={`${model.title} output`} role="region">
        {terminal}
      </div>
      {model.frozen || !model.viewer_is_owner ? <div className="terminal-status" role="status">{model.frozen ? <span>Rebasing…</span> : null}{!model.viewer_is_owner ? <span>Watching</span> : null}</div> : null}
      {actions.length ? <div className="terminal-actions">{actions.map((action, i) => <span className="terminal-control" key={i}>
        <button type="button" data-flow={action.tag} data-primary={action.primary || undefined} disabled={!!action.disabled} onClick={() => onAction(action.tag, { ...action.args })}>{action.label}</button>
        {action.disabled ? <span>{action.disabled.reason}</span> : null}
      </span>)}</div> : null}
    </div>
  </section>
}
