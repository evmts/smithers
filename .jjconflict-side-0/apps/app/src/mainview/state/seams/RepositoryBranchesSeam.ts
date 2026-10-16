/*
 * The repository-branches seam: the branch names of a Cloud repository, read
 * from GET /api/repos/{owner}/{repo}/bookmarks (BookmarksSeam), and the branch
 * this browser picked in each one, for the header's branch selector and the
 * `branch` flow off an install. An install lists its branches at /api/branches
 * instead (BranchNavigationSeam) and has one conversation per branch.
 *
 * A hosted pick names a repository branch and nothing else. It is never
 * written to the session's `branchNavigation.selected_branch`: that field is
 * the conversation's branch, which a dozen readers address the conversation,
 * its prompts and its cards by, and a hosted account has one conversation,
 * `main` (packages/backend/internal/chat/branch.go).
 *
 * The rows are a view of the backend and live in a local-only collection:
 * nothing is invented, and a repository that was never read has no row. The
 * picks are kept per account and repository in this browser's storage.
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

/** The branch one account picked in one repository. */
export interface RepositoryBranchPick {
  /** {@link pickKey}. */
  readonly id: string
  readonly branch: string
}

/** Where the picks are kept in this browser. */
export const BRANCH_PICKS_STORAGE_KEY = "smithers.header-branches"

/** A pick belongs to one account (the empty owner is a signed-out reader) and one repository. */
export const pickKey = (owner: string | null, repo: string): string => `${owner ?? ""}\n${repo}`

/* Browser storage that never throws: a private window or blocked site data keeps the picks for this page only. */
const readPicks = (): ReadonlyArray<RepositoryBranchPick> => {
  try {
    const saved: unknown = JSON.parse(globalThis.localStorage?.getItem(BRANCH_PICKS_STORAGE_KEY) ?? "{}")
    if (saved === null || typeof saved !== "object" || Array.isArray(saved)) return []
    return Object.entries(saved).flatMap(([id, branch]) => typeof branch === "string" && branch !== "" ? [{ id, branch }] : [])
  } catch { return [] }
}
const writePicks = (picks: Iterable<RepositoryBranchPick>): void => {
  try { globalThis.localStorage?.setItem(BRANCH_PICKS_STORAGE_KEY, JSON.stringify(Object.fromEntries([...picks].map(pick => [pick.id, pick.branch])))) }
  catch { /* kept for this page */ }
}

const createRows = () => createCollection(localOnlyCollectionOptions<RepositoryBranches, string>({
  id: `repository-branches-${randomUuid()}`,
  getKey: row => row.id,
  initialData: []
}))
const createPicks = () => createCollection(localOnlyCollectionOptions<RepositoryBranchPick, string>({
  id: `repository-branch-picks-${randomUuid()}`,
  getKey: row => row.id,
  initialData: [...readPicks()]
}))
export type RepositoryBranchRows = ReturnType<typeof createRows>
export type RepositoryBranchPicks = ReturnType<typeof createPicks>

type Loaded = { readonly names: ReadonlyArray<string> } | { readonly error: string }

export const createRepositoryBranchesSeam = (ctx: SeamContext) => {
  // The user's and the agent's bindings read one set of rows and picks and share reads in flight.
  const shared = actorSharedState(ctx, "repository-branches", () => ({ rows: createRows(), picks: createPicks(), pending: new Map<string, Promise<Loaded>>(), epoch: 0 }))
  const { rows, picks, pending } = shared
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

  const pick = (repo: string, branch: string): void => {
    const id = pickKey(owner(), repo)
    if (picks.get(id)?.branch === branch) return
    if (picks.has(id)) picks.update(id, draft => { draft.branch = branch })
    else picks.insert({ id, branch })
    writePicks(picks.values())
  }

  return {
    rows,
    picks,
    load,
    /** The branch this account picked in `repo`, if any. */
    pickOf: (repo: string): string | undefined => picks.get(pickKey(owner(), repo))?.branch,
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
      pick(repo, name)
      return { value: `Opened ${name}` }
    },
    /** A newly selected repository has its own branches and its own pick: read its list. */
    repositoryChanged: (): void => {
      const repo = activeRepositoryId(ctx.store)
      if (repo !== null) void load(repo)
    },
    /** Another account's branches are never shown: forget every row and every read in flight. Picks are kept per account. */
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
