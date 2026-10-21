import { REPOSITORY_GRANTEE, type ShareAccess } from "../branch/contract"
import type { Current } from "../branch/schema"
import { SHARE_ERRORS } from "./contract"
import type { Dialog, ShareRow } from "./schema"

// What the share dialog shows (docs/features/branch-workspace.md#sharing), from the branch, its permission list and the
// dialog's row: the owner first, then each person by when they were added, the link's access, and the link itself.
// Pure, so the dialog's React view only renders it.

/** The owner's row in the dialog. */
export const OWNER = "owner"

/** A person in the dialog: the owner, or someone the branch is shared with. */
export interface Person {
  readonly id: string
  readonly name: string
  readonly access: ShareAccess | "owner"
}

/** The dialog's people: the owner, named `login`, then everyone shared with by name. */
export const peopleOf = (shares: ReadonlyArray<ShareRow>, login: string | null): ReadonlyArray<Person> => [
  { id: OWNER, name: login ?? OWNER, access: "owner" },
  ...shares.flatMap((row) =>
    row.grantee === REPOSITORY_GRANTEE ? [] : [{ id: row.grantee, name: row.login ?? row.grantee, access: row.access }]
  ),
]

/** What anyone in the repository with the link may do: `restricted` when nothing. */
export const generalOf = (shares: ReadonlyArray<ShareRow>): "restricted" | ShareAccess =>
  shares.find((row) => row.grantee === REPOSITORY_GRANTEE)?.access ?? "restricted"

/** The branch page's link on `origin`: what Copy link copies. */
export const linkOf = (origin: string, current: Pick<Current, "owner" | "repo" | "name">): string =>
  `${origin}/${current.owner}/${current.repo}/tree/${current.name.split("/").map(encodeURIComponent).join("/")}`

/** The dialog's message, if the last change didn't go through. */
export const errorOf = (dialog: Pick<Dialog, "error">): string | undefined =>
  dialog.error === null ? undefined : SHARE_ERRORS[dialog.error]
