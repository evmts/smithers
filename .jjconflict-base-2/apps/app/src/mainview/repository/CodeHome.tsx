import { markdownBlockParser } from "@smthrs/ui/markdown"
import { cloneElement, createElement, isValidElement, type ReactNode } from "react"
import { FileText, Folder, GitBranch } from "lucide-react"
import type { RepoTreeRow } from "../state/AppState"
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

export function CodeHome({ repo, branch, tree, home }: {
  repo: string; branch?: string; tree?: RepoTreeRow; home?: RepositoryHomeAnswer; summary?: string
}) {
  const base = `/${repo}`
  const ref = branch === undefined ? undefined : encodeURIComponent(branch)
  const readme = home?.kind === "readme" ? home.markdown : home?.kind === "blocks" ? home.blocks.flatMap(block => block.type === "markdown" && /readme/i.test(block.path) ? [block.markdown] : [])[0] : undefined
  return <div className="repo-code-home-layout"><div className="repo-code-home-main">
    <div className="repo-code-home-toolbar">
      {branch && <details className="repo-ui-dropdown"><summary className="repo-ui-btn"><GitBranch size={16}/>{branch}</summary><div className="repo-ui-menu"><a href={`${base}/tree/${ref}`}>{branch}</a><a href={`${base}/branches`}>Branches</a></div></details>}
      <div className="repo-code-home-toolbar-spacer"/>
      <details className="repo-ui-dropdown repo-code-home-code-menu"><summary className="repo-ui-btn">Code</summary><div className="repo-ui-menu"><h3>Clone</h3><div className="repo-code-home-command"><code>{`git clone ${REPOSITORY_CLONE_HOST}/${repo}.git`}</code><button className="repo-ui-btn" aria-label="Copy clone URL" onClick={() => void navigator.clipboard.writeText(`git clone ${REPOSITORY_CLONE_HOST}/${repo}.git`)}>Copy</button></div></div></details>
    </div>
    <section className="repo-ui-box repo-code-home-files" aria-label="Files">
      {tree === undefined || tree.state === "loading" ? <div className="repo-frame-state" role="status">Loading…</div> : tree.state === "failed" ? <div className="repo-frame-state" role="alert">{tree.error}</div> : tree.entries.length === 0 ? <div className="repo-frame-state"><h2>This repository is empty.</h2></div> : <div role="table" aria-label="Repository files">{tree.entries.map(entry => <div className="repo-code-home-file-row" role="row" key={entry.name}><span role="cell"><a href={ref ? `${base}/${entry.kind === "dir" ? "tree" : "blob"}/${ref}/${encodeURIComponent(entry.name)}` : `${base}/${entry.kind === "dir" ? "tree" : "blob"}/HEAD/${encodeURIComponent(entry.name)}`}>{entry.kind === "dir" ? <Folder size={16}/> : <FileText size={16}/>} {entry.name}</a></span></div>)}</div>}
    </section>
    {home?.kind === "error" && <p role="alert">{home.message}</p>}
    {readme !== undefined && <section className="repo-ui-box" aria-label="README"><div className="repo-ui-box-header">README.md</div><div className="repo-code-home-readme"><RepositoryMarkdown content={readme}/></div></section>}
  </div></div>
}
