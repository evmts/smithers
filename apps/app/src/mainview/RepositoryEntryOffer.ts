import type { FetchLike } from "@smthrs/rpc/NativeAgent"
import type { GitHubAppStatusInput, GitHubAppStatusRow } from "./state/AppState"
import { INSTALL_VERIFY_PATH, trustedInstallUrl } from "./state/seams/GitHubSeam"

/*
 * What `/owner/repo` says when Smithers does not have that repository and a
 * person IS signed in (mvp.md M-46).
 *
 * The URL is GitHub's path, so the reader expects GitHub's repository. When
 * the catalog and the signed-in inventory both miss, the only honest next step
 * depends on whether the Smithers GitHub App covers the repository for THIS
 * account — so this module reads the one door that can answer that
 * (`GET /api/user/github-app/installations`, the installations the caller's own
 * credential verifies, the same door the setup-URL return already verifies
 * through) and turns the answer into one sentence and at most one act:
 *
 *  - covered: Import, through the existing `repos.import` flow.
 *  - not covered: the App's own installation page, linked.
 *  - unreadable: that it could not be read. No act is invented for it.
 *
 * It never says the repository is absent from GitHub, and never says it is
 * private: this app cannot see GitHub without the App, and GitHub answers a
 * repository it will not show with the same 404 either way. A sentence that
 * picked one would be a guess, and the private-existence guess would leak.
 */

/** What the installations door states about one repository, for this account. */
export interface AppCoverage {
  /** True only when the verified installation list names this repository. */
  readonly covered: boolean
  readonly installationId: number | null
  /** The App's installation page as the server stated it; untrusted until rendered. */
  readonly installUrl: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const fullNameOf = (row: unknown): string | null => {
  if (!isRecord(row)) return null
  const value = row.fullName ?? row.full_name
  if (typeof value !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(value)) return null
  // `.` and `..` are path traversal, never a repository name (RepoLink's catalog read refuses the same).
  return value.split("/").every((part) => part !== "." && part !== "..") ? value : null
}

const installationOf = (row: unknown): number | null => {
  if (!isRecord(row)) return null
  const value = row.installationId ?? row.installation_id
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

/**
 * The App's coverage of `repo` for the signed-in caller, or null when the door
 * could not be read: a refusal (signed out, no credential, a deployment with
 * no App) and an unreadable body are the same answer — nothing was learnt —
 * and neither is reported as "not covered".
 */
export const readAppCoverage = async (http: FetchLike, repo: string): Promise<AppCoverage | null> => {
  let response: Response
  try {
    response = await http(INSTALL_VERIFY_PATH, { headers: { accept: "application/json" } })
  } catch {
    // A dropped request: its thrown text is never copy.
    return null
  }
  if (!response.ok) return null
  const body: unknown = await response.json().catch(() => null)
  if (!isRecord(body) || !Array.isArray(body.repos)) return null
  const installUrl = typeof body.install_url === "string" && body.install_url !== "" ? body.install_url : null
  /*
   * "Not covered" is a verdict, so it needs the WHOLE list read. The route
   * answers one complete verified page (services/github_app_installations.go
   * refuses an incomplete inventory walk with 503 rather than a short list),
   * so the only way a 200 can still be partial here is a row this client
   * cannot read. One such row and nothing is known: the answer is unknown,
   * never "not covered" (GitHubSeam.verifyInstall applies the same rule).
   */
  const rows: Array<{ readonly fullName: string; readonly installationId: number | null }> = []
  for (const row of body.repos) {
    const fullName = fullNameOf(row)
    if (fullName === null) return null
    rows.push({ fullName, installationId: installationOf(row) })
  }
  const match = rows.find((row) => row.fullName.toLowerCase() === repo.toLowerCase())
  return match === undefined
    ? { covered: false, installationId: null, installUrl }
    : { covered: true, installationId: match.installationId, installUrl }
}

/**
 * The coverage answer as the App-status row the rest of the app already reads
 * (`github.app-status.loaded`): the same shape the setup-URL return writes
 * from the same door, so the install link lands where `github app-open` looks
 * for it and the installation chooser keeps its one source.
 */
export const appCoverageRow = (repo: string, coverage: AppCoverage): GitHubAppStatusInput => ({
  repo,
  installed: coverage.covered,
  configured: coverage.covered,
  installationId: coverage.installationId,
  installUrl: coverage.installUrl,
  rateLimit: null
})

/** The act the offer carries, in the message-action shape the transcript renders. */
export interface MissingRepositoryAction {
  readonly flow: string
  readonly args?: string
  readonly label: string
}

export interface MissingRepositoryOffer {
  /** Which outcome this is, for the tests and the data attribute. */
  readonly kind: "import" | "install" | "unknown"
  readonly text: string
  readonly action?: MissingRepositoryAction
}

/**
 * What a signed-in person reads at `/owner/repo` when Smithers does not have
 * it. `status` is the App-status row for that repository: absent means the
 * coverage door was never read or refused.
 */
export const missingRepositoryOffer = (
  repo: string,
  status: Pick<GitHubAppStatusRow, "installed" | "configured" | "installUrl"> | undefined
): MissingRepositoryOffer => {
  /*
   * Re-read the coverage door for this repository. `app-status` is the one
   * `github` operation with no owner preflight (flows/entries/home.ts), so a
   * reader can retry the read that failed without being told to be an owner.
   */
  const retry: MissingRepositoryAction = {
    flow: "github",
    args: JSON.stringify({ operation: "app-status", repo }),
    label: "Retry"
  }
  if (status === undefined) {
    return { kind: "unknown", text: `Smithers doesn't have ${repo}, and couldn't check whether it can import it.`, action: retry }
  }
  if (status.installed && status.configured) {
    return {
      kind: "import",
      text: `Smithers doesn't have ${repo} yet. The Smithers GitHub App covers it for your account.`,
      action: { flow: "repos.import", args: repo, label: "Import" }
    }
  }
  const installUrl = status.installUrl === null ? null : trustedInstallUrl(status.installUrl)
  /*
   * Truthful and no wider: the App does not cover it FOR THIS ACCOUNT. Why
   * is not knowable from here — GitHub answers a repository it will not show
   * with the same 404 as one that does not exist — so the second line names
   * BOTH readings and asserts neither. Saying "no such repository" would be
   * a guess, and the private-existence guess would leak (Q2).
   */
  const cause = `Smithers doesn't have ${repo}, and the Smithers GitHub App doesn't cover it for your account.`
    + "\n\nIt may not exist on GitHub, or may not be accessible to this account."
  return installUrl === null
    ? { kind: "install", text: cause, action: retry }
    : { kind: "install", text: `${cause}\n\n[Install the Smithers GitHub App](${installUrl})` }
}
