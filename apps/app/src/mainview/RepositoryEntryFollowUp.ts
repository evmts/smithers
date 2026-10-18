import type { FetchLike } from "@smthrs/rpc/NativeAgent"
import { appCoverageRow, readRepoAccess } from "./RepositoryEntryOffer"
import { accountOwnerOf } from "./state/AccountOwner"
import type { AppStore } from "./state/AppStore"

/*
 * What `/owner/repo` does after its missing-repository offer (M-46) is acted
 * on, so the person lands on the repository they came for (production
 * feedback 2026-10-18):
 *
 *  - The install button opens GitHub in a new tab. When this tab gets focus
 *    again, the coverage door is read again; a repository the App did not
 *    cover for this account and now covers is imported, because installing
 *    the App on it while this URL was open is asking for it.
 *  - An import of the entry's repository that finishes reopens the entry, so
 *    the repository opens in place of the offer.
 *
 * Both act only while the entry still names a repository Smithers lacks for a
 * signed-in person; a superseded entry does nothing.
 */
export interface RepositoryEntryFollowUpDeps {
  readonly store: AppStore
  readonly http: FetchLike
  readonly runCommand: (name: string, args?: string) => unknown
  /** Read the entry again: `openRequestedRepo` for the repository. */
  readonly reopen: (repo: string) => void
  /** The page whose focus re-reads coverage; absent off the browser. */
  readonly page?: Pick<Window, "addEventListener" | "removeEventListener">
}

export const followRepositoryEntry = ({ store, http, runCommand, reopen, page }: RepositoryEntryFollowUpDeps): (() => void) => {
  const missingEntry = () => {
    const entry = store.session().repositoryEntry
    const identity = store.collections.identitySessions.get("identity")
    return entry?.phase === "failed" && entry.failureKind === "not-public" && identity?.state === "signed-in" ? entry : undefined
  }
  const statusOf = (repo: string) =>
    [...store.collections.githubAppStatuses.values()].find(row => row.repo.toLowerCase() === repo.toLowerCase())
  const importOf = (repo: string) => {
    const owner = accountOwnerOf(store.collections.identitySessions.get("identity")) ?? null
    return store.session().repositoryImports?.find(row => row.payload.repo.toLowerCase() === repo.toLowerCase() &&
      (row.payload.accountOwner === undefined || row.payload.accountOwner === owner))
  }

  let reading = false
  const recheck = async (): Promise<void> => {
    const entry = missingEntry()
    // Only an offer that sent the person to GitHub has anything to re-read.
    if (entry === undefined || reading || statusOf(entry.repo)?.configured !== false) return
    reading = true
    try {
      const coverage = await readRepoAccess(http, entry.repo)
      if (coverage === null || missingEntry()?.requestId !== entry.requestId) return
      store.dispatch({ type: "github.app-status.loaded", actor: "system", status: appCoverageRow(entry.repo, coverage) })
      const phase = importOf(entry.repo)?.payload.phase
      if (coverage.covered && phase !== "starting" && phase !== "running") runCommand("repos.import", entry.repo)
    } finally {
      reading = false
    }
  }
  const onFocus = () => { void recheck() }
  page?.addEventListener("focus", onFocus)

  /* Once per import: a repository that still cannot be opened afterwards must not reopen in a loop. */
  const reopened = new Set<string>()
  const subscription = store.collections.sessions.subscribeChanges(() => {
    const entry = missingEntry()
    if (entry === undefined) return
    const imported = importOf(entry.repo)
    if (imported?.payload.phase !== "done") return
    const key = `${entry.repo.toLowerCase()}:${imported.payload.requestId ?? imported.createdAt}`
    if (reopened.has(key)) return
    reopened.add(key)
    // Out of the change notification: reopening writes the session this subscription reads.
    queueMicrotask(() => reopen(entry.repo))
  })

  return () => {
    page?.removeEventListener("focus", onFocus)
    subscription.unsubscribe()
  }
}
