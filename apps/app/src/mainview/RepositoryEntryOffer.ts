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
  return typeof value === "string" && /^[\w.-]+\/[\w.-]+$/.test(value) ? value : null
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
  for (const row of body.repos) {
    const fullName = fullNameOf(row)
    if (fullName !== null && fullName.toLowerCase() === repo.toLowerCase()) {
      return { covered: true, installationId: installationOf(row), installUrl }
    }
  }
  return { covered: false, installationId: null, installUrl }
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
  if (status === undefined) {
    return {
      kind: "unknown",
      text: `Smithers doesn't have ${repo}, and couldn't read whether the Smithers GitHub App covers it for your account.`
    }
  }
  if (status.installed && status.configured) {
    return {
      kind: "import",
      text: `Smithers doesn't have ${repo} yet. The Smithers GitHub App covers it for your account, so you can import it.`,
      action: { flow: "repos.import", args: repo, label: `Import ${repo}` }
    }
  }
  const installUrl = status.installUrl === null ? null : trustedInstallUrl(status.installUrl)
  const cause = `Smithers doesn't have ${repo}, and the Smithers GitHub App doesn't cover it for your account: GitHub may not have it, may not show it to you, or the App may not be installed on it.`
  return installUrl === null
    ? { kind: "install", text: `${cause} This deployment has no GitHub App installation page to send you to.` }
    : { kind: "install", text: `${cause}\n\n[Install the Smithers GitHub App](${installUrl})` }
}
