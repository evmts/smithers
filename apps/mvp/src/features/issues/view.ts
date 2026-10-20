import type { IssuesViewIssue } from "@smthrs/ui"
import type { Role } from "../auth/contract"
import { viewerOf } from "../commands/catalog"
import { githubIssueUrl, MAX_BODY_LENGTH, MAX_TITLE_LENGTH, NOT_SENT_COPY } from "./contract"

type Pending = NonNullable<IssuesViewIssue["pending"]>

// What the issue pages render, from the live queries' rows: the props of `@smthrs/ui`'s `IssuesView`,
// `ItemConversation` and `IssueForm`. Framework-free, so the screens only read queries, render and dispatch.

/** A row of the issues list (queries.ts `listQuery`): synced (`local` 0), or this device's own (`local` 1). */
export interface ListRow {
  readonly id: string
  readonly number: number
  readonly title: string
  readonly state: string
  readonly author: string | null
  readonly comments: number
  readonly updatedAt: string
  readonly pending: string
  readonly reason: unknown
  readonly local: number
}

/** A row of an issue's comments (queries.ts `conversationQuery`). */
export interface CommentRow {
  readonly id: string
  readonly author: string | null
  readonly createdAt: string
  readonly body: string
  readonly pending: string
  readonly reason: unknown
  readonly local: number
}

/** A Not sent write's words, by its reason; none for a write that isn't Not sent. */
export const reasonText = (reason: unknown): string | undefined =>
  typeof reason === "string" && reason in NOT_SENT_COPY ? NOT_SENT_COPY[reason as keyof typeof NOT_SENT_COPY] : undefined

/** A text column that may be missing: none for `null` or empty. */
const shown = (value: string | null): string | undefined => (value === null || value === "" ? undefined : value)

const stateOf = (state: string): "open" | "closed" => (state === "closed" ? "closed" : "open")

/** One list row as `IssuesView` shows it: `#–` and its pending chip until GitHub numbers it. */
export const issueOf = (row: ListRow): IssuesViewIssue =>
  row.local === 0
    ? {
      id: row.id,
      number: row.number,
      title: row.title,
      state: stateOf(row.state),
      author: shown(row.author),
      comments: row.comments,
      updatedAt: row.updatedAt,
    }
    : { id: row.id, number: null, title: row.title, state: "open", pending: row.pending as Pending }

/** A new issue this device made that wasn't sent: its title and why, for Edit and Discard. */
export interface NotSent {
  readonly id: string
  readonly title: string
  readonly reason: string | undefined
}

/** Whether the shape refused this person: they must sign in, or have no role on the repository. */
export type Refused = "sign_in" | "forbidden"

/** The shape's refusal, from the access query's row; none while unknown or allowed. */
export const refusedOf = (access: { readonly status: string } | undefined): Refused | undefined =>
  access?.status === "sign_in" || access?.status === "forbidden" ? access.status : undefined

/**
 * The list page: its issues, whether it is loading (no complete sync of the repository yet and no issue from GitHub:
 * never "No issues" before the first complete sync, and never loading once the shape refused this person), why it was
 * refused, and the new issues that weren't sent.
 */
export const listProps = (rows: ReadonlyArray<ListRow>, synced: unknown, access?: { readonly status: string }) => ({
  refused: refusedOf(access),
  issues: rows.map(issueOf),
  loading: refusedOf(access) === undefined && synced === undefined && rows.every((row) => row.local === 1),
  notSent: rows
    .filter((row) => row.pending === "not_sent")
    .map((row): NotSent => ({ id: row.id, title: row.title, reason: reasonText(row.reason) })),
})

/** One comment as `ItemConversation` shows it; `editable` for one that wasn't sent, which gets Edit and Discard. */
export const commentOf = (row: CommentRow) => ({
  id: row.id,
  author: shown(row.author),
  createdAt: shown(row.createdAt),
  body: row.body,
  pending: row.local === 0 ? undefined : (row.pending as Pending),
  reason: reasonText(row.reason),
  editable: row.pending === "not_sent",
})

/** The routed issue as `ItemConversation` shows it, with "Open on GitHub ↗". */
export const conversationProps = (
  item: {
    readonly number: number
    readonly title: string
    readonly body: string
    readonly state: string
    readonly author: string | null
    readonly createdAt: string
  },
  rows: ReadonlyArray<CommentRow>,
  repository: { readonly owner: string; readonly name: string },
) => ({
  title: item.title,
  number: item.number,
  state: stateOf(item.state),
  author: shown(item.author),
  createdAt: item.createdAt,
  body: item.body,
  comments: rows.map(commentOf),
  externalHref: githubIssueUrl(repository.owner, repository.name, item.number),
})

/** A draft's text as a form shows it, empty when the device has none, and why it can't be sent: too long. */
export const draftOf = (view: { readonly title?: string | undefined; readonly body?: string | undefined } | undefined) => {
  const title = view?.title ?? ""
  const body = view?.body ?? ""
  const error = title.length > MAX_TITLE_LENGTH || body.length > MAX_BODY_LENGTH ? NOT_SENT_COPY.too_large : undefined
  return { title, body, error }
}

/**
 * What an issue's page shows: the issue; the shape's refusal (sign in, or Not found for a person with no role); loading
 * until the repository's first complete sync; else not found.
 */
export const pageOf = (
  item: unknown,
  synced: unknown,
  access?: { readonly status: string },
): "shown" | "loading" | "missing" | "sign_in" =>
  item !== undefined
    ? "shown"
    : refusedOf(access) === "sign_in"
    ? "sign_in"
    : refusedOf(access) === "forbidden" || synced !== undefined
    ? "missing"
    : "loading"

/**
 * Whether the person at the page may open issues and comment: signed in with a role on the repository (decision 0007
 * `repo:issue-open`, `repo:comment`: Guest and above), as sign-in knows it, offline included.
 */
export const mayWrite = (
  session: { readonly status: "loading" | "signed_in" | "signed_out" | "unreachable"; readonly role: Role | null },
  confirmed: { readonly role: Role | null } | undefined,
): boolean => {
  const viewer = viewerOf(session, confirmed)
  return viewer.signedIn && viewer.role !== null
}
