/*
 * The GitHub sync chip in the repo header (repo-ui-spec "The repo header"; mock
 * frame/RepoFrame.tsx GitHubSyncChip and frame/githubSync.ts): the repository
 * document's mirror health, which the admission's one read of
 * GET /api/repos/{owner}/{repo} already carries (routes/repos.go: mirror_status,
 * behind_refs, failed_refs, last_mirror_at, last_mirror_error). It rides on the
 * repository entry (RepoLink.openRequestedRepo); the frame never reads it again.
 *
 * The rule (Platform d-zo8f5i; #4317: a canary's `behind` was written once at
 * configuration, never by a mirror run): mirror_status is trusted only when
 * last_mirror_at is set. No last_mirror_at, or no status word, is NO sync claim
 * at all: no chip, never an invented "up to date". `synced` reads "Synced with
 * GitHub" (no age, so the chip never ticks); `behind` with refs outstanding is
 * stale, "Synced <age>"; `behind` with 0/0 refs renders as synced; `failed`
 * names the reason, then the last success's age. A status word this app does
 * not know is no claim either.
 *
 * What last_mirror_at means on a failure depends on who wrote it: the git
 * mirror sync-run finisher keeps it as the last verified success
 * (db/product/queries/github_mirror_sync_runs.sql FinishGithubMirrorSyncRun),
 * but the github-sync worker's status report stamps it on `failed` too
 * (github_synced_repos.sql RecordGitHubMirrorStatus), so on that path "Last
 * success" is the failed run's own time. The chip shows the document's field
 * and does not guess which path wrote it.
 */

/** The document's mirror health, as the admission read it. */
export interface GitHubSync {
  /** `mirror_status`: synced | behind | failed, or another word this app does not read as a claim. */
  readonly status: string
  readonly behindRefs: number
  readonly failedRefs: number
  /** RFC 3339; null when no mirror run has completed. */
  readonly lastMirrorAt: string | null
  readonly lastMirrorError: string | null
}

export type GitHubSyncChip =
  | { readonly state: "synced" }
  | { readonly state: "stale"; readonly age: string }
  | { readonly state: "failed"; readonly failure: string; readonly age: string }

const count = (value: unknown): number => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0
const text = (value: unknown): string | null => typeof value === "string" && value !== "" ? value : null

/** The sync fields off one repository document; undefined when there is no document. */
export const githubSyncOf = (document: Record<string, unknown> | undefined): GitHubSync | undefined => {
  if (document === undefined) return undefined
  return {
    status: text(document.mirror_status) ?? "",
    behindRefs: count(document.behind_refs),
    failedRefs: count(document.failed_refs),
    lastMirrorAt: text(document.last_mirror_at),
    lastMirrorError: text(document.last_mirror_error)
  }
}

/** The mock's age vocabulary for last_mirror_at: "just now", "N min ago", "N h ago", "N d ago". */
export const syncAge = (iso: string, now: number = Date.now()): string => {
  const elapsed = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
  return elapsed < 1 ? "just now" : elapsed < 60 ? `${elapsed} min ago` : elapsed < 1440 ? `${Math.floor(elapsed / 60)} h ago` : `${Math.floor(elapsed / 1440)} d ago`
}

/** What the chip says for this document, or null for no chip. */
export const githubSyncChip = (sync: GitHubSync | undefined, now: number = Date.now()): GitHubSyncChip | null => {
  if (sync === undefined || sync.status === "" || sync.lastMirrorAt === null || Number.isNaN(Date.parse(sync.lastMirrorAt))) return null
  const age = syncAge(sync.lastMirrorAt, now)
  if (sync.status === "failed") return { state: "failed", failure: sync.lastMirrorError === null ? "GitHub sync failed" : `GitHub sync failed: ${sync.lastMirrorError}`, age }
  if (sync.status === "behind") return sync.behindRefs > 0 || sync.failedRefs > 0 ? { state: "stale", age } : { state: "synced" }
  if (sync.status === "synced") return { state: "synced" }
  return null
}
