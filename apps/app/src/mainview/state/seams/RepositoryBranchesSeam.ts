/*
 * The repository-branches seam: the branch names of a Cloud repository, read
 * from GET /api/repos/{owner}/{repo}/bookmarks (BookmarksSeam), for the
 * header's branch selector and the `branch` flow off an install. An install
 * lists its branches at /api/branches instead (BranchNavigationSeam).
 *
 * The rows are a view of the backend and live in a local-only collection:
 * nothing is persisted and nothing is invented. A repository that was never
 * read has no row. The one persisted fact is the pick itself, the session's
 * `branchNavigation.selected_branch` (HeaderSelection.ts).
 */
import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"
import { randomUuid } from "../../runtime/RandomUuid"
import { accountOwnerOf } from "../AccountOwner"
import { actorSharedState } from "../ActorBindings"
import { activeRepositoryId } from "../RepoContext"
import { fetchAllBookmarks } from "./BookmarksSeam"
import type { SeamContext } from "./SeamContext"

/** One repository's branch names as the backend last answered. */
export interface RepositoryBranches {
  /** `owner/name`. */
  readonly id: string
  readonly state: "loading" | "ready" | "failed"
  /** Sorted names; a failed re-read keeps the names of the last good one. */
  readonly names: ReadonlyArray<string>
  readonly error?: string
}

const createRows = () => createCollection(localOnlyCollectionOptions<RepositoryBranches, string>({
  id: `repository-branches-${randomUuid()}`,
  getKey: row => row.id,
  initialData: []
}))
export type RepositoryBranchRows = ReturnType<typeof createRows>

type Loaded = { readonly names: ReadonlyArray<string> } | { readonly error: string }

export const createRepositoryBranchesSeam = (ctx: SeamContext) => {
  // The user's and the agent's bindings read one set of rows and share reads in flight.
  const shared = actorSharedState(ctx, "repository-branches", () => ({ rows: createRows(), pending: new Map<string, Promise<Loaded>>(), epoch: 0 }))
  const { rows, pending } = shared
  const put = (row: RepositoryBranches): void => {
    if (!rows.has(row.id)) { rows.insert(row); return }
    rows.update(row.id, draft => {
      draft.state = row.state
      draft.names = [...row.names]
      draft.error = row.error
    })
  }
  const owner = (): string | null => accountOwnerOf(ctx.store.collections.identitySessions.get("identity")) ?? null

  /** Read a repository's branches; concurrent reads of one repository share a request. */
  const load = (repo: string): Promise<Loaded> => {
    const running = pending.get(repo)
    if (running !== undefined) return running
    // An account change drops every row; a read that began before it must not write.
    const started = shared.epoch
    put({ id: repo, state: "loading", names: rows.get(repo)?.names ?? [] })
    const read = fetchAllBookmarks(ctx, repo).then((result): Loaded => {
      const loaded: Loaded = "error" in result ? result : { names: [...new Set(result.rows.map(row => row.name))].sort((left, right) => left.localeCompare(right)) }
      if (started !== shared.epoch || ctx.isDisposed?.()) return loaded
      put("error" in loaded
        ? { id: repo, state: "failed", names: rows.get(repo)?.names ?? [], error: loaded.error }
        : { id: repo, state: "ready", names: loaded.names })
      return loaded
    }).finally(() => { if (pending.get(repo) === read) pending.delete(repo) })
    pending.set(repo, read)
    return read
  }

  const pick = async (name: string): Promise<void> => {
    const account = owner()
    const previous = ctx.store.session().branchNavigation
    const kept = previous !== undefined && previous.owner === account ? previous : undefined
    if (kept?.selected_branch === name) return
    // The pick alone: the branch tree stays open or closed as it was.
    await ctx.dispatch({ type: "branch.navigation.changed", actor: ctx.actor(), navigation: {
      ...(kept ?? { open: false, nodes: [] }), owner: account, selected_branch: name
    } }).isPersisted.promise
  }

  return {
    rows,
    load,
    /** The `branch` flow off an install: pick a branch the selected repository holds. */
    select: async (name: string): Promise<string | { readonly value: string }> => {
      const repo = activeRepositoryId(ctx.store)
      if (repo === null) return "Choose a repository"
      // A name the last read holds needs no second read; any other may be newer than that read.
      const known = rows.get(repo)
      let names = known?.state === "ready" ? known.names : undefined
      if (names === undefined || !names.includes(name)) {
        const loaded = await load(repo)
        if ("error" in loaded) return loaded.error
        names = loaded.names
      }
      if (!names.includes(name)) return `No branch ${name}`
      if (activeRepositoryId(ctx.store) !== repo) return "Branch unavailable"
      await pick(name)
      return { value: `Opened ${name}` }
    },
    /** A new repository has its own branches: drop the pick made in the last one and read the new list. */
    repositoryChanged: async (): Promise<void> => {
      const previous = ctx.store.session().branchNavigation
      if (previous !== undefined && previous.owner === owner() && previous.selected_branch !== "") await pick("")
      const repo = activeRepositoryId(ctx.store)
      if (repo !== null) void load(repo)
    },
    /** Another account's branches are never shown: forget every row and every read in flight. */
    clear: (): void => {
      shared.epoch += 1
      pending.clear()
      // This runs inside the identity change that ended the account, and a write made
      // there is rolled back with that transaction: delete once it has settled.
      const ended = shared.epoch
      queueMicrotask(() => {
        if (ended !== shared.epoch || ctx.isDisposed?.()) return
        for (const key of [...rows.keys()]) rows.delete(key)
      })
    }
  }
}
