/*
 * The repository and branch the header names. One rule, read by the header
 * selectors and by anything grouped by repository then branch (History), so
 * a group and a selection never name different things.
 *
 * The persisted fields are the session's own: `activeRepoKey`, written by
 * `repo.select`, and `branchNavigation.selected_branch`, written by `branch`.
 * Nothing here invents a value: with no repository there is no branch, and a
 * repository whose default is not loaded yet has none either.
 */
import { parseRepoSelection } from "./AppState"
import type { CloudRepository, Session } from "./AppState"

export interface HeaderSelection {
  /** `owner/name`, or null when no repository is selected. */
  readonly repository: string | null
  /** The branch name inside that repository, or null when none is known. */
  readonly branch: string | null
}

/** An install's trunk (mvp.md M-05): the one branch name the product fixes. */
export const INSTALL_TRUNK = "main"

export const headerSelectionOf = (input: {
  readonly session: Pick<Session, "activeRepoKey" | "branchNavigation"> | undefined
  readonly repositories: Iterable<Pick<CloudRepository, "id" | "head">>
  /** The signed-in account owner (accountOwnerOf), null when signed out. */
  readonly owner: string | null
  /** An install's one repository as `owner/name`; absent on every other host. */
  readonly installRepository?: string | null
  /** The repository's loaded branch names: a pick the repository does not hold falls back to its default. */
  readonly branches?: ReadonlyArray<string>
}): HeaderSelection => {
  const install = input.installRepository ?? null
  const key = input.session?.activeRepoKey ?? null
  const repository = install ?? (key === null ? null : parseRepoSelection(key)?.repoId ?? null)
  if (repository === null) return { repository: null, branch: null }
  const navigation = input.session?.branchNavigation
  const picked = navigation !== undefined && navigation.owner === input.owner && navigation.selected_branch !== "" ? navigation.selected_branch : undefined
  if (picked !== undefined && (input.branches === undefined || input.branches.includes(picked))) return { repository, branch: picked }
  if (install !== null) return { repository, branch: INSTALL_TRUNK }
  for (const row of input.repositories) if (row.id === repository) return { repository, branch: row.head?.bookmark || null }
  return { repository, branch: null }
}
