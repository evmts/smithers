import type { ReactNode } from "react"
import type { RepositorySubject } from "@smthrs/rpc/RepositorySubjectPath"
import { Copy, File, GitBranch } from "lucide-react"
import type { RunDynamicCommand } from "../cards/CardFamily"
import { flowAction } from "../flows/FlowAction"
import { flowArgs } from "../flows/FlowArgs"
import { hrefFor } from "../RepositoryRouter"
import { flowCommand, type FlowDefinition, type ReadState } from "./FlowContents"
import "./repository-automation.css"

export const FLOW_HELD = "Hosted runs of this flow are held; run it locally instead."
/** A router link, or none when the name cannot round-trip through the URL grammar (never a dead link). */
const link = (repo: string, subject: RepositorySubject): string | undefined => {
  try { return hrefFor({ repo, subject }) } catch { return undefined }
}
export const flowsPath = (repo: string) => link(repo, { kind: "flows" })
export const flowPath = (repo: string, name: string) => link(repo, { kind: "flows", name })
/** The source as a blob at the ref the read used; no link when that ref is unknown. */
export const flowBlobPath = (repo: string, ref: string | undefined, path: string) =>
  ref === undefined ? undefined : link(repo, { kind: "blob", location: `${ref}/${path}` })

/** The local command, copied through the app's clipboard flow (which reports a refused copy itself). */
export function FlowLocalCommand({ name, onRunCommand }: { readonly name: string; readonly onRunCommand: RunDynamicCommand }) {
  const command = flowCommand(name)
  return <div className="repo-flows-command"><code>{command}</code><button type="button" className="repo-ui-btn repo-ui-copy" aria-label={`Copy ${command}`}
    {...flowAction(onRunCommand, "chat.copy-message", flowArgs("chat.copy-message", { text: command }))}><Copy size={13} aria-hidden="true" />Copy</button></div>
}

export function FlowHeld({ name, onRunCommand }: { readonly name?: string; readonly onRunCommand: RunDynamicCommand }) {
  return <div className="repo-flows-held" role="note">
    <p>{FLOW_HELD}</p>{name !== undefined && <FlowLocalCommand key={name} name={name} onRunCommand={onRunCommand} />}
  </div>
}

/** The mock's shared Loading state (frame/states.tsx). */
export function RepositoryLoading({ rows = 5, detail = false }: { rows?: number; detail?: boolean }) {
  return <div className={`repo-frame-loading repo-frame-loading-${detail ? "detail" : "list"}`} role="status" aria-label="Loading">
    {detail && <div className="repo-frame-skeleton repo-frame-skeleton-title" />}
    {Array.from({ length: rows }, (_, i) => <div className="repo-frame-skeleton-row" key={i}>
      <span className="repo-frame-skeleton" style={{ width: `${40 + (i * 13) % 47}%` }} /><span className="repo-frame-skeleton" />
    </div>)}
    <span className="repo-ui-sr">Loading…</span>
  </div>
}

/**
 * The mock's Failed state: what failed, the read's own reason, and Retry. Retry
 * is this route's own link: the router admits the route again and its reader
 * runs once more, without a reload.
 */
export function RepositoryFailed({ what, reason, retry }: { what: string; reason: string; retry?: string }) {
  return <section className="repo-frame-state" role="alert">
    <h2>Couldn't load {what}.</h2><p>{reason}</p>
    {retry && <a className="repo-ui-btn" href={retry}>Retry</a>}
  </section>
}

function Reading<T>({ read, what, retry, missing, detail, children }: {
  read: ReadState<T>; what: string; retry?: string; missing: ReactNode; detail?: boolean; children: (value: T) => ReactNode
}) {
  if (read.state === "loading") return <RepositoryLoading detail={detail} />
  if (read.state === "error") return <RepositoryFailed what={what} reason={read.reason} retry={retry} />
  if (read.state === "missing") return missing
  return children(read.value)
}

function FlowFileLine({ repo, revision, path }: { repo: string; revision?: string; path: string }) {
  const href = flowBlobPath(repo, revision, path)
  return <div className="repo-flows-file-line"><File size={16} aria-hidden="true" />{href ? <a href={href}>{path}</a> : <span>{path}</span>}</div>
}

const FlowsEmpty = () => <section className="repo-frame-state"><h2>No flows yet.</h2><p>Flows live in <code>.smithers/flows/</code></p></section>

/** Read-only repository surface: the route reader (RepositorySubjectEntry) supplies the read. */
export function RepositoryFlows({ repo, revision, read, onRunCommand }: {
  repo: string; revision?: string; read: ReadState<readonly { name: string; path: string }[]>; onRunCommand: RunDynamicCommand
}) {
  const retry = flowsPath(repo)
  return <section className="repo-automation" aria-label="Flows" data-keyboard-pane="Flows">
    <header className="repo-ui-page-header"><div className="repo-ui-page-title"><h1>Flows</h1></div></header>
    <Reading read={read} what="flows" retry={retry} missing={<FlowsEmpty />}>{flows => flows.length === 0 ? <FlowsEmpty /> : <>
      <FlowHeld onRunCommand={onRunCommand} />
      <div className="repo-ui-box"><header className="repo-ui-box-header">{flows.length} {flows.length === 1 ? "flow" : "flows"}</header>{flows.map(flow => {
        const href = flowPath(repo, flow.name)
        return <div className="repo-flows-list-row" key={flow.name}>
          <GitBranch size={19} aria-hidden="true" /><div className="repo-flows-row-main">
            {href ? <a className="repo-flows-name" href={href}>{flow.name}</a> : <span className="repo-flows-name">{flow.name}</span>}
            {(() => { const blob = flowBlobPath(repo, revision, flow.path); return blob ? <a className="repo-flows-path" href={blob}>{flow.path}</a> : <span className="repo-flows-path">{flow.path}</span> })()}
            <FlowLocalCommand name={flow.name} onRunCommand={onRunCommand} />
          </div>
        </div>
      })}</div>
    </>}</Reading>
  </section>
}

/** Stage 1 code view: source bytes are text, never evaluated or rendered as HTML. */
export function RepositorySourceCode({ source, path }: { source: string; path: string }) {
  const lines = source.replace(/\n$/, "").split("\n")
  return <div className="repo-ui-code" role="region" aria-label={path}><div className="repo-ui-code-scroll"><pre>{lines.map((text, index) => <span className="repo-ui-code-line" id={`L${index + 1}`} key={index}>
    <a href={`?L=${index + 1}`} aria-label={`Line ${index + 1}`}>{index + 1}</a><code>{text || " "}</code>
  </span>)}</pre></div></div>
}

export function RepositoryFlow({ repo, name, revision, read, onRunCommand }: {
  repo: string; name: string; revision?: string; read: ReadState<FlowDefinition>; onRunCommand: RunDynamicCommand
}) {
  const back = flowsPath(repo)
  const retry = flowPath(repo, name)
  return <section className="repo-automation" aria-label="Flow" data-keyboard-pane="Flow">
    {back && <a className="repo-flows-back" href={back}>Flows</a>}
    <Reading read={read} what="this flow" retry={retry} detail missing={<section className="repo-frame-state"><h2>Flow not found.</h2>{back && <a href={back}>All flows</a>}</section>}>{flow => <>
      <header className="repo-ui-page-header"><div className="repo-ui-page-title"><h1>{flow.name}</h1></div>
        {flow.description && <p className="repo-ui-muted">{flow.description}</p>}
        <FlowFileLine repo={repo} revision={revision} path={flow.path} />
      </header>
      <FlowHeld key={flow.name} name={flow.name} onRunCommand={onRunCommand} />
      <RepositorySourceCode source={flow.source} path={flow.path} />
    </>}</Reading>
  </section>
}
