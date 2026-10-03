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
  readonly gestureProps?: Record<string, string | undefined>
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
