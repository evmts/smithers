import { useRef, useState, useSyncExternalStore } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import { ChevronDown } from "lucide-react"
import type { BranchTreeNodeCard } from "@smthrs/rpc/BranchTreeNodeCard"
import { useController } from "./ControllerContext"
import { BranchCrumbs } from "./BranchTree"
import { flowArgs } from "./flows/FlowArgs"
import type { FlowName } from "./flows/FlowName"
import { accountOwnerOf } from "./state/AccountOwner"
import { headerSelectionOf } from "./state/HeaderSelection"
import { branchTree } from "./state/seams/BranchNavigationSeam"
import { pickKey } from "./state/seams/RepositoryBranchesSeam"

/** One row: its visible name and the argument line its flow parses. */
interface HeaderOption { readonly id: string; readonly args: string }

const byName = (left: string, right: string): number => left.localeCompare(right)

const holds = (nodes: ReadonlyArray<BranchTreeNodeCard>, id: string): boolean => nodes.some(node => node.id === id || holds(node.children, id))

/** One header selector: a button naming the selection and the list of real rows it opens. */
function HeaderSelect({ label, list, flow, value, options, busy, failure, onOpen }: {
  readonly label: string
  readonly list: string
  readonly flow: FlowName
  readonly value: string | null
  readonly options: ReadonlyArray<HeaderOption>
  readonly busy?: boolean
  readonly failure?: string
  readonly onOpen?: () => void
}) {
  const controller = useController()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const rows = useRef<HTMLButtonElement[]>([])
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <div className="crumbs" data-header-select={flow} onKeyDown={event => {
    if (!open) return
    if (event.key === "Escape") { close(); event.stopPropagation(); return }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const count = rows.current.length
    if (count === 0) return
    const index = rows.current.indexOf(event.target as HTMLButtonElement)
    rows.current[event.key === "ArrowDown" ? (index + 1) % count : (index <= 0 ? count : index) - 1]?.focus()
    event.preventDefault()
  }}>
    <button type="button" className="crumb crumb-here" ref={trigger} aria-haspopup="true" aria-expanded={open} aria-label={value === null ? label : `${label} ${value}`}
      onClick={() => { if (!open) onOpen?.(); setOpen(!open) }}>{value ?? label}<ChevronDown size={12} aria-hidden="true" />
    </button>
    {open ? <>
      <div className="crumb-backdrop" onClick={() => setOpen(false)} />
      <nav className="tree" aria-label={list} aria-busy={busy === true} ref={element => { rows.current = element ? Array.from(element.querySelectorAll<HTMLButtonElement>("button")) : [] }}>
        <ol>{options.map(option => <li key={option.id}>
          <button type="button" className="tree-row" data-flow={flow} data-option={option.id} aria-current={option.id === value ? "true" : undefined} onClick={() => { controller.runCommand(flow, option.args); close() }}>
            <span className="tree-name">{option.id}</span>
          </button>
        </li>)}
        </ol>
        {failure === undefined ? null : <span className="mvp-disabled-reason" role="alert">{failure}</span>}
      </nav>
    </> : null}
  </div>
}

/**
 * The header's repository and branch, read from real state: the session's
 * selection, the repositories this account reaches, the branches the
 * repository holds and the one picked in it. `repo.select` and `branch` are
 * the only writers, run through the registry, so a slash, the agent and these
 * buttons share a door. Off an install the pick names a repository branch
 * only; the conversation's branch is never changed by it.
 */
export function HeaderSelectors() {
  const controller = useController()
  const { data: sessions } = useLiveQuery(controller.store.collections.sessions)
  const { data: repositories } = useLiveQuery(controller.store.collections.repositories)
  const { data: identities } = useLiveQuery(controller.store.collections.identitySessions)
  const { data: branchRows } = useLiveQuery(controller.repositoryBranches.rows)
  const { data: picks } = useLiveQuery(controller.repositoryBranches.picks)
  const installed = useSyncExternalStore(controller.installSnapshots.subscribe, controller.installSnapshots.get, controller.installSnapshots.get).model?.repository
  const install = controller.bootstrap?.capabilities.includes("install") === true
  const session = sessions[0]
  const owner = accountOwnerOf(identities[0]) ?? null

  if (install) {
    // An install wraps one repository (mvp.md M-28): there is nothing to choose between.
    const { repository, branch } = headerSelectionOf({ session, repositories, owner, installRepository: installed ? `${installed.owner}/${installed.name}` : null })
    if (repository === null || branch === null) return null
    const listed = session?.branchNavigation?.owner === owner ? session.branchNavigation.nodes : []
    const tree = listed.length > 0 ? listed : branchTree([])
    const nodes: BranchTreeNodeCard[] = holds(tree, branch) ? tree
      : [...tree, { id: branch, name: branch, kind: "scratch", present: [], children: [], action: { tag: "branch", label: "Open", args: { name: branch } } }]
    return <div className="crumbs-host">
      <span className="crumb-repo">{repository}</span><span aria-hidden="true">/</span>
      <BranchCrumbs nodes={nodes} view={{ selected_branch: branch }} onAction={(tag, input) => { void controller.commands.submit({ name: tag, payload: input ?? {}, actor: "user" }) }} onView={() => {}} />
    </div>
  }

  const pickOf = (repo: string) => picks.find(row => row.id === pickKey(owner, repo))?.branch
  const selected = headerSelectionOf({ session, repositories, owner, pickOf })
  const loaded = selected.repository === null ? undefined : branchRows.find(row => row.id === selected.repository)
  // A pick the repository no longer holds gives way to its default.
  const { repository, branch } = loaded?.state === "ready" ? headerSelectionOf({ session, repositories, owner, pickOf, branches: loaded.names }) : selected
  const repositoryIds = [...new Set([...repositories.map(row => row.id), ...(repository === null ? [] : [repository])])].sort(byName)
  if (repositoryIds.length === 0) return null
  const fallback = repository === null ? undefined : repositories.find(row => row.id === repository)?.head?.bookmark
  const names = [...new Set([...(branch === null ? [] : [branch]), ...(loaded?.names ?? [])])]
    .sort((left, right) => Number(right === fallback) - Number(left === fallback) || byName(left, right))
  return <div className="crumbs-host">
    <HeaderSelect label="Repository" list="Repositories" flow="repo.select" value={repository}
      options={repositoryIds.map(id => ({ id, args: id }))} />
    {repository === null ? null : <>
      <span aria-hidden="true">/</span>
      <HeaderSelect label="Branch" list="Branches" flow="branch" value={branch} busy={loaded?.state === "loading"}
        {...(loaded?.state === "failed" && loaded.error !== undefined ? { failure: loaded.error } : {})}
        options={names.map(name => ({ id: name, args: flowArgs("branch", { name }) }))}
        onOpen={() => { void controller.repositoryBranches.load(repository) }} />
    </>}
  </div>
}
