import { Check, FolderSync, TriangleAlert } from "lucide-react"
import { useMemo } from "react"
import type { Extension } from "@smthrs/ui/adapters/code-editor"
import { copyText } from "@smthrs/ui/copy"
import { coEditing } from "./CoEditing"
import { formatBytes } from "./formatBytes"
import type { CodeEditorViewProps } from "@smthrs/rpc/FileCard"
import { Editor } from "./Editor"
import { ActorChip, actorName } from "./ActorChip"

export function CodeEditorView({ model, binding, actions, gestures, onAction, onView }: CodeEditorViewProps<Extension>) {
  const extensions = useMemo(() => binding && model.mode === "live" ? [binding.extensions, coEditing(model)] : [], [binding, model.mode, model.authors, model.editors])
  return <section className="smithers-card code-file-view" data-kind="file" data-keyboard-pane="File" data-digest={model.digest} data-mode={model.mode} aria-label={model.path}>
    <header className="smithers-card-header"><h2 className="smithers-card-title">{model.path}</h2><span className="mvp-branch-chip">{model.branch}</span>
      {model.last_writer && model.mode !== "live" ? <span className="code-writer" title={actorName(model.last_writer)}><ActorChip actor={model.last_writer} size="s" /></span> : null}
      {model.mode === "live" ? <span className="code-live-head">{model.editors.map((editor, i) => <ActorChip key={i} actor={editor.actor} size="s" />)}{model.saved ? <span className="code-saved" data-saving={model.saved === "saving" || undefined}>{model.saved === "saving" ? <><span className="code-saving-mark" aria-hidden="true" />Saving…</> : <><Check size={13} aria-hidden="true" />Saved to the machine</>}</span> : null}</span> : null}
    </header>
    <div className="smithers-card-body">
      {model.outside ? <div className="code-notice"><FolderSync size={14} aria-hidden="true" />Changed outside Smithers</div> : null}
      {model.unsaved ? <div className="code-recovery"><span><TriangleAlert size={14} aria-hidden="true" />{model.unsaved.count} {model.unsaved.count === 1 ? "edit wasn't" : "edits weren't"} saved</span><pre>{model.unsaved.text}</pre><button type="button" onClick={() => copyText(model.unsaved!.text)}>Copy</button></div> : null}
      {actions.length ? <div className="code-actions">{actions.map((action, i) => <span key={i}><button type="button" data-flow={action.tag} disabled={!!action.disabled} onClick={() => onAction(action.tag, { ...action.args })}>{action.label}</button>{action.disabled ? <small>{action.disabled.reason}</small> : null}</span>)}</div> : null}
      {model.content.kind === "text" ? <Editor live={model.mode === "live" && !!binding} extensions={extensions} path={model.path} text={model.content.text} language={model.language} diagnostics={model.diagnostics} hover={model.hover} reveal={model.reveal} gestures={gestures} onAction={onAction} onView={onView} /> : <p className="code-file-size">{model.content.kind === "binary" ? "Binary file" : "Too large to co-edit"} · {formatBytes(model.content.bytes, "decimal")} {model.github_url ? <a href={model.github_url} target="_blank" rel="noreferrer">on GitHub ↗</a> : null}</p>}
      {model.diagnostics.length ? <ul className="code-diagnostics">{model.diagnostics.map((diagnostic, index) => <li key={index} data-severity={diagnostic.severity}>{diagnostic.message}</li>)}</ul> : null}
    </div>
  </section>
}
