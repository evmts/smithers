import { useLiveQuery } from "@tanstack/react-db"
import { codeReadKey, repositoryCodeReads } from "./RepositoryCodeRead"
import { useSyncExternalStore, type CSSProperties } from "react"
import { File, Folder } from "lucide-react"
import type { Card } from "../state/AppState"
import { pathTarget } from "../RepoLink"
import { resolveRefLocation } from "@smthrs/rpc/RepositorySubjectPath"
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

/** A projection of the admitted route's existing read, never an independent reader. */
export function RepositoryCodeView({ repo, cards, refs, commits, admitted, onAsk }: {
  repo: string; cards: ReadonlyArray<Card>; refs: ReadonlyArray<string>; commits?: Readonly<Record<string, string>>; admitted: boolean; onAsk: (text: string) => void
}) {
  const { data: reads } = useLiveQuery(repositoryCodeReads)
  const address = useSyncExternalStore(subscribe, location, () => "")
  const subject = pathTarget(address.split("?")[0]!)?.subject
  if (subject?.kind !== "tree" && subject?.kind !== "blob") return null
  const read = reads.find(row => row.id === codeReadKey(repo, subject.kind, subject.location))
  const located = resolveRefLocation(subject.location, refs)
  const card = admitted && located ? [...cards].reverse().find(item =>
    (item.kind === "file" || item.kind === "file-list") && item.payload.repo.toLowerCase() === repo.toLowerCase()
    && item.payload.path === located.path && item.payload.ref === located.ref
    && item.kind === (subject.kind === "blob" ? "file" : "file-list")) : undefined
  const path = located?.path ?? "", revision = located?.ref ?? ""
  const route = (kind: "tree" | "blob", path: string, ref = revision) => sourceRoute(repo, kind, ref, path)
  const payload = card?.kind === "file" ? card.payload : undefined
  const tokens = payload ? tokenize(payload.content) : []
  const selected = readSelection(address.split("?")[1] ?? "", tokens.length)
  const raw = new URLSearchParams(address.split("?")[1]).get("raw") === "1"
  const query = (key: string, value: string) => { const url = new URL(window.location.href); url.searchParams.set(key, value); window.history.replaceState(null, "", url); window.dispatchEvent(new Event("repository-code-location")) }
  const permalink = () => {
    const commit = payload?.readAt?.commitId ?? commits?.[revision]
    const url = new URL(route(subject.kind, path, commit ?? revision), window.location.origin)
    if (selected) url.searchParams.set("L", `${selected.start}${selected.end === selected.start ? "" : `-${selected.end}`}`)
    void navigator.clipboard.writeText(url.href)
  }
  return <main className="repository-code repo-code-main" data-keyboard-pane="Repository code" aria-label={subject.kind === "tree" ? "Folder view" : "File view"}>
    <div className="repo-code-path-header">
      {located && <select aria-label="Switch branches" value={revision} onChange={event => { window.location.href = route(subject.kind, path, event.target.value) }}>
        {[...new Set([revision, ...refs])].map(ref => <option key={ref}>{ref}</option>)}
      </select>}
      <nav className="repo-code-breadcrumbs" aria-label="File path"><a href={`/${repo}`}>{repo.split("/").at(-1)}</a>
        {path.split("/").filter(Boolean).map((part, index, parts) => <span key={index}><span className="repo-code-separator">/</span>{index === parts.length - 1 ? <strong>{part}</strong> : <a href={route("tree", parts.slice(0, index + 1).join("/"))}>{part}</a>}</span>)}
      </nav>
      {located && <button className="repo-code-permalink" onClick={permalink}>Copy permalink</button>}
    </div>
    {read?.state === "failed" ? <p role="alert">{read.error}</p> : !card ? <p role="status">Loading…</p> : card.kind === "file-list" ? <div className="repository-code-box">
      {card.payload.entries.length === 0 ? <p>This folder is empty.</p> : <div role="table" aria-label={path ? `Files in ${path}` : "Repository files"}>
        {path && <div role="row" className="repo-code-file-row"><span role="cell"><a href={route("tree", path.split("/").slice(0, -1).join("/"))} aria-label="Parent directory">..</a></span></div>}
        {card.payload.entries.map(entry => <div className="repo-code-file-row" role="row" key={entry.name}><span role="cell"><a href={route(entry.kind === "dir" ? "tree" : "blob", [path, entry.name].filter(Boolean).join("/"))}>{entry.kind === "dir" ? <Folder size={17} aria-hidden="true" /> : <File size={17} aria-hidden="true" />}{entry.name}</a></span></div>)}
      </div>}{card.payload.truncated && <p>Truncated</p>}
    </div> : payload && <div className="repository-code-box">
      <div className="repo-code-file-toolbar"><strong>Code</strong><span className="repo-code-file-stats">{tokens.length} lines · {new TextEncoder().encode(payload.content).length.toLocaleString("en-US")} B</span><span className="repo-code-toolbar-spacer" /><button onClick={() => query("raw", raw ? "0" : "1")}>{raw ? "Exit raw" : "Raw"}</button><button aria-label="Copy file contents" onClick={() => void navigator.clipboard.writeText(payload.content)}>Copy</button></div>
      {payload.truncated && <p role="status">Truncated</p>}
      {payload.binary ? <p>Binary file</p> : !payload.content ? <p>This file is empty.</p> : raw ? <pre className="repo-code-raw" aria-label={`Raw ${path}`}>{payload.content}</pre> : <>
        {selected && <div className="repo-code-selection" aria-label="Selected line actions"><span>lines {selected.start}-{selected.end}</span><button onClick={() => onAsk(`Explain lines ${selected.start}-${selected.end} of ${path} at ${revision}`)}>Ask about lines</button><button onClick={permalink}>Copy link</button></div>}
        <div className="repo-code-source" role="region" aria-label={`Source of ${path}`} style={{ "--repo-code-number-width": `calc(${String(tokens.length).length}ch + 12px)` } as CSSProperties}><div className="repo-code-source-scroll"><pre>{tokens.map((line, index) => <span className="repo-code-source-line" key={index} data-line={index + 1} data-selected={selected && index + 1 >= selected.start && index + 1 <= selected.end || undefined}><a className="repo-code-line-number" href={`?L=${index + 1}`} aria-label={`Select line ${index + 1}`} onClick={event => { event.preventDefault(); query("L", event.shiftKey && selected ? `${Math.min(selected.start, index + 1)}-${Math.max(selected.start, index + 1)}` : String(index + 1)) }}>{index + 1}</a><span className="repo-code-diagnostic-gutter" /><code>{line.length ? line.map((token, i) => <span key={i} className={`repo-code-token-${token.kind}`}>{token.text}</span>) : " "}</code></span>)}</pre></div></div>
      </>}
    </div>}
  </main>
}
