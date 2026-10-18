import { pluralize } from "../../ui/pluralize"
import { WriteControl } from "../../frame/WriteControl"
import { useEffect, useState } from "react"
import { useMock } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { registerSlash, Loading, Failed, Empty, Denied, SignInWall, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { branches, commit, MOCK_NOW, pull, repo, run, to } from "../../fixtures"
import type { Branch } from "../../fixtures/types"
import { AgentMark, Box, PageHeader, PersonChip, RelTime, Row, StateIcon, toast } from "../../ui"
import { Cancel, HistoryDialog, HistoryIcon as Icon, LocalInstall, uptime, useHistoryCommands, viewer } from "./shared"

type BranchAct = "new" | "fork" | "rebase" | "archive" | "sandbox"
type Action = { kind: BranchAct; branch: Branch }
type Filter = "overview" | "yours" | "active" | "stale"

const branchKey = () => "repo-history-branches:" + repo.slug
export const localBranches = (): Branch[] => {
  try {
    const stored = sessionStorage.getItem(branchKey())
    return stored ? JSON.parse(stored) as Branch[] : branches
  } catch { return branches }
}
const saveBranches = (items: Branch[]) => {
  try { sessionStorage.setItem(branchKey(), JSON.stringify(items)) } catch { /* session state remains available */ }
}

const changeBranches = (items: Branch[], action: Action, name: string, from: string): Branch[] => {
  if (action.kind === "new" || action.kind === "fork") {
    const value = name.trim()
    if (!value || /\s|[~^:?*[\]\\]|(^\/|\/$|\.\.|\/\/|@\{)/.test(value) || value.endsWith(".lock")) {
      throw new Error("Use a branch name without spaces or special characters.")
    }
    if (items.some(item => item.name === value)) throw new Error("That branch already exists.")
    const source = items.find(item => item.name === from)
    if (!source) throw new Error("Source branch not found.")
    return [...items, {
      name: value, head: source.head, author: viewer(), updated: MOCK_NOW,
      ahead: source.ahead, behind: source.behind
    }]
  }
  if (action.branch.isDefault || action.branch.protected) throw new Error("This branch is protected.")
  if (action.kind === "rebase") {
    return items.map(item => item.name === action.branch.name ? { ...item, behind: 0, updated: MOCK_NOW } : item)
  }
  return items.filter(item => item.name !== action.branch.name)
}

const changedMessage = (action: Action, name: string) => action.kind === "new" || action.kind === "fork"
  ? "Created " + name.trim() + "." : action.kind === "archive" ? "Archived " + action.branch.name + "."
  : "Rebased " + action.branch.name + " on " + repo.defaultBranch + "."

export const BranchesLoading = () => <Loading rows={7} />
export const BranchesError = () => <Failed what="branches" reason="The repository host didn't return the branch list." />
export const BranchesDenied = () => <Denied act="change branches or open sandboxes" />
export const BranchesSignedOut = () => <SignInWall act="change branches or open a sandbox" />

const Divergence = ({ item }: { item: Branch }) => (
  <>
  <div className="repo-history-divergence" aria-label={item.ahead + " ahead, " + item.behind + " behind"}>
    <span title={item.behind + " behind"}><small className="repo-history-divergence-label">Behind</small>{item.behind}</span>
    <span className="repo-history-divergence-track" aria-hidden="true">
      <i style={{ width: Math.min(100, item.behind * 8) + "%" }} />
    </span>
    <span className="repo-history-divergence-divider" aria-hidden="true" />
    <span className="repo-history-divergence-track repo-history-divergence-ahead" aria-hidden="true">
      <i style={{ width: Math.min(100, item.ahead * 8) + "%" }} />
    </span>
    <span title={item.ahead + " ahead"}><small className="repo-history-divergence-label">Ahead</small>{item.ahead}</span>
  </div>
  <span className="repo-history-divergence-text">{item.behind} behind · {item.ahead} ahead</span>
  </>
)

const BranchRow = ({ item, onAct }: { item: Branch; onAct: (kind: BranchAct, branch: Branch) => void }) => {
  const { flags } = useMock()
  const reader = flags.as === "in" && flags.role !== "member"
  const linkedPull = item.pull ? pull(item.pull) : undefined
  const linkedRun = item.run ? run(item.run) : undefined
  const lastCommit = commit(item.head)
  const terminal = to("branches/" + encodeURIComponent(item.name) + "/terminal")
  return (
    <Row className="repo-history-branch-row">
      <div className="repo-history-branch-main">
        <div className="repo-history-branch-name">
          <Icon name="change" size={16} />
          <Link to={to("tree/" + encodeURIComponent(item.name))}>{item.name}</Link>
          {item.isDefault && <span className="repo-history-badge">default</span>}
          {item.protected && <span className="repo-history-protected"><Icon name="lock" size={12} />protected</span>}
        </div>
        <div className="repo-history-meta">
          <PersonChip login={item.author} compact />
          <span>{item.author} updated <RelTime date={item.updated} /></span>
          {lastCommit?.agent && <AgentMark agent={lastCommit.agent} />}
        </div>
        {(item.sandbox || linkedRun) && (
          <div className="repo-history-branch-work">
            {item.sandbox && (
              <Link to={terminal}>
                <span className={"repo-history-dot repo-history-dot-" + item.sandbox.state} />
                {item.sandbox.state === "running" ? "Sandbox · up " + uptime(item.sandbox.since) : "Sandbox · suspended "}
                {item.sandbox.state === "suspended" && <RelTime date={item.sandbox.since} />}
                {item.sandbox.ports?.length ? " · " + item.sandbox.ports.map(port => ":" + port).join(", ") : ""}
              </Link>
            )}
            {linkedRun && (
              <Link to={to("runs/" + linkedRun.id)}>
                <StateIcon state={linkedRun.state} size={14} />
                {linkedRun.id} · {linkedRun.state}
              </Link>
            )}
          </div>
        )}
      </div>
      {!item.isDefault && (
        <div className="repo-history-branch-status">
          <Divergence item={item} />
        </div>
      )}
      <div className="repo-history-branch-actions">
        {linkedPull && (
          <Link className="repo-history-pull-link" to={to("pull/" + linkedPull.n)}>
            <StateIcon state={linkedPull.state} size={16} /><span>#{linkedPull.n}</span>
          </Link>
        )}
        <WriteControl><button
          className="repo-ui-btn repo-ui-btn-quiet repo-history-sandbox-button"
          title={"Run on a sandbox · /box.open " + item.name + (reader ? " · Members only" : "")}
          disabled={reader}
          aria-describedby={reader ? "repo-history-reader-reason" : undefined}
          onClick={() => onAct("sandbox", item)}
        >
          <Icon name="terminal" size={14} />
          Run on a sandbox
        </button></WriteControl>
        <WriteControl><details className="repo-ui-dropdown repo-history-overflow" data-branch-actions={item.name}>
          <summary
            className="repo-ui-icon-btn"
            title={"/branch.actions " + item.name}
            aria-label={"Actions for " + item.name}
          >
            <Icon name="more" />
          </summary>
          <div className="repo-ui-menu">
            {([
              ["fork", "Fork branch"],
              ["rebase", "Rebase on " + repo.defaultBranch],
              ["archive", "Archive"]
            ] as const).map(([kind, label]) => {
              const protectedAct = kind !== "fork" && (item.isDefault || item.protected)
              return (
                <button
                  className="repo-ui-menu-item"
                  key={kind}
                  disabled={reader || protectedAct}
                  title={"/branch." + kind + " " + item.name + (protectedAct ? " · Protected branch" : reader ? " · Members only" : "")}
                  onClick={event => {
                    event.currentTarget.closest("details")?.removeAttribute("open")
                    onAct(kind, item)
                  }}
                >
                  {label}
                  {protectedAct && <Icon name="lock" size={12} />}
                </button>
              )
            })}
          </div>
        </details></WriteControl>
      </div>
    </Row>
  )
}

const BranchDialog = ({ action, items, onClose, onCommit }: {
  action: Action
  items: Branch[]
  onClose: () => void
  onCommit: (next: Branch[], message: string) => void
}) => {
  const { flags } = useMock()
  const [name, setName] = useState("")
  const [from, setFrom] = useState(action.branch.name)
  const [error, setError] = useState("")
  const protectedAct = (action.kind === "archive" || action.kind === "rebase")
    && Boolean(action.branch.isDefault || action.branch.protected)
  const title = action.kind === "new" ? "New branch" : action.kind === "fork" ? "Fork branch"
    : action.kind === "rebase" ? "Rebase on " + repo.defaultBranch : action.kind === "archive" ? "Archive branch" : "Run on a sandbox"
  const command = action.kind === "new" ? "/branch.new " + (name || "<name>") + " " + from
    : action.kind === "fork" ? "/branch.fork " + from + " " + (name || "<name>")
    : (action.kind === "sandbox" ? "/box.open " : "/branch." + action.kind + " ") + action.branch.name
  const save = () => {
    if (protectedAct) return
    if (action.kind === "sandbox") {
      navigate(to("branches/" + encodeURIComponent(action.branch.name) + "/terminal"))
      return
    }
    try {
      onCommit(changeBranches(items, action, name, from), changedMessage(action, name))
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn't change this branch.") }
  }
  const form = action.kind === "new" || action.kind === "fork"
  return (
    <HistoryDialog title={title} onClose={onClose}>
      {flags.as === "out" ? <BranchesSignedOut /> : flags.role !== "member" ? <BranchesDenied />
        : protectedAct ? <p>This branch is protected.</p>
        : action.kind === "sandbox" && flags.host === "hosted" && flags.hosted === "paused" ? (
          <div className="repo-history-stack">
            <p>Sandboxes are paused on smithers.sh right now.</p>
            <p className="repo-history-muted">Hosted machines are unavailable.</p>
            <LocalInstall />
          </div>
        ) : (
          <form onSubmit={event => { event.preventDefault(); save() }} className="repo-history-form">
            {form ? (
              <>
                <label htmlFor="repo-history-branch-name">Name</label>
                <input
                  id="repo-history-branch-name"
                  className="repo-ui-input"
                  value={name}
                  onChange={event => { setName(event.target.value); setError("") }}
                  placeholder={action.kind === "fork" ? action.branch.name + "-copy" : "feature/route-matching"}
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "repo-history-branch-error" : undefined}
                />
                <label htmlFor="repo-history-branch-from">From</label>
                <select
                  id="repo-history-branch-from"
                  className="repo-ui-input"
                  value={from}
                  onChange={event => setFrom(event.target.value)}
                >
                  {items.map(item => <option key={item.name}>{item.name}</option>)}
                </select>
              </>
            ) : (
              <>
                <p className="repo-history-confirm-branch">{action.branch.name}</p>
                {action.kind === "archive" && <p className="repo-history-muted">Remove this branch from the active list?</p>}
                {action.kind === "rebase" && <p className="repo-history-muted">Replay its commits on {repo.defaultBranch}?</p>}
                {action.kind === "sandbox" && <p className="repo-history-muted">Open an isolated shell for this branch?</p>}
              </>
            )}
            {error && <p className="repo-history-error" id="repo-history-branch-error" role="alert">{error}</p>}
            <div className="repo-ui-actions">
              <button
                className="repo-ui-btn repo-ui-btn-primary"
                title={command}
              >
                {form ? "Create branch" : action.kind === "archive" ? "Archive" : action.kind === "rebase" ? "Rebase" : "Open sandbox"}
              </button>
              <Cancel onClick={onClose} />
            </div>
          </form>
        )}
      {(flags.as === "out" || flags.role !== "member" || protectedAct
        || action.kind === "sandbox" && flags.host === "hosted" && flags.hosted === "paused") && (
        <Cancel onClick={onClose} />
      )}
    </HistoryDialog>
  )
}

export const BranchesReady = ({ empty = false }: { empty?: boolean }) => {
  const { flags } = useMock()
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const initialFilter = query.get("tab")
  const [filter, setFilter] = useState<Filter>(
    initialFilter === "yours" || initialFilter === "active" || initialFilter === "stale" ? initialFilter : "overview"
  )
  const [items, setItems] = useState(() => empty ? branches.filter(item => item.isDefault) : localBranches())
  const defaultBranch = items.find(item => item.isDefault) ?? branches[0]
  const [action, setAction] = useState<Action | null>(() => {
    const kind = query.get("dialog")
    const target = items.find(item => item.name === query.get("branch")) ?? defaultBranch
    return ["new", "fork", "rebase", "archive", "sandbox"].includes(kind ?? "") && target
      ? { kind: kind as BranchAct, branch: target } : null
  })
  const reader = flags.as === "in" && flags.role !== "member"
  const isStale = (item: Branch) => Date.parse(MOCK_NOW) - Date.parse(item.updated) >= 30 * 86400000
  const visible = items.filter(item => !item.isDefault && (filter === "overview"
    || filter === "yours" && item.author === viewer()
    || filter === "active" && !isStale(item)
    || filter === "stale" && isStale(item)))
  const act = (kind: BranchAct, branch: Branch) => setAction({ kind, branch })
  const commitChange = (next: Branch[], message: string) => {
    setItems(next)
    saveBranches(next)
    toast(message)
  }
  useEffect(() => {
    const find = (name: string) => {
      const item = items.find(value => value.name === name)
      if (!item) throw new Error("Branch not found.")
      return item
    }
    const branchField = { name: "branch", label: "Branch", options: items.map(item => item.name) }
    const dispose = [
      registerSlash("branch.new", {
        purpose: "Create a branch", confirm: "Create this branch?",
        fields: [{ name: "name", label: "Name" }, { name: "from", label: "From", options: items.map(item => item.name) }],
        run: ({ name, from }) => {
          const request: Action = { kind: "new", branch: find(from) }
          commitChange(changeBranches(items, request, name, from), changedMessage(request, name))
        }
      }),
      ...(["fork", "rebase", "archive"] as const).map(kind => registerSlash("branch." + kind, {
        purpose: kind === "fork" ? "Fork branch" : kind === "rebase" ? "Rebase on " + repo.defaultBranch : "Archive branch",
        fields: kind === "fork" ? [branchField, { name: "name", label: "New branch name" }] : [branchField],
        run: ({ branch: name, name: created }) => {
          const request: Action = { kind, branch: find(name) }
          commitChange(changeBranches(items, request, created ?? "", name), changedMessage(request, created ?? ""))
        }
      })),
      registerSlash("box.open", {
        purpose: "Run on a sandbox", fields: [branchField], confirm: false,
        run: ({ branch: name }, { closeAsk }) => { closeAsk(); act("sandbox", find(name)) }
      }),
      registerSlash("branch.list", {
        purpose: "Filter branches", access: "public", confirm: false,
        fields: [{ name: "filter", label: "Filter", options: ["overview", "yours", "active", "stale"] }],
        run: ({ filter: value }) => setFilter(value as Filter)
      }),
      registerSlash("branch.actions", {
        purpose: "Open branch actions", access: "public", confirm: false, fields: [branchField],
        run: ({ branch: name }, { closeAsk }) => {
          closeAsk()
          const target = [...document.querySelectorAll<HTMLDetailsElement>("details[data-branch-actions]")]
            .find(element => element.dataset.branchActions === name)
          if (target) { target.open = true; target.scrollIntoView({ block: "nearest" }); target.querySelector("summary")?.focus() }
        }
      })
    ]
    return () => dispose.forEach(cleanup => cleanup())
  }, [items])
  return (
    <div className="repo-history-stack repo-history-branches">
      <PageHeader
        title="Branches"
        actions={(
          <WriteControl primary><button
            className="repo-ui-btn"
            title={"/branch.new" + (reader ? " · Members only" : "")}
            disabled={reader || !defaultBranch}
            aria-describedby={reader ? "repo-history-reader-reason" : undefined}
            onClick={() => act("new", defaultBranch)}
          >
            New branch
          </button></WriteControl>
        )}
      />
      {reader && <p className="repo-history-muted" id="repo-history-reader-reason">Members can change branches and open sandboxes.</p>}
      <div className="repo-history-filters" aria-label="Branch filters">
        {(["overview", "yours", "active", "stale"] as const).map(value => (
          <button
            key={value}
            className="repo-ui-btn repo-history-chip"
            aria-pressed={filter === value}
            title={"/branch.list " + value}
            onClick={() => setFilter(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
        <span className="repo-history-spacer" />
        <span className="repo-history-muted repo-history-count">{items.length} {pluralize(items.length, "branch", "branches")}</span>
      </div>
      {defaultBranch && (
        <Box className="repo-history-branch-list" header="Default branch">
          <BranchRow item={defaultBranch} onAct={act} />
        </Box>
      )}
      {filter === "yours" && flags.as === "out" ? <SignInWall act="see your branches" /> : visible.length > 0 ? (
        <Box className="repo-history-branch-list" header={(
          <div className="repo-history-branch-list-heading">
            <span>{filter === "overview" ? "All branches" : filter[0].toUpperCase() + filter.slice(1)}</span>
            <span>Behind / Ahead</span>
          </div>
        )}>
          {visible.map(item => <BranchRow key={item.name} item={item} onAct={act} />)}
        </Box>
      ) : <Empty title={empty ? "Only the default branch." : "No " + (filter === "yours" ? "branches of yours" : filter + " branches") + "."} />}
      {action && flags.as === "in" && (
        <BranchDialog
          key={action.kind + action.branch.name}
          action={action}
          items={items}
          onClose={() => setAction(null)}
          onCommit={commitChange}
        />
      )}
    </div>
  )
}

export const BranchesEmpty = () => <BranchesReady empty />

export const BranchesPage = () => {
  useHistoryCommands()
  const state = useView("branches:" + repo.slug)
  return (
    <RepoFrame tab="code" title={"Branches · " + repo.slug} askView="branches" askContext={repo.slug + " branches"}>
      <div className="repo-history-page">
        {state === "loading" ? <BranchesLoading /> : state === "error" ? <BranchesError />
          : state === "empty" ? <BranchesEmpty key={repo.slug + ":empty"} />
          : <BranchesReady key={repo.slug} />}
      </div>
    </RepoFrame>
  )
}
