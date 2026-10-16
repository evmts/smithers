import type { Collection, NonSingleResult } from "@tanstack/db"
import type { Branch } from "./state/AppState"
import type { AppController } from "./state/AppController"
import { useLiveQuery } from "@tanstack/react-db"
import { Markdown } from "@smthrs/ui"
import { useController } from "./ControllerContext"
import { BranchTree } from "./BranchTree"
import { EarlierArchive } from "./EarlierArchive"
import { accountOwnerOf } from "./state/AccountOwner"
import { headerSelectionOf } from "./state/HeaderSelection"
import { pickKey } from "./state/seams/RepositoryBranchesSeam"
import { hostedBranchNodes, sessionBranchIndex } from "./state/seams/BranchNavigationSeam"

/** The shell's projections read saved state; an archive has no command callbacks. */
export function BranchNavigation({ saving, onView }: {
  readonly saving: boolean
  readonly onView: (patch: Parameters<AppController["setBranchNavigationView"]>[0]) => void
}) {
  const controller = useController()
  const { data: sessions } = useLiveQuery(controller.store.collections.sessions)
  const { data: identities } = useLiveQuery(controller.store.collections.identitySessions)
  const { data: repositories } = useLiveQuery(controller.store.collections.repositories)
  const { data: picks } = useLiveQuery(controller.repositoryBranches.picks)
  const { data: branchRows } = useLiveQuery(controller.repositoryBranches.rows)
  const { data: branches } = useLiveQuery<Branch, string, Record<string, never>>(controller.store.collections.branches as unknown as Collection<Branch, string, Record<string, never>> & NonSingleResult)
  const view = sessions[0]?.branchNavigation
  const owner = accountOwnerOf(identities[0]) ?? null
  if (!view?.open || view.owner !== owner) return null
  /*
   * Which row reads as current. An install has one conversation per branch, so
   * that IS the conversation's branch. A hosted account has one conversation
   * and the rows are a repository's branches, so the current row is the branch
   * picked in that repository — the same rule the header reads
   * (HeaderSelection.ts), never a write onto the conversation's branch.
   */
  const install = controller.bootstrap?.capabilities.includes("install") === true
  const selection = headerSelectionOf({ session: sessions[0], repositories, owner,
    pickOf: repo => picks.find(row => row.id === pickKey(owner, repo))?.branch })
  const picked = install || view.selected_branch === "earlier" ? null : selection.branch
  const current = picked ?? view.selected_branch
  /*
   * Off a session-held index the rows ARE the selected repository's branches,
   * so they are read from the repository's own row in the canonical read model
   * rather than from the session. `branchNavigation.nodes` names no
   * repository: a tree retained there paints under whatever header comes next,
   * including after a reload that restored a different repository (#4028
   * follow-up). Which of the two it is, is the seam's own rule
   * (`sessionBranchIndex`), because the seam decides where it writes.
   */
  const nodes = sessionBranchIndex({ install, designEnabled: controller.design.enabled }) ? view.nodes : hostedBranchNodes(
    selection.repository,
    repo => branchRows.find(row => row.id === repo)?.names,
    repo => repositories.find(row => row.id === repo)?.head?.bookmark ?? null
  )
  const available = branches.filter(branch => (!branch.archiveOwner || branch.archiveOwner === owner) && branch.snapshot && branch.snapshot.messages.length + branch.snapshot.cards.length > 0)
  const journalIds = new Set(available.filter(branch => branch.archiveOwner === owner && branch.id.startsWith("earlier:journal:")).map(branch => branch.id.slice("earlier:journal:".length)))
  const archives = available.filter(branch => !journalIds.has(branch.id))
    .map(branch => ({ id: branch.id, title: branch.title, entries: [
      ...branch.snapshot!.messages.map(message => ({ id: message.id, ordinal: message.ordinal, content: <Markdown key={message.id} content={message.text} /> })),
      ...branch.snapshot!.cards.map(card => ({ id: card.id, ordinal: card.ordinal, content: <article key={card.id} data-archive-card={card.kind}><strong>{card.title}</strong></article> }))
    ].sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id)).map(entry => entry.content) }))
  const earlier = { id: "earlier", name: "Earlier", kind: "earlier" as const, archive_count: archives.length, present: [], children: [] }
  return <div data-branch-navigation aria-busy={saving}>
    <BranchTree nodes={[...nodes, earlier]} view={{ ...view, selected_branch: current }}
      onAction={(tag, args) => { void controller.commands.submit({ name: tag, payload: args ?? {}, actor: "user" }) }}
      onView={patch => onView({ ...patch, ...(patch.selected_branch === "earlier" ? { previous_branch: view.selected_branch } : {}) })} />
    {view.selected_branch === "earlier" ? <EarlierArchive model={{ node: earlier, archives, read_only: true }} view={view} onView={onView} /> : null}
  </div>
}
