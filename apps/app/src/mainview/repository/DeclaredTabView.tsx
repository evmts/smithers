import type { RepositorySubject } from "@smthrs/rpc/RepositorySubjectPath"
import { CodeFileView } from "@smthrs/ui/adapters/code-view"
import { RepositoryMarkdown } from "./CodeHome"
import { docsLink, type DeclaredTabsData } from "./DeclaredTabsData"
import "./declared-tabs.css"

export function DeclaredTabView({ repo, subject, data, signedIn, onAsk, retry }: {
  repo: string; subject: Extract<RepositorySubject, { kind: "docs" | "evals" }>; data?: DeclaredTabsData
  signedIn: boolean; onAsk: (path: string) => void; retry: () => void
}) {
  const failed = (message: string) => <div className="repo-frame-state" role="alert"><p>{message}</p><button className="repo-ui-btn" onClick={retry}>Retry</button></div>
  if (!data) return <div className="repo-frame-state" role="status">Loading…</div>
  if (data.error) return failed(data.error)
  const tab = data.tabs.find(tab => subject.kind === "docs" ? tab.declaration.type === "docs" : tab.declaration.type === "eval" && tab.declaration.suite === subject.suite)
  if (!tab) return <div className="repo-frame-state"><h2>Not found</h2></div>
  if (tab.error) return failed(tab.error)
  if (subject.kind === "docs" && tab.declaration.type === "docs") {
    if (!tab.navigation?.some(page => page.path)) return <div className="repo-frame-state">No docs yet</div>
    const path = subject.path === undefined ? tab.declaration.index : decodeURIComponent(subject.path)
    const page = tab.files.find(file => file.path === path)
    const read = tab.reads?.[path]
    if (!tab.navigation?.some(page => page.path === path)) return <div className="repo-frame-state"><h2>Not found</h2></div>
    return <div className="repo-declared-docs"><nav aria-label="Documentation"><h2>{tab.declaration.title}</h2>{tab.navigation.map((entry, index) => entry.path === undefined ? <h3 key={index}>{entry.title}</h3> : <a key={index} href={`/${repo}/docs/${entry.path.split("/").map(encodeURIComponent).join("/")}`} aria-current={entry.path === path ? "page" : undefined}>{entry.title}</a>)}</nav><article><div className="repo-declared-toolbar"><button className="repo-ui-btn repo-ui-btn-primary" data-ask-page onClick={() => onAsk(`${tab.declaration.type === "docs" ? tab.declaration.root : ""}/${path}`)}>{signedIn ? "Ask about this page" : "Sign in"}</button></div>{read?.state === "failed" ? failed(read.error ?? "Could not read page") : read?.state !== "loaded" || !page ? <div className="repo-frame-state" role="status">Loading…</div> : <RepositoryMarkdown content={page.content} language="ts" link={href => docsLink(repo, path, href)}/>}</article></div>
  }
  if (tab.declaration.type !== "eval" || subject.kind !== "evals") return null
  const command = tab.declaration.command
  const selected = subject.case
  const read = selected ? tab.reads?.[selected] : undefined
  const files = selected ? tab.files.filter(file => file.path.startsWith(`${selected}/`)) : []
  return <section className="repo-declared-eval"><header className="repo-declared-toolbar"><h2>{tab.declaration.title}</h2><a className="repo-ui-btn repo-ui-btn-primary" href="#eval-held">Run eval</a></header><div id="eval-held" className="repo-ui-box repo-declared-held" tabIndex={-1}><p>Hosted runs arrive later. Run it locally:</p><div><code>{command}</code><button className="repo-ui-btn" onClick={() => void navigator.clipboard.writeText(command)}>Copy</button></div></div>{tab.cases.length === 0 ? <div className="repo-frame-state">No cases yet</div> : <div className="repo-ui-box"><ul className="repo-declared-cases">{tab.cases.map(id => <li key={id}><a href={`/${repo}/evals/${tab.declaration.type === "eval" ? tab.declaration.suite : ""}?${new URLSearchParams({ case: id })}`} aria-current={id === selected ? "page" : undefined}>{id}</a></li>)}</ul></div>}{selected && (!tab.cases.includes(selected) ? <div className="repo-frame-state">Not found</div> : read?.state === "failed" ? failed(read.error ?? "Could not read case") : read?.state !== "loaded" ? <div className="repo-frame-state" role="status">Loading…</div> : files.length === 0 ? <div className="repo-frame-state">No files</div> : <div className="repo-declared-case" aria-label="Case files">{files.map(file => <section className="repo-ui-box" key={file.path}><h3 className="repo-ui-box-header">{file.path.slice(selected.length + 1)}</h3><CodeFileView name={file.path} contents={file.content}/></section>)}</div>)}</section>
}
