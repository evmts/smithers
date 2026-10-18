import { flowArgs } from "../flows/FlowArgs"
import { flowAction, flowProps } from "../flows/FlowAction"
import type { RunDynamicCommand } from "../cards/CardFamily"
import { FailureNotice, unavailableFailure } from "../FailureNotice"
import { RepositoryAskContext } from "./RepoFrame"
import { useLiveQuery } from "@tanstack/react-db"
import { codeReadKey, repositoryCodeReads } from "./RepositoryCodeRead"
import { useContext, useRef, useSyncExternalStore, type CSSProperties } from "react"
import { File, Folder, Link as LinkIcon } from "lucide-react"
import type { Card } from "../state/AppState"
import type { RepositoryBranches } from "../state/seams/RepositoryBranchesSeam"
import type { LatestCommit } from "../state/seams/LatestCommitSeam"
import { BranchPicker } from "./BranchPicker"
import { LatestCommitRow } from "./CodeHome"
import { pathTarget } from "../RepoLink"
import { isCommitRevision, resolveRefLocation } from "@smthrs/rpc/RepositorySubjectPath"
import { tokenize } from "./syntax"
import "./code.css"
import "./repository-code.css"

export const sourceRoute = (repo: string, kind: "tree" | "blob", ref: string, path: string) =>
  `/${repo}/${kind}/${ref.split("/").map(encodeURIComponent).join("/")}${path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : ""}`
export const readSelection = (search: string, count: number) => {
  const value = new URLSearchParams(search).get("L")
  if (!value || !/^\d+(?:-\d+)?$/.test(value)) return null
  const [a = 0, b = a] = value.split("-").map(Number)
  return a > 0 && b > 0 && a <= count && b <= count ? { start: Math.min(a, b), end: Math.max(a, b) } : null
}
const subscribe = (notify: () => void) => { window.addEventListener("popstate", notify); window.addEventListener("repository-code-location", notify); return () => { window.removeEventListener("popstate", notify); window.removeEventListener("repository-code-location", notify) } }
const location = () => window.location.pathname + window.location.search

export const permalinkCommit = (revision: string, readCommit?: string | null, commits?: Readonly<Record<string, string>>) => {
  const candidate = readCommit ?? (isCommitRevision(revision) ? revision : commits?.[revision])
  return candidate && isCommitRevision(candidate) ? candidate : undefined
}

/** A projection of the admitted route's existing read, never an independent reader. */
export function RepositoryCodeView({ repo, cards, refs, commits, branches, onBranchesOpen, latestCommit, admitted, requestId, error, onAsk, onRunCommand }: {
  repo: string; cards: ReadonlyArray<Card>; refs: ReadonlyArray<string>; commits?: Readonly<Record<string, string>>; admitted: boolean; requestId?: string; error?: string; onAsk: (text: string) => void; onRunCommand: RunDynamicCommand
  /** The bookmark list for the branch button (the home's own; Design (F)), and its reader for when the list opens. */
  branches?: RepositoryBranches; onBranchesOpen?: () => void
  /** The P-1 commit read at the ref this view shows (RepositoryCodeRead.latestCommitKey with the ref); absent, there is no bar. */
  latestCommit?: LatestCommit
}) {
  const anchor = useRef<number | null>(null)
  const openAsk = useContext(RepositoryAskContext)
  const { data: reads } = useLiveQuery(repositoryCodeReads)
  const address = useSyncExternalStore(subscribe, location, () => "")
  const subject = pathTarget(address.split("?")[0]!)?.subject
  if (subject?.kind !== "tree" && subject?.kind !== "blob") return null
  const read = reads.find(row => row.id === codeReadKey(repo, subject.kind, subject.location, requestId))
  const located = resolveRefLocation(subject.location, refs)
  const card = admitted && read?.state === "ready" && located ? [...cards].reverse().find(item =>
    (item.kind === "file" || item.kind === "file-list") && item.payload.repo.toLowerCase() === repo.toLowerCase()
    && item.payload.path === located.path && item.payload.ref === located.ref
    && item.kind === (subject.kind === "blob" ? "file" : "file-list")) : undefined
  const path = located?.path ?? "", revision = located?.ref ?? ""
  const route = (kind: "tree" | "blob", path: string, ref = revision) => sourceRoute(repo, kind, ref, path)
  const page = admitted && read?.state === "ready" ? read.page : undefined
  const payload = page ? { content: page.content ?? "", binary: page.binary, originalSize: page.size } : undefined
  const tokens = payload ? tokenize(payload.content) : []
  const selected = readSelection(address.split("?")[1] ?? "", tokens.length)
  const raw = new URLSearchParams(address.split("?")[1]).get("raw") === "1"
  const query = (field: "raw" | "L", value: string) => onRunCommand("code.view", flowArgs("code.view", { pathname: window.location.pathname, field, value }))
  const selectLine = (line: number, extend: boolean) => {
    const first = extend ? anchor.current ?? selected?.start ?? line : line
    if (!extend) anchor.current = line
    query("L", first === line ? String(line) : `${Math.min(first, line)}-${Math.max(first, line)}`)
  }
  const commit = permalinkCommit(revision, page?.commitSha, commits)
  const failure = error ?? (read?.state === "failed" ? read.error : undefined)
  // The contents read answered 404: no file at this path and ref (mock CodeNotFound), never a failed read.
  const missing = !failure && admitted && read?.state === "missing" && located !== undefined
  const permalink = () => {
    if (!commit) return
    const url = new URL(route(subject.kind, path, commit), window.location.origin)
    if (selected) url.searchParams.set("L", `${selected.start}${selected.end === selected.start ? "" : `-${selected.end}`}`)
    return url.href
  }
  return <section role="region" className="repository-code repo-code-main" data-keyboard-pane="Repository code" aria-label={subject.kind === "tree" ? "Folder view" : "File view"}>
    <div className="repo-code-path-header">
      {located && <BranchPicker branch={revision} branches={branches} onOpen={onBranchesOpen} href={ref => route(subject.kind, path, ref)} />}
      <nav className="repo-code-breadcrumbs" aria-label="File path">{located ? <a href={route("tree", "")}>{repo.split("/").at(-1)}</a> : <span>{repo.split("/").at(-1)}</span>}
        {path.split("/").filter(Boolean).map((part, index, parts) => <span key={index}><span className="repo-code-separator">/</span>{index === parts.length - 1 ? <strong>{part}</strong> : <a href={route("tree", parts.slice(0, index + 1).join("/"))}>{part}</a>}</span>)}
      </nav>
      {located && commit && !failure && !missing && <button className="repo-ui-btn repo-ui-btn-primary repo-code-permalink" {...flowAction(onRunCommand, "chat.copy-message", flowArgs("chat.copy-message", { text: permalink() ?? "" }))}><LinkIcon size={14} aria-hidden="true" /><span>Copy permalink</span></button>}
    </div>
    {failure ? <FailureNotice className="repo-frame-state" failure={unavailableFailure("repository.file", "Couldn’t load this file.", failure)} /> : missing ? <section className="repo-frame-state">
      <h2>No {path} at {revision}</h2>
      <a className="repo-ui-btn" href={route("tree", path.split("/").slice(0, -1).join("/"))}><Folder size={15} aria-hidden="true" />Go up a directory</a>
    </section> : !card && !page ? <p role="status">Loading…</p> : card?.kind === "file-list" ? <div className="repository-code-box">
      {latestCommit && <LatestCommitRow commit={latestCommit} />}
      {card.payload.entries.length === 0 ? <p>This folder is empty.</p> : <div role="table" aria-label={path ? `Files in ${path}` : "Repository files"}>
        {path && <div role="row" className="repo-code-file-row"><span role="cell"><a href={route("tree", path.split("/").slice(0, -1).join("/"))} aria-label="Parent directory">..</a></span></div>}
        {card.payload.entries.map(entry => <div className="repo-code-file-row" role="row" key={entry.name}><span role="cell"><a href={route(entry.kind === "dir" ? "tree" : "blob", [path, entry.name].filter(Boolean).join("/"))}>{entry.kind === "dir" ? <Folder size={17} aria-hidden="true" /> : <File size={17} aria-hidden="true" />}{entry.name}</a></span></div>)}
      </div>}{card.payload.truncated && <p>Truncated</p>}
    </div> : payload && <div className="repository-code-box">
      {latestCommit && <LatestCommitRow commit={latestCommit} />}
      <div className="repo-code-file-toolbar"><strong>Code</strong><span className="repo-code-file-stats">{!page?.tooLarge && <>{tokens.length} lines · </>}{payload.originalSize.toLocaleString("en-US")} B</span><span className="repo-code-toolbar-spacer" />{page?.tooLarge ? <a href={page.rawUrl}>Raw</a> : <><button {...flowAction(onRunCommand, "code.view", flowArgs("code.view", { pathname: window.location.pathname, field: "raw", value: raw ? "0" : "1" }))}>{raw ? "Exit raw" : "Raw"}</button><button aria-label="Copy file contents" {...flowAction(onRunCommand, "chat.copy-message", flowArgs("chat.copy-message", { text: payload.content }))}>Copy</button></>}</div>
      {page?.tooLarge ? null : payload.binary ? <p>Binary file</p> : !payload.content ? <p>This file is empty.</p> : raw ? <pre className="repo-code-raw" aria-label={`Raw ${path}`}>{payload.content}</pre> : <>
        {selected && <div className="repo-code-selection" aria-label="Selected line actions"><span>lines {selected.start}-{selected.end}</span><button {...flowProps("chat.open")} onClick={() => { onAsk(`Explain lines ${selected.start}-${selected.end} of ${path} at ${revision}`); if (openAsk) openAsk(onRunCommand); else onRunCommand("chat.open") }}>Ask about lines</button>{commit && <button {...flowAction(onRunCommand, "chat.copy-message", flowArgs("chat.copy-message", { text: permalink() ?? "" }))}>Copy link</button>}</div>}
        <div className="repo-code-source" role="region" aria-label={`Source of ${path}`} style={{ "--repo-code-number-width": `calc(${String(tokens.length).length}ch + 12px)` } as CSSProperties}><div className="repo-code-source-scroll"><pre>{tokens.map((line, index) => <span className="repo-code-source-line" key={index} data-line={index + 1} data-selected={selected && index + 1 >= selected.start && index + 1 <= selected.end || undefined}><a className="repo-code-line-number" href={`?L=${index + 1}`} aria-label={`Select line ${index + 1}`} onKeyDown={event => { if (event.key === "Enter" && event.shiftKey) { event.preventDefault(); selectLine(index + 1, true) } }} {...flowProps("code.view")} onClick={event => { event.preventDefault(); const first = event.shiftKey ? anchor.current ?? selected?.start ?? index + 1 : index + 1; if (!event.shiftKey) anchor.current = index + 1; onRunCommand("code.view", flowArgs("code.view", { pathname: window.location.pathname, field: "L", value: first === index + 1 ? String(first) : `${Math.min(first, index + 1)}-${Math.max(first, index + 1)}` })) }}>{index + 1}</a><span className="repo-code-diagnostic-gutter" /><code>{line.length ? line.map((token, i) => <span key={i} className={`repo-code-token-${token.kind}`}>{token.text}</span>) : " "}</code></span>)}</pre></div></div>
      </>}
    </div>}
  </section>
}
