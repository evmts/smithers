import { markdownBlockParser } from "@smthrs/ui/markdown"
import { cloneElement, createElement, isValidElement, useState, type ReactNode } from "react"
import { FileText, Folder, GitBranch } from "lucide-react"
import { ageLabel } from "../Timestamps"
import type { RepositoryBranches } from "../state/seams/RepositoryBranchesSeam"
import type { ChangeRow, RepoTreeRow } from "../state/AppState"
import type { RepositoryHomeAnswer } from "../cards/RepositoryHomeView"
import "./code-home.css"

// Reuse the shared safe parser, substituting native heading elements for its
// transcript typography wrappers. Fences, inline formatting and links stay shared.
export function RepositoryMarkdown({ content }: { content: string }) {
  const semantic = (node: ReactNode): ReactNode => {
    if (Array.isArray(node)) return node.map(semantic)
    if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) return node
    const level = /sui-md-h([1-6])(?:\s|$)/.exec(node.props.className ?? "")?.[1]
    if (level) return createElement(`h${level}`, { key: node.key, className: node.props.className }, node.props.children)
    return cloneElement(node, undefined, semantic(node.props.children))
  }
  return <div className="repo-ui-markdown sui-md">{semantic(markdownBlockParser.render(content))}</div>
}

export const REPOSITORY_CLONE_HOST = "https://api.smithers.sh"

export function CodeHome({ repo, branch, branches, headCommit, latestCommit, onBranchesOpen, tree, home }: {
  repo: string; branch?: string; branches?: RepositoryBranches; headCommit?: string | null; latestCommit?: ChangeRow
  onBranchesOpen?: () => void; tree?: RepoTreeRow; home?: RepositoryHomeAnswer; 
}) {
  const [filter, setFilter] = useState("")
  const names = branches?.state === "ready" ? branches.names : branch ? [branch] : []
  const fullSha = /^[a-f0-9]{40}$/i.test(filter)
  const latestSha = headCommit != null && /^[a-f0-9]{40}$/i.test(headCommit) ? headCommit : undefined
  const commit = latestSha !== undefined && latestCommit?.repoId === repo && latestCommit.commitId === latestSha ? latestCommit : undefined
  const base = `/${repo}`
  const ref = branch === undefined ? undefined : encodeURIComponent(branch)
  const readme = home?.kind === "readme" ? home.markdown : home?.kind === "blocks" ? home.blocks.flatMap(block => block.type === "markdown" && /readme/i.test(block.path) ? [block.markdown] : [])[0] : undefined
  return <div className="repo-code-home-layout"><div className="repo-code-home-main">
    <div className="repo-code-home-toolbar">
      {branch && <details className="repo-ui-dropdown" onToggle={event => { if (event.currentTarget.open) onBranchesOpen?.() }}><summary className="repo-ui-btn"><GitBranch size={16}/>{branch}</summary><div className="repo-ui-menu repo-ui-branch-menu">
        <input className="repo-ui-input" aria-label="Filter branches or enter full SHA" placeholder="Find a branch or full SHA…" value={filter} onChange={event => setFilter(event.target.value)}/>
        {branches?.state === "loading" && <p role="status">Loading…</p>}
        {branches?.state === "failed" && <p role="alert">{branches.error}</p>}
        {names.filter(name => name.toLowerCase().includes(filter.toLowerCase())).map(name => <a key={name} className="repo-ui-menu-item" href={`${base}/tree/${encodeURIComponent(name)}`}>{name}</a>)}
        {fullSha && <a className="repo-ui-menu-item" href={`${base}/tree/${filter}`}>{filter}</a>}
        {branches?.state === "ready" && !fullSha && !names.some(name => name.toLowerCase().includes(filter.toLowerCase())) && <p className="repo-ui-muted">No branches found.</p>}
      </div></details>}
      {branches?.state === "ready" && <span className="repo-ui-muted">{branches.names.length} {branches.names.length === 1 ? "branch" : "branches"}</span>}
      <div className="repo-code-home-toolbar-spacer"/>
      <details className="repo-ui-dropdown repo-code-home-code-menu"><summary className="repo-ui-btn">Code</summary><div className="repo-ui-menu"><h3>Clone</h3><div className="repo-code-home-command"><code>{`git clone ${REPOSITORY_CLONE_HOST}/${repo}.git`}</code><button className="repo-ui-btn" aria-label="Copy clone URL" onClick={() => void navigator.clipboard.writeText(`git clone ${REPOSITORY_CLONE_HOST}/${repo}.git`)}>Copy</button></div></div></details>
    </div>
    <section className="repo-ui-box repo-code-home-files" aria-label="Files">
      {latestSha && <div className="repo-code-home-latest" aria-label="Latest commit">
        {commit?.authorName && <strong>{commit.authorName}</strong>}{commit?.description && <span>{commit.description.split("\n")[0]}</span>}
        {commit?.timestamp && <time dateTime={commit.timestamp}>{ageLabel(commit.timestamp)}</time>}<code>{latestSha}</code>
      </div>}
      {tree === undefined || tree.state === "loading" ? <div className="repo-frame-state" role="status">Loading…</div> : tree.state === "failed" ? <div className="repo-frame-state" role="alert">{tree.error}</div> : tree.entries.length === 0 ? <div className="repo-frame-state"><h2>This repository is empty.</h2></div> : <div role="table" aria-label="Repository files"><div className="repo-ui-sr" role="row"><span role="columnheader">Name</span></div>{tree.entries.map(entry => <div className="repo-code-home-file-row" role="row" key={entry.name}><span role="cell"><a href={ref ? `${base}/${entry.kind === "dir" ? "tree" : "blob"}/${ref}/${encodeURIComponent(entry.name)}` : `${base}/${entry.kind === "dir" ? "tree" : "blob"}/HEAD/${encodeURIComponent(entry.name)}`}>{entry.kind === "dir" ? <Folder size={16}/> : <FileText size={16}/>} {entry.name}</a></span></div>)}</div>}
    </section>
    {home?.kind === "error" && <p role="alert">{home.message}</p>}
    {readme !== undefined && <section className="repo-ui-box" aria-label="README"><div className="repo-ui-box-header">README.md</div><div className="repo-code-home-readme"><RepositoryMarkdown content={readme}/></div></section>}
  </div></div>
}
