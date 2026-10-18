import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, navigate, useLocation } from "../../../core/router"
import { branch, children, commit, history, repo, shortSha, tags, to, tree } from "../../fixtures"
import { registerSlash } from "../../frame/slash"
import type { Commit } from "../../fixtures/types"
import { AgentMark, BranchPicker, Icon, PersonChip, RelTime, toast } from "../../ui"

export const sourceRoute = (kind: "tree" | "blob" | "blame", ref: string, path = "") =>
  to(`${kind}/${encodeURIComponent(ref)}${path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : ""}`)

export const parentPath = (path: string) => path.split("/").slice(0, -1).join("/")
export const linesOf = (content: string) => content ? content.replace(/\n$/, "").split("\n") : []
export const byteSize = (content: string) => {
  const size = new TextEncoder().encode(content).length
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`
}

export const copyText = async (value: string, message = "Copied") => {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value)
    else {
      const field = document.createElement("textarea")
      field.value = value
      field.style.position = "fixed"
      field.style.opacity = "0"
      document.body.append(field)
      field.select()
      const copied = document.execCommand("copy")
      field.remove()
      if (!copied) throw new Error("Clipboard unavailable")
    }
    toast(message)
  } catch {
    toast("Couldn't copy. Check clipboard access and try again.")
  }
}

export const Breadcrumbs = ({ path, revision }: { path: string; revision: string }) => {
  const parts = path.split("/").filter(Boolean)
  return (
    <nav className="repo-code-breadcrumbs" aria-label="File path">
      <Link to={sourceRoute("tree", revision)}>{repo.name}</Link>
      {parts.map((part, index) => (
        <span key={`${index}-${part}`}>
          <span className="repo-code-separator" aria-hidden="true">/</span>
          {index < parts.length - 1 ? (
            <Link to={sourceRoute("tree", revision, parts.slice(0, index + 1).join("/"))}>{part}</Link>
          ) : <strong>{part}</strong>}
        </span>
      ))}
    </nav>
  )
}

const TreePermalink = ({ path, revision }: { path: string; revision: string }) => {
  const sha = branch(revision)?.head ?? tags.find(tag => tag.name === revision)?.sha ?? history(revision)[0]?.sha ?? revision
  const copy = () => copyText(`https://${sourceRoute("tree", sha, path)}`, "Permalink copied")
  useEffect(() => registerSlash("file.permalink", {
    purpose: "Copy permalink", fields: [], access: "public", confirm: false, run: copy
  }), [path, revision, sha])
  return <button className="repo-ui-btn repo-ui-btn-primary repo-code-permalink" title="/file.permalink" aria-label="Copy permalink" onClick={() => void copy()}>
    <Icon name="link" size={14} /><span>Copy permalink</span>
  </button>
}

const PathAction = (props: { path: string; revision: string }) => {
  const location = useLocation()
  return location.split("?")[0].includes("/tree/") ? <TreePermalink {...props} /> : null
}

export const PathHeader = ({ path, revision, children: actions }: {
  path: string
  revision: string
  children?: ReactNode
}) => (
  <div className="repo-code-path-header">
    <BranchPicker currentRef={revision} />
    <Breadcrumbs path={path} revision={revision} />
    <FileFinder revision={revision} />
    {actions ?? <PathAction path={path} revision={revision} />}
  </div>
)

export const latestCommitFor = (revision: string, path: string) => history(revision, path || undefined)[0] ?? history(revision)[0]

export const LatestCommit = ({ entry, revision, path }: { entry?: Commit; revision: string; path: string }) => {
  const latest = entry ?? latestCommitFor(revision, path)
  if (!latest) return null
  return (
    <div className="repo-code-latest">
      <PersonChip login={latest.author} />
      <Link className="repo-code-latest-title" to={to(`commit/${latest.sha}`)}>{latest.title}</Link>
      {latest.agent && <AgentMark agent={latest.agent} />}
      <Link className="repo-code-sha" to={to(`commit/${latest.sha}`)}>{shortSha(latest.sha)}</Link>
      <RelTime date={latest.date} />
    </div>
  )
}

const FileTreeItems = ({ dir, path, revision }: { dir: string; path: string; revision: string }) => (
  <ul className="repo-code-tree-items">
    {children(dir).map(entry => {
      const name = entry.path.split("/").at(-1)
      const active = path === entry.path
      const expanded = path.startsWith(`${entry.path}/`) || active
      return (
        <li key={entry.path}>
          {entry.kind === "dir" ? (
            <details open={expanded || undefined}>
              <summary title={`/files.toggle ${entry.path}`}>
                <Icon name="folder" size={15} />
                <Link
                  to={sourceRoute("tree", revision, entry.path)}
                  title={name}
                  aria-current={active ? "page" : undefined}
                >
                  {name}
                </Link>
              </summary>
              <FileTreeItems dir={entry.path} path={path} revision={revision} />
            </details>
          ) : (
            <Link
              className="repo-code-tree-file"
              title={name}
              to={sourceRoute("blob", revision, entry.path)}
              aria-current={active ? "page" : undefined}
            >
              <Icon name="file" size={15} />
              <span>{name}</span>
            </Link>
          )}
        </li>
      )
    })}
  </ul>
)

export const FileTree = ({ path, revision }: { path: string; revision: string }) => {
  const [open, setOpen] = useState(true)
  return (
    <aside className="repo-code-sidebar" data-collapsed={!open || undefined} aria-label="Files">
      <button
        className="repo-code-sidebar-toggle"
        title="/files.toggle"
        aria-expanded={open}
        aria-controls="repo-code-file-tree"
        onClick={() => setOpen(!open)}
      >
        <Icon name="folder" size={16} />
        <span>Files</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <nav
          id="repo-code-file-tree"
          aria-label="File tree"
          onKeyDown={event => {
            const target = event.target as HTMLElement
            if (!["ArrowDown", "ArrowUp", "Home", "End", "ArrowLeft", "ArrowRight"].includes(event.key)) return
            const all = [...event.currentTarget.querySelectorAll<HTMLElement>("a, summary")]
              .filter(item => item.getClientRects().length > 0)
            const index = all.indexOf(target)
            if (index < 0) return
            event.preventDefault()
            if (event.key === "ArrowDown") all[Math.min(index + 1, all.length - 1)]?.focus()
            if (event.key === "ArrowUp") all[Math.max(0, index - 1)]?.focus()
            if (event.key === "Home") all[0]?.focus()
            if (event.key === "End") all.at(-1)?.focus()
            if (event.key === "ArrowRight") {
              const details = target.closest("details")
              if (details) details.open = true
            }
            if (event.key === "ArrowLeft") {
              const details = target.closest("details")
              if (details?.open) details.open = false
              else details?.parentElement?.closest("details")?.querySelector("summary")?.focus()
            }
          }}
        >
          <FileTreeItems dir="" path={path} revision={revision} />
        </nav>
      )}
    </aside>
  )
}

export const FormCard = ({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: ReactNode
}) => {
  const card = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = card.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={card}
      className="repo-code-dialog"
      aria-labelledby="repo-code-dialog-title"
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="repo-code-dialog-body">
        <div className="repo-code-dialog-heading">
          <h2 id="repo-code-dialog-title">{title}</h2>
          <button className="repo-ui-icon-btn" title="/cancel" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

export const entryCommit = (revision: string, path: string, sha: string) =>
  history(revision, path)[0] ?? commit(sha)

export const FileFinder = ({ revision }: { revision: string }) => {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const location = useLocation()
  const route = (path: string) => `${sourceRoute("blob", revision, path)}${location.includes("?") ? `?${location.split("?")[1]}` : ""}`
  useEffect(() => registerSlash("file.find", {
    purpose: "Go to file", fields: [{ name: "path", label: "File path", required: false }], access: "public", confirm: false,
    run: ({ path }, { closeAsk }) => {
      closeAsk()
      if (path) {
        if (!tree.some(item => item.kind === "file" && item.path === path)) throw new Error(`File ${path} wasn't found.`)
        navigate(route(path))
      } else setOpen(true)
    }
  }), [revision, location])
  return <>
    <button className="repo-ui-btn" title="/file.find" onClick={() => setOpen(true)}>Go to file</button>
    {open && <FormCard title="Go to file" onClose={() => setOpen(false)}>
      <label htmlFor="repo-code-find">File path</label>
      <input autoFocus id="repo-code-find" className="repo-ui-input" value={filter} onChange={event => setFilter(event.target.value)} />
      <div className="repo-code-finder-results">{tree.filter(item => item.kind === "file" && item.path.toLowerCase().includes(filter.toLowerCase())).map(item =>
        <Link key={item.path} to={route(item.path)} onClick={() => setOpen(false)}>{item.path}</Link>)}
      {!tree.some(item => item.kind === "file" && item.path.toLowerCase().includes(filter.toLowerCase())) && <p>No files found.</p>}</div>
    </FormCard>}
  </>
}
