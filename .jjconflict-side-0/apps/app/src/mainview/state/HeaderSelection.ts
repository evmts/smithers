/*
 * The repository and branch the header names. One rule, read by the header
 * selectors and by anything grouped by repository then branch (History), so
 * a group and a selection never name different things.
 *
 * The repository is the session's `activeRepoKey`, written by `repo.select`,
 * or an install's one repository. The branch has two sources, because the
 * two hosts mean different things by it:
 *   - an install has one conversation per branch, so its header branch IS
 *     the conversation's branch, `branchNavigation.selected_branch`;
 *   - a hosted account has one conversation, so its header branch is only
 *     the branch picked in that repository (RepositoryBranchesSeam), and the
 *     conversation's branch is left alone.
 * Nothing here invents a value: with no repository there is no branch, and a
 * repository whose default is not loaded yet has none either.
 */
import { accountOwnerOf } from "./AccountOwner"
import { parseRepoSelection } from "./AppState"
import type { CloudRepository, Session } from "./AppState"
import type { AppController } from "./AppController"

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
  /** Off an install: the branch this account picked in a repository, if any. */
  readonly pickOf?: (repository: string) => string | undefined
  /** Off an install: the repository's loaded branch names. A pick the repository no longer holds falls back to its default. */
  readonly branches?: ReadonlyArray<string>
}): HeaderSelection => {
  const install = input.installRepository ?? null
  if (install !== null) {
    const navigation = input.session?.branchNavigation
    const conversation = navigation !== undefined && navigation.owner === input.owner && navigation.selected_branch !== "" ? navigation.selected_branch : INSTALL_TRUNK
    return { repository: install, branch: conversation }
  }
  const key = input.session?.activeRepoKey ?? null
  const repository = key === null ? null : parseRepoSelection(key)?.repoId ?? null
  if (repository === null) return { repository: null, branch: null }
  const picked = input.pickOf?.(repository)
  if (picked !== undefined && picked !== "" && (input.branches === undefined || input.branches.includes(picked))) return { repository, branch: picked }
  for (const row of input.repositories) if (row.id === repository) return { repository, branch: row.head?.bookmark || null }
  return { repository, branch: null }
}

/** The selection as a controller holds it right now, for readers outside React (History's archive record). */
export const headerSelection = (controller: Pick<AppController, "store" | "bootstrap" | "installSnapshots" | "repositoryBranches">): HeaderSelection => {
  const owner = accountOwnerOf(controller.store.collections.identitySessions.get("identity")) ?? null
  const repositories = controller.store.collections.repositories.values()
  const session = controller.store.session()
  if (controller.bootstrap?.capabilities.includes("install") === true) {
    const installed = controller.installSnapshots.get().model?.repository
    return installed === undefined ? { repository: null, branch: null }
      : headerSelectionOf({ session, repositories, owner, installRepository: `${installed.owner}/${installed.name}` })
  }
  const selected = headerSelectionOf({ session, repositories, owner, pickOf: controller.repositoryBranches.pickOf })
  const loaded = selected.repository === null ? undefined : controller.repositoryBranches.rows.get(selected.repository)
  return loaded?.state === "ready" ? headerSelectionOf({ session, repositories: controller.store.collections.repositories.values(), owner, pickOf: controller.repositoryBranches.pickOf, branches: loaded.names }) : selected
}
