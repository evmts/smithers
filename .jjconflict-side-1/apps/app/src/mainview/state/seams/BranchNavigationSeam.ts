import { Data } from "effect"
import { ActorSchema } from "@smthrs/rpc/CardPrimitives"
import type { LiveTopics } from "../useTopic"
import { z } from "zod"
import type { BranchTreeNodeCard } from "@smthrs/rpc/BranchTreeNodeCard"
import { accountOwnerOf } from "../AccountOwner"
import { captureCloudOwner, type SeamContext } from "./SeamContext"
import { designBranchTree } from "./DesignWorld/shell"
import type { DesignWorld } from "./DesignWorld"

/**
 * Which read ended, and why. The pair is the whole diagnostic: it names the
 * door without carrying a URL, a header, a credential or the host's own error
 * prose, so the operational ring can tell "this host serves no branch list"
 * apart from "the host refused this account's read" without logging either.
 */
export type BranchNavigationStage = "tree" | "install-read" | "repository-read"
export type BranchNavigationReason =
  | "repeated-branch"
  | "cyclic-tree"
  | "route-absent"
  | "host-refused"
  | "no-repository"

export class BranchNavigationFailure extends Data.TaggedError("BranchNavigationFailure")<{
  readonly sentence: "Repeated branch" | "Cyclic branch tree" | "Branches unavailable" | "No repository chosen"
  readonly stage: BranchNavigationStage
  readonly reason: BranchNavigationReason
}> {
  override get message() { return this.sentence }
}

/** The one diagnostic line both reads file, with no URL, header, credential or host prose in it. */
export const branchNavigationDiagnostic = (failure: BranchNavigationFailure, rows: number): string =>
  `branches.list stage=${failure.stage} reason=${failure.reason} rows=${rows}`

const Rows = z.array(z.object({ name: z.string().min(1), kind: z.string(), state: z.string(),
  forked_from: z.object({ ref: z.string() }).nullish(), machine: z.object({ id: z.string() }) }))

/** Read only advertised open branches; nesting follows the server's fork source. */
export function branchTree(value: unknown): BranchTreeNodeCard[] {
  const rows = Rows.parse(value).filter(row => row.state !== "closed")
  const nodes = new Map<string, BranchTreeNodeCard>()
  nodes.set("main", { id: "main", name: "main", kind: "main", present: [], children: [], action: { tag: "branch", label: "Open", args: { name: "main" } } })
  for (const row of rows) {
    if (row.name === "main") continue
    if (nodes.has(row.name)) throw new BranchNavigationFailure({ sentence: "Repeated branch", stage: "tree", reason: "repeated-branch" })
    nodes.set(row.name, { id: row.name, name: row.name, kind: row.kind === "item" ? "item" : "scratch", present: [], children: [], action: { tag: "branch", label: "Open", args: { name: row.name } } })
  }
  for (const row of rows) {
    if (row.name === "main") continue
    const seen = new Set([row.name])
    let parent = row.forked_from?.ref
    while (parent && parent !== "main") {
      if (seen.has(parent)) throw new BranchNavigationFailure({ sentence: "Cyclic branch tree", stage: "tree", reason: "cyclic-tree" })
      seen.add(parent)
      parent = rows.find(candidate => candidate.name === parent)?.forked_from?.ref
    }
    const target = nodes.get(row.forked_from?.ref ?? "main") ?? nodes.get("main")!
    target.children.push(nodes.get(row.name)!)
  }
  return [nodes.get("main")!]
}

/**
 * A hosted account's branch source: the connected repository the header
 * names, its branch names through the one canonical resolver the header
 * dropdown, `/branch` and the agent already share (RepositoryBranchesSeam
 * over GET /api/repos/{owner}/{repo}/bookmarks), and that repository's own
 * current bookmark. Reading it enumerates nothing else: no workspace is
 * created or resumed to list or to select, and a repository the account
 * cannot read has no rows at all because the backend scopes the read.
 */
export interface HostedBranchSource {
  /** The connected repository as `owner/name`, or null when none is chosen. */
  readonly repository: () => string | null
  /**
   * Read that repository's branches into the canonical read model
   * (RepositoryBranchesSeam.rows), answering the honest sentence the read
   * earned. The rows ARE the hosted page's tree ({@link hostedBranchNodes}),
   * so this read ensures them and retains nothing of its own: an answer about
   * one repository can never be painted under another repository's header.
   */
  readonly load: (repo: string) => Promise<{ readonly names: ReadonlyArray<string> } | { readonly error: string }>
}

/**
 * One hosted repository's branches as tree nodes. A hosted bookmark carries
 * no fork lineage, so the rows stay siblings rather than inventing a parent,
 * and the trunk is the repository's OWN current bookmark — never a hardcoded
 * `main`. A repository whose default is unknown gets no trunk node, not a
 * guessed one.
 */
export function hostedBranchTree(names: ReadonlyArray<string>, defaultBranch: string | null): BranchTreeNodeCard[] {
  const unique = [...new Set(names.filter(name => name !== ""))]
  const trunk = defaultBranch !== null && defaultBranch !== "" && unique.includes(defaultBranch) ? defaultBranch : null
  return unique
    .sort((left, right) => Number(right === trunk) - Number(left === trunk) || left.localeCompare(right))
    .map(name => ({
      id: name, name, kind: name === trunk ? "main" : "scratch", present: [], children: [],
      action: { tag: "branch", label: "Open", args: { name } }
    }))
}

/**
 * The rows a hosted `/branches` paints: the CURRENT repository's branches as
 * the canonical read model holds them (RepositoryBranchesSeam.rows), by the
 * one rule the page and the header share.
 *
 * The session's `branchNavigation.nodes` carries no repository, so a hosted
 * tree is never read back out of it — not while another repository's read is
 * still in flight, and not after a reload that restored a tree one repository
 * left behind beside a header that now names a different one. A repository
 * with no row has no branches to paint, because nothing read it yet.
 */
export const hostedBranchNodes = (
  repository: string | null,
  names: (repo: string) => ReadonlyArray<string> | undefined,
  defaultBranch: (repo: string) => string | null
): BranchTreeNodeCard[] =>
  repository === null ? [] : hostedBranchTree(names(repository) ?? [], defaultBranch(repository))

/**
 * Whether the branch tree is the SESSION-held index rather than the connected
 * repository's bookmarks.
 *
 * Two readers act on this, and they have to act on the same answer: the seam,
 * which decides which read to run and where to put its answer, and
 * `BranchNavigation`, which decides which of the two to paint. The install's
 * own `/api/branches` projection is session-held, and so is the seeded design
 * world's stand-in for it, which is what the seam falls back to when that
 * route is unavailable.
 *
 * They disagreed, and the seeded design world on a hosted account was the
 * gap: the seam had no hosted source there, so it wrote the design tree to
 * the session, while the view read the repository's rows — which no hosted
 * read had filled, because none was made. The tree came out empty and only
 * `Earlier` was left (#4028 follow-up). Off the design fixture this is the
 * install capability and nothing else, exactly as before.
 */
export const sessionBranchIndex = (input: {
  /** The host serves its own branch index (`install` in the bootstrap's capabilities). */
  readonly install: boolean
  /** The seeded design world is standing in for that index (DesignWorld.enabled). */
  readonly designEnabled: boolean
}): boolean => input.install || input.designEnabled

export function createBranchNavigationSeam(ctx: SeamContext, design: DesignWorld, options?: { live?: LiveTopics; onDispose?: (dispose: () => void) => void; hosted?: HostedBranchSource }) {
  /*
   * The read question: WHICH account generation asked, and WHICH repository
   * it asked about. One pending promise for every question dropped the later
   * question unread while the earlier one hung, and a fence on the account
   * login alone could not tell an account that changed away and back from the
   * one that asked.
   */
  /** The question a read is in flight for; another question's read is its own. */
  let reading: string | undefined
  /** The latest question this page asked: an answer to any other one is stale. */
  let asked: string | undefined
  const watches = new Map<string, () => void>()
  const stop = () => { for (const unsubscribe of watches.values()) unsubscribe(); watches.clear() }
  const identity = options?.onDispose ? ctx.store.collections.identitySessions.subscribeChanges(() => {
    const view = ctx.store.session().branchNavigation
    if (view && view.owner !== (accountOwnerOf(ctx.store.collections.identitySessions.get("identity")) ?? null)) stop()
  }) : undefined
  options?.onDispose?.(() => { stop(); identity?.unsubscribe() })
  const Presence = z.object({ presence: z.array(z.object({ actor: ActorSchema })) })
  const observe = (rows: unknown[], owner: string | null) => {
    stop()
    for (const row of Rows.parse(rows)) {
      const topic = `branch:${row.machine.id}`
      const update = () => {
        const view = ctx.store.session().branchNavigation
        if (ctx.isDisposed?.() || view?.owner !== owner || (accountOwnerOf(ctx.store.collections.identitySessions.get("identity")) ?? null) !== owner) return
        const snapshot = options?.live?.getSnapshot(topic)
        const parsed = !snapshot?.error ? Presence.safeParse(snapshot?.data) : undefined
        const present = parsed?.success ? parsed.data.presence.map(entry => entry.actor)
          .sort((a, b) => Number(a.kind !== "person") - Number(b.kind !== "person")) : []
        const patch = (nodes: BranchTreeNodeCard[]): BranchTreeNodeCard[] => nodes.map(node => ({ ...node,
          ...(node.id === row.name ? { present } : {}), children: patch(node.children) }))
        void ctx.dispatch({ type: "branch.navigation.changed", actor: "system", navigation: { ...view, nodes: patch(view.nodes) } }).isPersisted.promise
      }
      if (options?.live) { watches.set(topic, options.live.subscribe(topic, update)); update() }
    }
  }
  return {
    listBookmarks: async () => {
      const owner = accountOwnerOf(ctx.store.collections.identitySessions.get("identity")) ?? null
      const hosted = options?.hosted
      const repo = hosted?.repository() ?? null
      const question = `${owner ?? ""}\n${repo ?? ""}`
      // The canonical account/provider fence: a refresh by the same owner stays current, a sign-out and back does not.
      const generation = captureCloudOwner(ctx, false)
      const previous = ctx.store.session().branchNavigation
      await ctx.dispatch({ type: "branch.navigation.changed", actor: ctx.actor(), navigation: {
        owner, open: true, selected_branch: previous?.owner === owner ? previous.selected_branch : "main",
        // A hosted tree is derived from the repository's own rows, never retained here: this field carries no repository.
        nodes: hosted !== undefined || previous?.owner !== owner ? [] : previous.nodes
      } }).isPersisted.promise
      // Only the SAME question is already being read; another repository's is its own.
      if (reading === question) return
      asked = question
      const current = () => !ctx.isDisposed?.() && generation() && asked === question
        && (accountOwnerOf(ctx.store.collections.identitySessions.get("identity")) ?? null) === owner
      const show = async (nodes: BranchTreeNodeCard[]) => {
        const view = ctx.store.session().branchNavigation
        if (view?.owner !== owner) return false
        await ctx.dispatch({ type: "branch.navigation.changed", actor: "system", navigation: { ...view, nodes } }).isPersisted.promise
        return true
      }
      /*
       * A hosted account reads the connected repository's branches, because
       * the hosted backend serves no install-global /api/branches and never
       * did: that route is the install's workspace projection. Nothing is
       * invented for a refusal here — the sentence the canonical resolver
       * earned is what the person reads, and the stage and reason go to the
       * operational ring.
       */
      const readHosted = async (source: HostedBranchSource): Promise<void | string> => {
        if (repo === null) {
          const refusal = new BranchNavigationFailure({ sentence: "No repository chosen", stage: "repository-read", reason: "no-repository" })
          ctx.report?.(branchNavigationDiagnostic(refusal, 0), refusal)
          throw refusal
        }
        const loaded = await source.load(repo)
        // A question this page no longer asks states nothing and paints nothing.
        if (!current()) return
        if ("error" in loaded) {
          const refusal = new BranchNavigationFailure({ sentence: "Branches unavailable", stage: "repository-read", reason: "host-refused" })
          ctx.report?.(branchNavigationDiagnostic(refusal, 0), refusal)
          return loaded.error
        }
      }
      const read = async (): Promise<void | string> => {
        if (hosted !== undefined) return readHosted(hosted)
        const rows: unknown[] = []
        let real = true
        let nodes: BranchTreeNodeCard[] | undefined
        try {
          // The branch API uses offset cursors; never follow an arbitrary Link URL.
          for (let offset = 0; offset < 10000; offset += 100) {
            const response = await ctx.http(`${ctx.baseUrl}/api/branches?limit=100&cursor=${offset}`, { credentials: "same-origin" })
            if (!response.ok) throw new BranchNavigationFailure({ sentence: "Branches unavailable", stage: "install-read",
              reason: response.status === 404 ? "route-absent" : "host-refused" })
            const page = Rows.parse(await response.json())
            rows.push(...page)
            if (page.length < 100) { nodes = branchTree(rows); break }
          }
          if (!nodes) throw new BranchNavigationFailure({ sentence: "Branches unavailable", stage: "install-read", reason: "host-refused" })
        } catch (error) {
          if (error instanceof BranchNavigationFailure) ctx.report?.(branchNavigationDiagnostic(error, rows.length), error)
          if (design.enabled === false) throw error
          real = false
          nodes = designBranchTree(design.world(), "main")
        }
        if (!current()) return
        if (!await show(nodes)) return
        if (real) observe(rows, owner)
      }
      reading = question
      void (ctx.withToast ? ctx.withToast("branch-tree", "Branches", "Branches", read, true, current) : read())
        .then(() => {}).catch(error => { ctx.report?.("branches", error) })
        .finally(() => { if (reading === question) reading = undefined })
    }
  }
}
