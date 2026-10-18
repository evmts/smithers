import { useState } from "react"
import { GitBranch } from "lucide-react"
import { FailureNotice, unavailableFailure } from "../FailureNotice"
import type { RepositoryBranches } from "../state/seams/RepositoryBranchesSeam"

/**
 * The branch button (repo-ui-spec "The repo header": the branch picker; mock
 * ui/BranchPicker.tsx): the Code home's `repo-ui-btn` disclosure (36 px, 40 px
 * on a phone) with the bookmark list the branch seam reads when it opens, a
 * filter that also takes a full commit id, and one link per ref. The tree and
 * blob views mount this same component (Design (F)), never a native select;
 * `href` says where a ref leads, so a code view keeps its path at the new ref.
 */
export function BranchPicker({ branch, branches, onOpen, href }: {
  /** The ref the view shows. */
  branch: string
  branches?: RepositoryBranches
  /** Called when the list opens: the bookmarks are read then, not before. */
  onOpen?: () => void
  /** Where a ref leads: the home to its tree root, a code view to the same path at that ref. */
  href: (ref: string) => string
}) {
  // Transient chrome: the open list's filter text, nothing a reader would miss after a reload.
  const [filter, setFilter] = useState("")
  const names = branches?.state === "ready" ? branches.names : [branch]
  const fullSha = /^[a-f0-9]{40}$/i.test(filter)
  const shown = names.filter(name => name.toLowerCase().includes(filter.toLowerCase()))
  return <details className="repo-ui-dropdown" onToggle={event => { if (event.currentTarget.open) onOpen?.() }}><summary className="repo-ui-btn"><GitBranch size={16}/>{branch}</summary><div className="repo-ui-menu repo-ui-branch-menu">
    <input className="repo-ui-input" aria-label="Filter branches or enter full SHA" placeholder="Find a branch or full SHA…" value={filter} onChange={event => setFilter(event.target.value)}/>
    {branches?.state === "loading" && <p role="status">Loading…</p>}
    {branches?.state === "failed" && <FailureNotice failure={unavailableFailure("repository.branches", "Couldn’t load branches.", branches.error ?? "")} />}
    {shown.map(name => <a key={name} className="repo-ui-menu-item" aria-label={name} href={href(name)}><span>{name}</span>{branches?.commits?.[name] && <code>{branches.commits[name]}</code>}</a>)}
    {fullSha && <a className="repo-ui-menu-item" href={href(filter)}>{filter}</a>}
    {branches?.state === "ready" && !fullSha && shown.length === 0 && <p className="repo-ui-muted">No branches found.</p>}
  </div></details>
}
