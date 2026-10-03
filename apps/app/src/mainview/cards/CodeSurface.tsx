/*
 * The highlighted file body (docs/code-intel/PLAN.md §1, §5): `@pierre/diffs`
 * `File` through `@smthrs/ui/adapters/code-view`, Shiki underneath. The
 * adapter is heavy, so FileCards loads this module lazily: it is the async
 * chunk boundary and stays the only place in the app graph that imports the
 * adapter. A file no grammar claims keeps the card's own plain block.
 *
 * Code intelligence rides the same surface and the payload alone: the
 * diagnostics the seam wrote render under their lines, the last hover
 * answer renders under its line, and the two pointer gestures are command
 * bindings supplied by FileCards — a pointer at rest on a token runs
 * `code.hover <path>:<line>:<col> <repo>`, ⌘/Ctrl-click runs
 * `code.definition` with the same position — the same door every row in
 * FileCards.tsx uses, so the slash and the agent tool run the identical act.
 * The gestures bind only where those flows exist (`codeIntel`, the card's
 * reading of the catalog): a host without the workspace language-server
 * tunnel (`cloud.terminal`) renders the same highlighted file with no dead
 * gesture. Nothing here is component state; the one ref is the position last
 * asked, so a pointer that stays put asks once.
 */
import { CodeFileView, languageForFile } from "@smthrs/ui/adapters/code-view"
import type { CodeLineAnnotation, CodeTokenPosition } from "@smthrs/ui/adapters/code-view"
import { useMemo, useRef, type ReactNode } from "react"
import type { Card } from "../state/AppState"

type FilePayload = Extract<Card, { kind: "file" }>["payload"]
type Diagnostic = NonNullable<FilePayload["diagnostics"]>[number]

/** The mark before a diagnostic's message; the mockup's `✖` for an error, its counterpart for a warning, a dot for the rest. */
const SEVERITY_GLYPH: Readonly<Record<Diagnostic["severity"], string>> = { error: "✖", warning: "▲", information: "·", hint: "·" }

const DiagnosticRow = ({ item }: { readonly item: Diagnostic }) => {
  const origin = [item.source, item.code].filter((part): part is string => part !== undefined).join(" ")
  return (
    <p className="code-diagnostic" data-slot="code-diagnostic" data-severity={item.severity}>
      <span className="code-diagnostic-glyph" aria-hidden="true">{SEVERITY_GLYPH[item.severity]}</span>
      <span className="code-diagnostic-message">{item.message}</span>
      {origin === "" ? null : <span className="code-diagnostic-origin">({origin})</span>}
    </p>
  )
}

export const CodeSurface = ({
  payload,
  codeIntel,
  onHover, onDefinition, hoverContents, gestureProps
}: {
  readonly payload: FilePayload
  /** Whether this host registers the code.* flows (FileCards reads the catalog); false binds no gesture. */
  readonly codeIntel: boolean
  readonly onHover: (token: CodeTokenPosition) => void
  readonly onDefinition: (token: CodeTokenPosition) => void
  readonly hoverContents?: ReactNode
  readonly gestureProps?: Record<string, string>
}) => {
  const { path, content, line, hover, diagnostics, intel } = payload

  const annotations = useMemo<ReadonlyArray<CodeLineAnnotation>>(
    () => [
      ...(diagnostics ?? []).map((item, index) => ({ key: `diagnostic-${index}`, line: item.line, node: <DiagnosticRow item={item} /> })),
      ...(hover == null ? [] : [{ key: "hover", line: hover.line, node: hoverContents }])
    ],
    [diagnostics, hover, hoverContents]
  )

  /*
   * One hover in flight: the position last asked, with the payload it was
   * asked against. The same position is not asked again until the payload
   * has moved (the answer landed, or anything else patched the card); a
   * position the payload already answers is never asked.
   */
  const asked = useRef<{ readonly key: string; readonly payload: FilePayload } | null>(null)
  const onTokenRest = (token: CodeTokenPosition): void => {
    const key = `${token.line}:${token.column}`
    if (hover != null && hover.line === token.line && hover.character === token.column) return
    if (asked.current !== null && asked.current.key === key && asked.current.payload === payload) return
    asked.current = { key, payload }
    onHover(token)
  }
  const onTokenActivate = (token: CodeTokenPosition): void => onDefinition(token)

  if (languageForFile(path) === null) return <pre className="world-card-path">{content}</pre>
  /*
   * A host without the flows, or a card that already knows there is no
   * server to ask (the note under the header states it, with the install
   * line), binds no gesture: every rest would be one more refusal — or, on
   * a host that drops an unregistered name, nothing at all.
   */
  const bound = codeIntel && intel?.state !== "missing" && intel?.state !== "unavailable"
  return (
    <div className="code-surface" {...(bound ? gestureProps : {})}>
      <CodeFileView
        name={path}
        contents={content}
        line={line}
        annotations={annotations}
        onTokenRest={bound ? onTokenRest : undefined}
        onTokenActivate={bound ? onTokenActivate : undefined}
      />
    </div>
  )
}

import { formatBytes } from "./views/formatBytes"
import type { CodeEditorViewProps } from "@smthrs/rpc/FileCard"
import { Editor } from "./views/Editor"
import { ActorChip, actorName } from "./views/ActorChip"
import { DiffAction } from "./views/DiffAction"
import { FileX, FileSymlink, FolderSync, History, TriangleAlert } from "lucide-react"

export function FileCardSurface({ model, actions, view, gestures, onAction, onView }: CodeEditorViewProps) {
  const controls = actions.length ? <div className="code-actions">{actions.map((action, index) => <DiffAction key={index} action={action} onAction={onAction} />)}</div> : null
  return <section className="smithers-card code-file-view" data-kind="file" data-keyboard-pane="File" data-digest={model.digest} data-mode={model.mode} aria-label={model.path}>
    <header className="smithers-card-header"><h2 className="smithers-card-title">{model.path}</h2><span className="mvp-branch-chip">{model.branch}</span>
      {model.last_writer ? <span className="code-writer" title={actorName(model.last_writer)}><ActorChip actor={model.last_writer} size="s" /></span> : null}
      {model.gone ? <span className="code-file-state">{model.gone.kind === "deleted" ? <FileX size={13} aria-hidden="true" /> : <FileSymlink size={13} aria-hidden="true" />}{model.gone.kind === "deleted" ? "Deleted" : "Renamed"}</span> : null}
    </header>
    <div className="smithers-card-body">
      {model.gone ? <>
        <div className="code-file-notice"><TriangleAlert size={14} aria-hidden="true" /><span>{model.gone.kind === "deleted" ? <>Deleted by {actorName(model.gone.by)}</> : <>Renamed to <code>{model.gone.to}</code> by {actorName(model.gone.by)}</>}</span>{controls}</div>
        <div className="code-snapshot-cap"><History size={12} aria-hidden="true" />Snapshot</div>
      </> : model.outside ? <div className="code-file-notice" data-tone="outside"><FolderSync size={14} aria-hidden="true" /><span>Changed outside Smithers</span>{controls}</div> : null}
      {!model.gone && !model.outside ? controls : null}
      {!model.gone && model.outside && view.compare ? <div className="code-compare" role="group" aria-label="Live and outside versions"><div><span>Live</span><code tabIndex={0} aria-label="Live version">{model.content.kind === "text" ? model.content.text : model.digest}</code></div><div><span>Outside</span><code tabIndex={0} aria-label="Outside version">{model.outside.version}</code></div></div> : null}
      {model.content.kind === "text" ? <Editor path={model.path} text={model.content.text} language={model.language} diagnostics={model.diagnostics} hover={model.hover} reveal={model.reveal} gestures={gestures} onAction={onAction} onView={onView} /> : <p className="code-file-size">{model.content.kind === "binary" ? "Binary file" : "Too large to show"} · {formatBytes(model.content.bytes, "decimal")} {model.github_url ? <a href={model.github_url} target="_blank" rel="noreferrer">on GitHub ↗</a> : null}</p>}
      {model.diagnostics.length ? <ul className="code-diagnostics">{model.diagnostics.map((diagnostic, index) => <li key={index} data-severity={diagnostic.severity}>{diagnostic.message}</li>)}</ul> : null}
    </div>
  </section>
}
