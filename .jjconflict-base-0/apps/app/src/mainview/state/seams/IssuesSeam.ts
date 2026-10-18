import { issueAuthorizationScope } from "./SeamContext"
import { invalidatePreparedViews,preparedView,type ViewAction,type ViewResult } from "../PreparedView"
import { Data } from "effect"
import { presentAppFailure } from "../controller/AppFailure"
import { readRepositoryDetail } from "../RepositoryReadReceipts"
import { readRepositoryListError,repositoryListRead,type RepositoryForm } from "./RepositoryListSeam"

import type { Card } from "../AppState"
import type { FieldOption } from "@smthrs/ui/flow-form"
import { resolveTargetRepo } from "../RepoContext"
import type { SeamContext } from "./SeamContext"
import { captureCloudOwner,refusalWords,readErrorMessage,readResult,signInRequired,unreachableSentence } from "./SeamContext"
import { refusalOf } from "@smthrs/rpc/Refusal"
import { refusalLine } from "@smthrs/rpc/RefusalCopy"

import type { PersonaRef } from "@smthrs/rpc/Threads"
import { randomUuid } from "../../runtime/RandomUuid"

/** Which rows a list shows: every issue, only conversations, or only issues (smithers-ui-DESIGN.md §3.1). */
export type IssueKindFilter = "all" | "conversation" | "issue"
/** The backend's issue states; an issue moves open → fixed → verified → closed. */
export type IssueState = "open" | "fixed" | "verified" | "closed"
/**
 * Which tracker a row or an act belongs to: the connected repository's own
 * GitHub issues, or Smithers Cloud's tracker. The two number independently,
 * so `#6` names two different objects in one repository and every write has
 * to say which one it means.
 */
export type IssueSource = "smithers-cloud" | "github"

export interface IssuesSeam {
  /** Resolve the same target as the write before publishing a delayed confirmation. */
  readonly issueWriteTarget: (repo?: string) => { readonly repo: string } | { readonly error: string }

  readonly readInstallIssue: (repo: string, number: number) => Promise<ViewResult>
  readonly submitConversation: (text: string, turnId: string, repo: string, owner: string) => Promise<boolean>

  readonly draftIssueComment: (cardId: string, text: string) => Promise<string | void>

  readonly subscribe: (onDispose: (release: () => void) => void) => void
  /** Renders the list card and answers the rows as text (the model reads the value, never the card). */
  readonly listIssues: ViewAction<[filter: "open" | "closed" | "all", repo?: string, kind?: IssueKindFilter, view?: string]>
  /** The repository's issue rows for an index, through the same doors as the list card and mounting none; the door's own sentence when it refuses. */
  readonly readIssueRows: (repo: string, filter: "open" | "closed" | "all") => Promise<ReadonlyArray<IssueListRow> | string>
  /** Reads an authorized snapshot for Make TODO without mounting an issue card. */
  readonly readTodoIssue: (number: number, repo: string) => Promise<IssuePayload | string>
  readonly viewIssue: ViewAction<[number: number, repo?: string, source?: IssueSource]>
  /*
   * A GitHub-source act is admitted durably and answers that it was
   * requested — `{ value }`, as a posted comment already did — so no answer
   * claims GitHub did the write before GitHub has.
   */
  readonly createIssue: (title: string, repo?: string, kind?: "issue" | "chat", source?: IssueSource) => Promise<string | void | { readonly value: string }>
  readonly setIssueState: (
    number: number,
    state: IssueState,
    repo?: string,
    source?: IssueSource
  ) => Promise<string | void | { readonly value: string }>
  readonly editIssueComment: (number: number, commentId: number, text: string, repo?: string) => Promise<string | void | { readonly value: string }>
  readonly deleteIssueComment: (number: number, commentId: number, repo?: string) => Promise<string | void | { readonly value: string }>
  readonly commentOnIssue: (number: number, text: string, repo?: string, persona?: { username: string; iconEmoji?: string; iconUrl?: string }, source?: IssueSource) => Promise<string | void | { readonly value: string }>
  /**
   * Performs one issue transition the REPOSITORY declares (M-47): a move
   * through its own states, proposed to accepted among them, carried by its
   * existing GitHub labels. The declaration — which labels move, and whether
   * a person has to make the move — lives in the repository's committed
   * `.smithers/factory.json` and is read and enforced by the server, so this
   * sends the transition's id and nothing else: no label, no actor and no
   * repository can be named by the client. An undeclared transition and a
   * person-only move an agent asked for are refused there, before anything
   * reaches GitHub.
   *
   * A transition only ever addresses the repository's GitHub tracker: the
   * declared states are GitHub labels, so a Smithers Cloud row has none.
   */
  readonly transitionIssue: (number: number, transition: string, repo?: string) => Promise<string | void | { readonly value: string }>
}

const issueMessageWrites = new WeakMap<SeamContext["store"], Set<string>>()

/**
 * The idempotency key each GitHub issue act carries, by the act itself
 * (subject and payload). Repeating an act reuses its key, so the server
 * replays the one durable operation it admitted and GitHub never sees the
 * write twice; a different act is a different key.
 */
const installIssueActKeys = new WeakMap<SeamContext["store"], Map<string, string>>()

type IssueListPayload = Extract<Card, { kind: "issue-list" }>["payload"]
type IssueListRow = IssueListPayload["issues"][number]
type IssuePayload = Extract<Card, { kind: "issue" }>["payload"]
type IssueCommentRow = IssuePayload["comments"][number]
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const asInt = (value: unknown): number | null => typeof value === "number" && Number.isInteger(value) ? value : null

const asIssueState = (value: unknown): IssueState => value === "closed" || value === "fixed" || value === "verified" ? value : "open"
const asText = (value: unknown): string | undefined => typeof value === "string" && value !== "" ? value : undefined

/** A user summary off the wire (`{ login, avatar_url? }` or a bare login) as a persona. */
const taskPersonOf = (value: unknown): PersonaRef | undefined => {
  if (typeof value === "string") return value === "" ? undefined : { id: value, name: value }
  if (!isRecord(value)) return undefined
  const login = asText(value.login) ?? asText(value.username) ?? asText(value.name)
  if (login === undefined) return undefined
  const avatar = asText(value.avatar_url) ?? asText(value.iconUrl)
  return { id: login, name: login, ...(avatar === undefined ? {} : { iconUrl: avatar }) }
}

/**
 * The PATCH value for one intent field (#2186): owner is a login, due a
 * YYYY-MM-DD date, priority 0-3 and parent an issue number; an empty value
 * clears the field. Undefined when priority or parent is not a number.
 */
export const taskFieldValue = (field: "owner" | "due" | "priority" | "parent", value: string): string | number | null | undefined => {
  const text = value.trim()
  if (text === "") return null
  if (field === "owner" || field === "due") return text
  const digits = field === "priority" ? text.replace(/^p/i, "") : text.replace(/^#/, "")
  if (!/^\d+$/.test(digits)) return undefined
  const number = Number(digits)
  return field === "priority" ? (number <= 3 ? number : undefined) : (number > 0 ? number : undefined)
}

/** Intent metadata the issue carries, when it carries any (owner, due, priority, parent, fixer, verifier). */
const taskOf = (value: Record<string, unknown>): IssueListRow["task"] => {
  const owner = taskPersonOf(value.owner)
  const fixedBy = taskPersonOf(value.fixed_by)
  const verifiedBy = taskPersonOf(value.verified_by)
  const priority = asInt(value.priority)
  const parentNumber = isRecord(value.parent) ? asInt(value.parent.number) : null
  const due = asText(value.due)
  const task = {
    ...(owner === undefined ? {} : { owner }),
    ...(due === undefined ? {} : { due }),
    ...(priority === null || priority < 0 || priority > 3 ? {} : { priority: priority as 0 | 1 | 2 | 3 }),
    ...(parentNumber === null ? {} : { parent: { number: parentNumber, ...(isRecord(value.parent) && asText(value.parent.title) !== undefined ? { title: value.parent.title as string } : {}) } }),
    ...(fixedBy === undefined ? {} : { fixedBy }),
    ...(verifiedBy === undefined ? {} : { verifiedBy })
  }
  return Object.keys(task).length === 0 ? undefined : task
}

/** The author login off Plue's `author: { login }` shape, or null. */
const authorLogin = (value: unknown): string | null =>
  isRecord(value) && typeof value.login === "string" && value.login !== "" ? value.login : null

/** Optional forge facts stay absent when the read did not supply them. */
const forgeFacts = (value: Record<string, unknown>, author: unknown): Pick<IssuePayload, "createdAt" | "assignees" | "labelColors" | "authorAvatar"> => ({
  ...(typeof value.created_at === "string" ? { createdAt: value.created_at } : {}),
  ...(Array.isArray(value.assignees) ? { assignees: value.assignees.flatMap(person =>
    isRecord(person) && typeof person.login === "string" && person.login !== ""
      ? [{ login: person.login, ...(typeof person.avatar_url === "string" ? { avatar: person.avatar_url } : {}) }] : []) } : {}),
  ...(Array.isArray(value.labels) ? { labelColors: Object.fromEntries(value.labels.flatMap(label =>
    isRecord(label) && typeof label.name === "string" && typeof label.color === "string"
      ? [[label.name, label.color]] : [])) } : {}),
  ...(isRecord(author) && typeof author.avatar_url === "string" ? { authorAvatar: author.avatar_url } : {})
})

const commentOrigin = (value: unknown): "app" | "slack" | "telegram" | undefined =>
  value === "app" || value === "slack" || value === "telegram" ? value : undefined

/** The backend's `last_comment` ({commenter, persona, excerpt, origin, created_at}): null when the issue has no comments, absent when malformed. */
const parseLastComment = (value: unknown): IssueListRow["lastComment"] => {
  if (value === null) return null
  if (!isRecord(value)) return undefined
  const origin = commentOrigin(value.origin)
  if (typeof value.commenter !== "string" || typeof value.excerpt !== "string" || typeof value.created_at !== "string" || origin === undefined) return undefined
  const persona = isRecord(value.persona) && typeof value.persona.username === "string" && value.persona.username.trim() !== "" ? value.persona.username : undefined
  return { commenter: value.commenter, ...(persona === undefined ? {} : { persona }), excerpt: value.excerpt, origin, createdAt: value.created_at }
}

const lastCommentOf = (value: Record<string, unknown>): Pick<IssueListRow, "lastComment"> => {
  const lastComment = parseLastComment(value.last_comment)
  return lastComment === undefined ? {} : { lastComment }
}

/** One list row; null when the entry carries no usable issue number. */
const parseListRow = (value: unknown): IssueListRow | null => {
  if (!isRecord(value)) return null
  const number = asInt(value.number)
  if (number === null) return null
  const comments = asInt(value.comment_count)
  return {
    number,
    ...(value.kind === "chat" ? { kind: "chat" as const } : {}),
    title: typeof value.title === "string" ? value.title : "",
    state: asIssueState(value.state),
    author: authorLogin(value.author),
    ...forgeFacts(value, value.author),
    labels: parseLabels(value.labels),
    comments: comments !== null && comments >= 0 ? comments : 0,
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : null,
    ...lastCommentOf(value),
    ...(taskOf(value) === undefined ? {} : { task: taskOf(value) })
  }
}

/*
 * One list row off GitHub's issue shape — the source-only fallback read
 * (`/api/user/github-repos/{o}/{r}/issues`; multi src/smithersCloud/
 * githubIssues.ts parseIssue). GitHub's issues endpoint includes pull
 * requests; presence of `pull_request`, not its shape, is the documented
 * discriminator, so those rows drop. Author sits under `user.login` and the
 * comment count under `comments` — different spellings, same card row.
 */
const parseGithubListRow = (value: unknown): IssueListRow | null => {
  if (!isRecord(value) || "pull_request" in value) return null
  const number = asInt(value.number)
  if (number === null) return null
  const comments = asInt(value.comments)
  return {
    number,
    source: "github",
    ...(typeof value.html_url === "string" ? { htmlUrl: value.html_url } : {}),
    title: typeof value.title === "string" ? value.title : "",
    state: asIssueState(value.state),
    author: authorLogin(value.user),
    ...forgeFacts(value, value.user),
    labels: parseLabels(value.labels),
    comments: comments !== null && comments >= 0 ? comments : 0,
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : null
  }
}

/** The sentence for a list read that answered a surface this index cannot read rows from (defensive: every read above answers an issue-list card or a sentence). */
const ISSUE_INDEX_UNREADABLE = "The issue index could not be read for this repository."

/**
 * How the issue index read ended, as a closed vocabulary. The codes are the
 * WHOLE diagnostic: nothing derived from the request or the answer joins
 * them, so no repository, query, URL, header, credential or backend sentence
 * can ride along.
 *
 * - `rows`: doors answered and rows were indexed.
 * - `empty`: every door answered, and together they held nothing.
 * - `read_refused`: the list read answered a sentence of its own.
 * - `sign_in_required`: the tracker refused the session and THREW rather than answering.
 * - `source_refused`: no rows, and the GitHub source refused.
 * - `unreadable_view`: the read answered a surface with no rows to index.
 */
type IssueIndexReason = "rows" | "empty" | "read_refused" | "sign_in_required" | "source_refused" | "unreadable_view"

/**
 * The outcome the record below carries, as a TAGGED failure.
 *
 * Every other `ctx.report` site forwards an error it caught; this one reports
 * an outcome of the healthy path, so it has nothing to forward and must make
 * its own. A raw `new Error` would be untagged text in a seam, which
 * `presentUserFailure` can only call unknown and `RawErrorSites.test.ts`
 * (#2813) refuses on sight. The tag is never presented — the record reaches
 * the operational ring and the client sink, never a card — and `reason` is
 * the same closed vocabulary as the subject, so nothing new can ride along.
 */
class IssueIndexOutcome extends Data.TaggedError("IssueIndexOutcome")<{ readonly reason: IssueIndexReason }> {}

/**
 * The issue index door's own record, through SeamContext.report — the
 * operational ring and the client error sink, never the screen
 * (state/OperationalFailures.ts dedupes a repeated key for a minute and
 * keeps the last hundred).
 *
 * It records the EMPTY answers too, not only the refusals. An index that
 * answered no rows is the production failure that could not be told apart
 * from a correct empty tracker: `/search.issues` said `0 results` for the
 * exact title `/issue 5` opened in the same session, and nothing on the
 * screen or in the ring said which door had ended the read. The stage, the
 * reason code and the per-source counts are what makes the next one
 * diagnosable; `rows` is the healthy shape and records nothing at all.
 *
 * Read the `reason`, not the ring's `lost`/`fault`: those classify a THROW
 * (`lostActFault`, whose closed set is `app-bug` | `cancelled` | the browser
 * write faults), and this record is manufactured on a path that threw
 * nothing, so every one of them files as `app-bug`/`infra` whatever happened.
 * A tracker that is correctly empty is not a bug of Smithers' own; `reason`
 * is the whole verdict. Giving the ring a fault class a manufactured outcome
 * can answer honestly means widening a user-facing copy set, which is Will's
 * call, not this fix's.
 */
const reportIssueIndex = (
  ctx: SeamContext, reason: IssueIndexReason, rows: ReadonlyArray<IssueListRow> = []
): void => {
  if (reason === "rows") return
  const counted = (source: IssueListRow["source"]) => rows.filter((row) => row.source === source).length
  ctx.report?.(
    `issues.index stage=read reason=${reason} rows=${rows.length} cloud=${counted("smithers-cloud")} github=${counted("github")}`,
    new IssueIndexOutcome({ reason })
  )
}

/**
 * The write acts that resolve a source, as a closed vocabulary. Like
 * {@link IssueIndexReason} these codes are the WHOLE diagnostic: no
 * repository, number, title, comment text, URL, header or credential joins
 * them.
 */
type IssueWriteAct = "create" | "state" | "comment" | "transition"

/** A write that resolved the GitHub source and found no door to send it through. */
class IssueWriteUnsendable extends Data.TaggedError("IssueWriteUnsendable")<{ readonly act: IssueWriteAct }> {}

/**
 * The record a refused GitHub-source write leaves on the operational ring and
 * the client sink (never the screen): which act asked, and that it resolved
 * the `github` source with no writer behind it. Root's 2026-10-15 run is the
 * reason it exists — `/issues.create` answered "#6 created" from the Smithers
 * Cloud tracker while GitHub's own `#6` was an unrelated closed auto-PR test,
 * and nothing anywhere named the source the write had actually used.
 */
const reportIssueWriteUnsendable = (ctx: SeamContext, act: IssueWriteAct): void => {
  ctx.report?.(`issues.write stage=route reason=github_writer_absent act=${act}`, new IssueWriteUnsendable({ act }))
}

/** Label names are the stable keys; forgeFacts supplies their optional colors. */
const parseLabels = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((label) => isRecord(label) && typeof label.name === "string" ? [label.name] : [])
    : []

/** One comment off Plue's IssueCommentResponse shape; null when not a record. */
const parseComment = (value: unknown): IssueCommentRow | null => {
  if (!isRecord(value)) return null
  const persona = isRecord(value.persona) && typeof value.persona.username === "string" && value.persona.username.trim() !== "" ? {
    username: value.persona.username,
    ...(typeof value.persona.iconEmoji === "string" ? { iconEmoji: value.persona.iconEmoji } : {}),
    ...(typeof value.persona.iconUrl === "string" ? { iconUrl: value.persona.iconUrl } : {})
  } : undefined
  return {
    ...(asInt(value.id) !== null ? { id: value.id as number } : {}),
    ...(typeof value.idempotency_key === "string" ? { idempotencyKey: value.idempotency_key } : {}),
    ...(persona ? { persona, ...(persona.iconUrl ? { authorAvatar: persona.iconUrl } : {}) } : {}),
    author: typeof value.commenter === "string" && value.commenter !== "" ? value.commenter : null,
    commentBody: typeof value.body === "string" ? value.body : "",
    createdAt: typeof value.created_at === "string" ? value.created_at : null,
    ...(commentOrigin(value.origin) === undefined ? {} : { origin: commentOrigin(value.origin) })
  }
}

/** The detail payload; null only when the body is not a record at all. */
const parseDetail = (
  value: unknown,
  repo: string,
  number: number,
  comments: ReadonlyArray<IssueCommentRow>
): IssuePayload | null => {
  if (!isRecord(value)) return null
  return {
    repo,
    number: asInt(value.number) ?? number,
    ...(value.kind === "chat" ? { kind: "chat" as const } : {}),
    title: typeof value.title === "string" ? value.title : "",
    state: asIssueState(value.state),
    author: authorLogin(value.author),
    ...forgeFacts(value, value.author),
    ...(value.visibility === "private" || value.visibility === "public" ? { visibility: value.visibility } : {}),
    issueBody: typeof value.body === "string" ? value.body : "",
    labels: parseLabels(value.labels),
    comments: [...comments],
    ...lastCommentOf(value),
    ...(taskOf(value) === undefined ? {} : { task: taskOf(value) }),
  }
}

/** One row formatter for imported and GitHub-source issue results. */
const issueRowValue = (issue: IssueListRow, source = issue.source): string =>
  `#${issue.number} ${issue.title} · ${issue.state}${source === "github" ? " · GitHub" : ""}`

/** The imported tracker's issues route for a repository. */
const issuesRoute = (ctx: Pick<SeamContext, "baseUrl">, repo: string): string => {
  const [owner = "", name = ""] = repo.split("/")
  return `${ctx.baseUrl}/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues`
}

/** The saved issue views route (the factory's issueViews) for a repository. */
const issueViewsRoute = (ctx: Pick<SeamContext, "baseUrl">, repo: string): string => issuesRoute(ctx, repo).replace(/\/issues$/, "/issue-views")

/** One declared view as the list card offers it. */
const parseIssueView = (value: unknown): { readonly id: string; readonly title: string } | null =>
  isRecord(value) && typeof value.id === "string" && value.id !== "" && typeof value.title === "string" && value.title !== ""
    ? { id: value.id, title: value.title }
    : null

/*
 * IMPORT-READINESS (multi src/smithersCloud/importReadiness.ts): the
 * `/api/repos/{o}/{r}/**` namespace only exists for repositories IMPORTED
 * into Smithers Cloud — for a source-only repo every request there answers
 * 404. The same repo's GitHub-source metadata still lists issues through
 * `GET /api/user/github-repos/{o}/{r}/issues` (GET-only through the
 * Worker), so reads degrade to the source list; mutations never fall back.
 */
const githubIssuesRoute = (ctx: Pick<SeamContext, "baseUrl">, repo: string, filter: "open" | "closed" | "all"): string => {
  const [owner = "", name = ""] = repo.split("/")
  // GitHub accepts state=all (only Plue's imported namespace rejects it).
  return `${ctx.baseUrl}/api/user/github-repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues?state=${filter}`
}

/**
 * The open issues of a repository as a form's options (the Fix an issue
 * app's picker, controller/forms.ts `issues`): Smithers Cloud's own tracker,
 * read exactly as the issues list reads it. A source-only repository
 * answers no options and names the import door, since Fix cannot use GitHub
 * source issues.
 */
export const readIssueOptions = async (
  ctx: Pick<SeamContext, "http" | "baseUrl">,
  repo: string
): Promise<{ readonly options: ReadonlyArray<FieldOption>; readonly error?: string }> => {
  const option = (row: IssueListRow): FieldOption => ({ value: String(row.number), label: `#${row.number} ${row.title}` })
  const read = async (url: string): Promise<{ readonly rows?: ReadonlyArray<unknown>; readonly status?: number; readonly error?: string }> => {
    let response: Response
    try {
      response = await ctx.http(url)
    } catch (error) {
      return { error: unreachableSentence(`the backend to list issues for ${repo}`, error) }
    }
    if (!response.ok) return { status: response.status, error: await readRepositoryListError(response, `Listing issues for ${repo} failed (${response.status})`) }
    const body: unknown = await response.json().catch(() => null)
    return Array.isArray(body) ? { rows: body } : { error: `The backend answered issues for ${repo} with an unreadable payload` }
  }
  const native = await read(`${issuesRoute(ctx, repo)}?state=open`)
  if (native.rows !== undefined) {
    return { options: native.rows.flatMap((entry) => {
      const parsed = parseListRow(entry)
      return parsed === null || parsed.kind === "chat" ? [] : [option(parsed)]
    }) }
  }
  if (native.status !== 404) return { options: [], error: native.error }
  return { options: [], error: `Import ${repo} to fix an issue: /repos.import ${repo}` }
}

/*
 * A 404 on an issue route, split on its typed code, never the platform's prose.
 * `not_found`, or no code at all, is the issue or repository missing: the
 * caller's `whenNotFound` (on a mutation, a codeless answer keeps plue's own
 * words when it wrote any). Any other code, `route_not_found` above all, is
 * the address itself missing, which says nothing about the issue: it reads as
 * the act that failed and that code's verdict.
 */
const issue404 = async (response: Response, act: string, whenNotFound: string, codelessWords = true): Promise<string> => {
  const body: unknown = await response.json().catch(() => null)
  const refusal = refusalOf({ body, status: response.status, message: refusalWords(body, whenNotFound, response.status) })
  if (refusal.code === "not_found") return whenNotFound
  if (refusal.rawCode === null) return codelessWords ? refusalLine(refusal, whenNotFound) : whenNotFound
  return refusalLine(refusal, act)
}

/** The native tracker has no such issue; a GitHub issue has its own door. */
const nativeIssueMissing = (repo: string, number: number): string =>
  `Issue #${number} in ${repo} was not found. For a GitHub issue, use /issues.view ${number} ${repo} --source github.`

/**
 * Read an imported issue payload without opening a card. The canonical
 * `todo.from-issue` command checks this source before drafting a TODO.
 */
export const fetchIssuePayload = async (
  ctx: Pick<SeamContext, "http" | "baseUrl">,
  repo: string,
  number: number
): Promise<IssuePayload | string> => {
  let response: Response
  try {
    response = await ctx.http(`${issuesRoute(ctx, repo)}/${number}`)
  } catch (error) {
    return unreachableSentence(`the backend to load issue #${number} in ${repo}`, error)
  }
  if (!response.ok) {
    return response.status === 404
      ? issue404(response, `Loading issue #${number} in ${repo} failed (404)`, nativeIssueMissing(repo, number), false)
      : readErrorMessage(response, `Loading issue #${number} in ${repo} failed (${response.status})`)
  }
  const payload = parseDetail(await response.json().catch(() => null), repo, number, [])
  return payload ?? `The backend answered issue #${number} in ${repo} with an unreadable payload`
}

/** One GitHub comment off GitHub's shape (`user.login`, `body`, `created_at`). */
const githubCommentOf = (row: unknown): IssueCommentRow[] => isRecord(row) ? [{
  author: authorLogin(row.user),
  /*
   * GitHub's own comment id. An edit addresses the comment, not the issue, so
   * the id has to come off the authoritative read: without it an edit has no
   * subject at all. A read that states none leaves the field absent, and the
   * card reads exactly as it did before.
   */
  ...(asInt(row.id) === null ? {} : { id: row.id as number }),
  ...(isRecord(row.user) && typeof row.user.avatar_url === "string" ? { authorAvatar: row.user.avatar_url } : {}),
  commentBody: typeof row.body === "string" ? row.body : "",
  createdAt: typeof row.created_at === "string" ? row.created_at : null
}] : []

/** Where this seam reads issues: Smithers Cloud's routes, or an install's own (GET /api/issues). */
export interface IssuesSeamOptions {
  /**
   * An install serves its repository's GitHub issues through its App at
   * GET /api/issues and /api/issues/{n}; it has no Smithers tracker, so
   * every issue is a GitHub issue.
   */
  readonly install?: boolean
  /**
   * The install's one repository (`owner/name`, GET /api/install): the
   * target when a command names none. A member's app loads no repository
   * of its own, so the install's stands in.
   */
  readonly repository?: () => string | undefined
  /**
   * The install's canonical durable issue create (IssueCreateSeam, the door
   * `/issue.new` uses): it persists the request, acknowledges immediately,
   * and opens the issue GitHub actually numbered. A GitHub-source create
   * goes through it rather than through a second client pipeline.
   */
  readonly requestGitHubIssue?: (title: string, body: string) => Promise<string | void | { readonly value: string }>
}

export const createIssuesSeam = (ctx: SeamContext, renderRepositoryForm?: RepositoryForm, launchConversationTurn?: (text: string, turnId: string, owner: string) => Promise<boolean> | void, options: IssuesSeamOptions = {}): IssuesSeam => {
  const install = options.install === true
  /** The repository a command names, or on an install the install's own. */
  const repoOf = (repo: string | undefined): string | undefined =>
    repo !== undefined && repo !== "" ? repo : install ? options.repository?.() : undefined
  const signedInOwner = () => {
    const identity = ctx.store.collections.identitySessions.get("identity")
    const cloud = ctx.store.collections.cloudSessions.get("cloud")
    return identity?.state === "signed-in" ? identity.login : cloud?.state === "signed-in" ? cloud.username : undefined
  }
  /**
   * The tracker the repository itself declares, off the authoritative
   * inventory row (`CloudRepository.issueTracker`, which the server resolves
   * from the repository's own GitHub binding — the sync registry's current
   * binding or the ready import bound to this exact repository). It is the
   * repository's ANSWER, not a guess: nothing here reads a display name, a
   * number or a summary, and a row that carries no tracker answers undefined
   * rather than a tracker nobody resolved.
   *
   * This is what makes an ordinary act on an imported GitHub repository
   * address that repository's GitHub issues without `--source github` on
   * every act, while a Smithers Cloud repository keeps its own tracker.
   */
  const repositoryTracker = (repo: string): IssueSource | undefined => {
    const row = ctx.store.collections.repositories.get(repo) ??
      [...ctx.store.collections.repositories.values()].find((entry) => entry.id.toLowerCase() === repo.toLowerCase())
    return row?.issueTracker
  }

  const issuesPath = (repo: string): string => issuesRoute(ctx, repo)
  const githubSourceIssuesPath = (repo: string, filter: "open" | "closed" | "all"): string => githubIssuesRoute(ctx, repo, filter)

  /** Every issue card this seam has mounted for one `repo`/`number` pair. */
  const mountedIssues = (repo: string, number: number): ReadonlyArray<Extract<Card, { kind: "issue" }>> =>
    [...ctx.store.collections.cards.values()].flatMap((card) =>
      card.kind === "issue" && card.payload.repo === repo && card.payload.number === number ? [card] : [])

  /**
   * Which tracker a write addresses, decided from RECORDED identity:
   *
   * 1. the source recorded on the issue this act came off — an authoritative
   *    read's own label, which is part of the issue's identity;
   * 2. the `--source` a command named;
   * 3. the repository's real tracker: an install's repository IS a connected
   *    GitHub repository (the server binds one and answers its GitHub issues),
   *    so its ordinary issues are GitHub's; a Smithers Cloud repository's own
   *    tracker is Smithers Cloud's.
   *
   * A connected repository's two trackers number independently, so `#6` names
   * two different objects. Writes used to resolve NO source and address
   * `/api/repos/{o}/{r}/issues` unconditionally: closing or commenting from a
   * GitHub-source card changed (or 404ed on) the same-numbered Cloud row, and
   * `/issues.create` reported a Cloud number as though it were GitHub's
   * canonical one — root read back "#6" on 2026-10-15 while
   * `roninjin10/e2e-verify#6` was an unrelated closed auto-PR test.
   *
   * When BOTH trackers hold a recorded row at this number, the number alone
   * does not name an issue, so the act is REFUSED rather than resolved to one
   * of them: either choice could write the wrong object. A conversation is
   * owner-private and never GitHub's, whatever a command asks.
   */
  type IssueWriteTarget = { readonly source: IssueSource } | { readonly refusal: string }

  const issueWriteTarget = (repo: string, number: number, asked?: IssueSource): IssueWriteTarget => {
    const recorded = mountedIssues(repo, number)
    if (recorded.some((card) => card.payload.kind === "chat")) {
      return asked === "github"
        ? { refusal: `#${number} in ${repo} is a private conversation. It stays in Smithers Cloud and is never posted to GitHub.` }
        : { source: "smithers-cloud" }
    }
    const sources = new Set(recorded.map((card): IssueSource => card.payload.source === "github" ? "github" : "smithers-cloud"))
    if (asked !== undefined) return { source: asked }
    if (sources.size > 1) {
      return { refusal: `${repo} has a GitHub #${number} and a Smithers Cloud #${number}. Add --source github or --source smithers-cloud.` }
    }
    const [recordedSource] = [...sources]
    if (recordedSource !== undefined) return { source: recordedSource }
    if (install) return { source: "github" }
    /*
     * Nothing recorded at this number: the repository's own declared tracker
     * decides, so `/issues.close 6` on an imported GitHub repository closes
     * GitHub's #6 and the same act on a Cloud-native repository closes the
     * Cloud row. A repository whose tracker this server could not resolve
     * keeps the Cloud reading it has always had — the one tracker every
     * origin has — rather than being refused outright.
     */
    return { source: repositoryTracker(repo) ?? "smithers-cloud" }
  }

  /**
   * Which tracker a READ addresses, on the same recorded-identity rules the
   * write uses. An install's issues are GitHub's; an asked source wins; a
   * recorded private conversation at this number is owner-private and stays
   * in Smithers Cloud whatever the repository declares; otherwise the
   * repository's own declared tracker decides, and an unresolved one keeps
   * the Cloud reading.
   *
   * `undefined` means Smithers Cloud for the callers below, which is the
   * shape they already had.
   */
  const issueReadSource = (repo: string, number: number, asked?: IssueSource): IssueSource | undefined => {
    if (install) return "github"
    if (asked !== undefined) return asked
    if (mountedIssues(repo, number).some((card) => card.payload.kind === "chat")) return "smithers-cloud"
    return repositoryTracker(repo)
  }

  /**
   * A GitHub-source write with no writer behind it, as the whole answer.
   *
   * Both origins now have one: an install writes its one bound repository's
   * GitHub issues, and a Smithers Cloud origin writes the repository's own
   * GitHub tracker through the repository-scoped doors below. This answer is
   * what is left — a repository whose name could not be split into
   * `owner/name`, so no repository-scoped door exists to address. Addressing
   * the same-numbered Smithers Cloud row instead would change a different
   * issue and report its number as GitHub's. One short, actionable sentence —
   * no route, origin or internal prose.
   */
  const githubWriteUnsendable = (act: IssueWriteAct, subject: string, repo: string): string => {
    reportIssueWriteUnsendable(ctx, act)
    return `${subject} ${act === "create" ? "would be" : "is"} a GitHub issue in ${repo}. ${act === "create" ? "Open it" : "Act on it"} on GitHub, or add --source smithers-cloud.`
  }

  /**
   * Where one GitHub issue act is addressed.
   *
   * An install has ONE bound repository and writes it through `/api/issues`.
   * Every other origin addresses the repository itself, under the existing
   * repo-scoped GitHub family: `/api/repos/{owner}/{repo}/github/issues…`,
   * which is a DIFFERENT tracker from `/api/repos/{owner}/{repo}/issues`
   * beside it. Both doors reach the same durable writer and the same shared
   * worker; only the authority differs (an install's bound credential, or the
   * actor's own repository write permission plus their own GitHub authority).
   *
   * Undefined when the repository is not an `owner/name` pair, so no
   * repository-scoped door exists for it.
   */
  const githubIssueActUrl = (repo: string, path: string): string | undefined => {
    if (install) return `${ctx.baseUrl}/api/issues${path}`
    const [owner = "", name = ""] = repo.split("/")
    if (owner === "" || name === "") return undefined
    return `${ctx.baseUrl}/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/github/issues${path}`
  }

  /**
   * One GitHub issue act through the canonical durable writer
   * (`services/install_issue_comment.go` and its hosted admissions):
   * credential reload and actor re-authorization on the worker, the send
   * fence around the one actual request, and a receipt. The server
   * acknowledges the ADMISSION, before the act reaches GitHub, so the answer
   * says it was requested — never that GitHub did it.
   *
   * `act` is the whole act, payload included, and names the idempotency key:
   * repeating the same act replays the one admitted operation instead of
   * sending a second write, and a reply this client never saw leaves the key
   * in place rather than POSTing again.
   */
  const sendGitHubIssueAct = async (
    writeAct: IssueWriteAct, subject: string, repo: string,
    act: string, path: string, method: "POST" | "PATCH", requested: string, failure: string, body?: unknown
  ): Promise<string | { readonly value: string }> => {
    const url = githubIssueActUrl(repo, path)
    if (url === undefined) return githubWriteUnsendable(writeAct, subject, repo)
    let keys = installIssueActKeys.get(ctx.store)
    if (!keys) installIssueActKeys.set(ctx.store, keys = new Map())
    let key = keys.get(act)
    if (key === undefined) keys.set(act, key = randomUuid())
    let response: Response
    try {
      response = await ctx.http(url, {
        method,
        headers: { "content-type": "application/json", "Idempotency-Key": key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    } catch {
      // The act may already have been admitted. The key is kept, so asking
      // again resumes that operation rather than starting a second one.
      return `${requested} status unknown: nothing answered. Ask again to resume it.`
    }
    if (!response.ok) return readErrorMessage(response, `${failure} (${response.status})`)
    await response.body?.cancel().catch(() => {})
    return { value: `${requested} requested.` }
  }

  const unreachable = (what: string, error: unknown): string => unreachableSentence(`the backend to ${what}`, error)

  /**
   * GitHub's issues for `repo`, through the GitHub-source route, with the
   * read's provenance from plue's X-Metadata-* headers. A refusal answers
   * no rows and the reason; the caller states it beside Smithers Cloud's own list.
   */
  const readGithubIssues = async (
    repo: string,
    filter: "open" | "closed" | "all"
  ): Promise<{
    readonly issues: Array<IssueListRow & { readonly source: "github"; readonly htmlUrl?: string }>
    readonly meta?: { source: string; syncedAt: string | null; stale: boolean; syncError: string | null; refusal: string | null }
  }> => {
    let response: Response
    try {
      response = await ctx.http(githubSourceIssuesPath(repo, filter))
    } catch {
      // The tapped fetch recorded the thrown request; its text is not copy.
      return { issues: [], meta: { source: "unreachable", syncedAt: null, stale: false, syncError: null, refusal: "Could not reach GitHub." } }
    }
    const meta = {
      source: response.headers.get("x-metadata-source") ?? (response.ok ? "github" : "refused"),
      syncedAt: response.headers.get("x-metadata-synced-at"),
      stale: response.headers.get("x-metadata-stale") === "true",
      syncError: response.headers.get("x-metadata-sync-error"),
      refusal: null as string | null
    }
    if (!response.ok) {
      return { issues: [], meta: { ...meta, refusal: await readErrorMessage(response, `GitHub issues answered ${response.status}`) } }
    }
    const body: unknown = await response.json().catch(() => null)
    if (!Array.isArray(body)) return { issues: [], meta: { ...meta, refusal: "GitHub issues answered an unreadable payload" } }
    const issues = body.flatMap((entry) => {
      const parsed = parseGithubListRow(entry)
      if (parsed === null) return []
      const htmlUrl = typeof (entry as { html_url?: unknown }).html_url === "string" ? (entry as { html_url: string }).html_url : undefined
      return [{ ...parsed, source: "github" as const, ...(htmlUrl === undefined ? {} : { htmlUrl }) }]
    })
    return { issues, meta }
  }

  /** The source-only list read; the card carries the degradation note in `body`. */
  const listFromGithubSource = async (
    repo: string,
    filter: "open" | "closed" | "all"
  ): Promise<ViewResult> => {
    let response: Response
    try {
      response = await ctx.http(githubSourceIssuesPath(repo, filter))
    } catch (error) {
      return unreachable(`list issues for ${repo} from its GitHub source`, error)
    }
    // A source 404 too: the repo is nowhere — the plain honest error, no card.
    if (!response.ok) {
      return readRepositoryListError(response, `Listing issues for ${repo} failed (${response.status})`)
    }
    const body: unknown = await response.json().catch(() => null)
    if (!Array.isArray(body)) {
      return `The backend answered issues for ${repo} with an unreadable payload`
    }
    const issues = body.flatMap((entry) => {
      const parsed = parseGithubListRow(entry)
      return parsed === null ? [] : [parsed]
    })
    const card: Card = {
      id: `issues-${repo}`,
      kind: "issue-list",
      title: `Issues · ${repo}`,
      body: `Read from GitHub — import for full features: /repos.import ${repo}`,
      status: "active",
      createdAt: Date.now(),
      ordinal: ctx.nextOrdinal(),
      payload: { repo, filter, issues, github: {
        source: response.headers.get("x-metadata-source") ?? "github",
        syncedAt: response.headers.get("x-metadata-synced-at"),
        stale: response.headers.get("x-metadata-stale") === "true",
        syncError: response.headers.get("x-metadata-sync-error"),
        refusal: null
      } }
    }
    return { card, ...readResult(issues.length === 0
      ? `No ${filter === "all" ? "" : `${filter} `}issues in ${repo} (read from GitHub).`
      : issues.map((issue) => issueRowValue(issue, "github")).join("\n")) }
  }

  /** GitHub has a separate tracker. Its supported metadata routes expose full issue bodies in the list. */
  const readGithubIssue = async (repo: string, number: number): Promise<ViewResult> => {
    const listPath = githubSourceIssuesPath(repo, "all")
    let issue: Record<string, unknown> | undefined
    for (let page = 1; page <= 50; page += 1) {
      let response: Response
      try { response = await ctx.http(`${listPath}&per_page=100&page=${page}`) }
      catch (error) { return unreachable(`load GitHub issue #${number} in ${repo}`, error) }
      if (!response.ok) return readErrorMessage(response, `Loading GitHub issue #${number} failed (${response.status})`)
      const rows: unknown = await response.json().catch(() => null)
      if (!Array.isArray(rows)) return `GitHub answered issues for ${repo} with an unreadable payload`
      issue = rows.find((row): row is Record<string, unknown> => isRecord(row) && row.number === number && !("pull_request" in row))
      if (issue) break
      // Rebuild our own scoped route; never follow a server-provided host or path.
      if (!/rel="?next"?/.test(response.headers.get("link") ?? "")) break
    }
    if (!issue) return `GitHub issue #${number} in ${repo} was not found. Refresh the issue list and try again.`
    const comments: IssueCommentRow[] = []
    const commentsPath = `${listPath.split("?")[0]}/${number}/comments`
    for (let page = 1; page <= 50; page += 1) {
      let response: Response
      try { response = await ctx.http(`${commentsPath}?per_page=100&page=${page}`) }
      catch (error) { return unreachable(`load comments for GitHub issue #${number} in ${repo}`, error) }
      if (!response.ok) return readErrorMessage(response, `Loading GitHub issue comments failed (${response.status})`)
      const rows: unknown = await response.json().catch(() => null)
      if (!Array.isArray(rows)) return `GitHub answered comments for #${number} with an unreadable payload`
      comments.push(...rows.flatMap(githubCommentOf))
      if (!/rel="?next"?/.test(response.headers.get("link") ?? "")) break
      if (page === 50) return `GitHub issue #${number} has more comments than could be loaded. Open it on GitHub to read the full conversation.`
    }
    return githubIssueCard(repo, number, issue, comments)
  }

  /** The GitHub issue card and its model value, from GitHub's issue shape and its comments. */
  const githubIssueCard = (repo: string, number: number, issue: Record<string, unknown>, comments: ReadonlyArray<IssueCommentRow>): ViewResult => {
    const payload = parseDetail({ ...issue, author: issue.user }, repo, number, comments)!
    payload.source = "github"
    payload.htmlUrl = `https://github.com/${repo}/issues/${number}`
    const card: Card = {
      id: `issue-github-${repo}-${number}`, kind: "issue", title: `GitHub issue #${number} · ${repo}`,
      status: "active", createdAt: Date.now(), ordinal: ctx.nextOrdinal(), payload
    }
    return { card, ...readResult([
      `${repo} · GitHub #${number} ${payload.title} · ${payload.state}`,
      `Author: ${payload.author ?? "unknown"}`,
      `Labels: ${payload.labels.join(", ") || "none"}`, payload.issueBody,
      ...comments.map(comment => `Comment by ${comment.persona?.username ?? comment.author ?? "unknown"}:\n${comment.commentBody}`)
    ].join("\n")) }
  }

  /** An install's issues (GET /api/issues): its repository's GitHub issues, read through the install's App. */
  const listFromInstall = async (repo: string, filter: "open" | "closed" | "all"): Promise<ViewResult> => {
    let response: Response
    try {
      response = await ctx.http(`${ctx.baseUrl}/api/issues?state=${filter}`)
    } catch (error) {
      return unreachable(`list issues for ${repo}`, error)
    }
    if (!response.ok) return readRepositoryListError(response, `Listing issues for ${repo} failed (${response.status})`)
    const body: unknown = await response.json().catch(() => null)
    if (!Array.isArray(body)) return `The backend answered issues for ${repo} with an unreadable payload`
    const issues = body.flatMap((entry) => {
      const parsed = parseGithubListRow(entry)
      return parsed === null ? [] : [parsed]
    })
    const card: Card = {
      id: `issues-${repo}`, kind: "issue-list", title: `Issues · ${repo}`, status: "active",
      createdAt: Date.now(), ordinal: ctx.nextOrdinal(), payload: { repo, filter, issues }
    }
    return { card, ...readResult(issues.length === 0
      ? `No ${filter === "all" ? "" : `${filter} `}issues in ${repo}.`
      : issues.map((issue) => issueRowValue(issue, "github")).join("\n")) }
  }

  /** One of an install's issues with its comments (GET /api/issues/{n}). */
  const readInstallIssue = async (repo: string, number: number): Promise<ViewResult> => {
    const authorizationScope = issueAuthorizationScope(ctx)
    let response: Response
    try {
      response = await ctx.http(`${ctx.baseUrl}/api/issues/${number}`)
    } catch (error) {
      return unreachable(`load issue #${number} in ${repo}`, error)
    }
    if (!response.ok) return readErrorMessage(response, `Loading issue #${number} in ${repo} failed (${response.status})`)
    const body: unknown = await response.json().catch(() => null)
    if (!isRecord(body) || !isRecord(body.issue) || !Array.isArray(body.comments)) return `The backend answered issue #${number} in ${repo} with an unreadable payload`
    const result = githubIssueCard(repo, number, body.issue, body.comments.flatMap(githubCommentOf))
    if (typeof result !== "string" && result.card?.kind === "issue") {
      if (typeof body.issue_digest === "string") result.card.payload.issueDigest = body.issue_digest
      if (typeof body.make_todo_allowed === "boolean" && authorizationScope === issueAuthorizationScope(ctx)) {
        result.card.payload.makeTodoAllowed = body.make_todo_allowed
        result.card.payload.todoAuthorizationScope = authorizationScope
      }
    }
    return result
  }

  /** Fetches the issue AND its comments, then upserts the detail card. */
  const readIssue = async (repo: string, number: number): Promise<ViewResult> => {
    let issueResponse: Response
    try {
      issueResponse = await ctx.http(`${issuesPath(repo)}/${number}`)
    } catch (error) {
      return unreachable(`load issue #${number} in ${repo}`, error)
    }
    if (!issueResponse.ok) {
      if (issueResponse.status === 404) {
        return issue404(issueResponse, `Loading issue #${number} in ${repo} failed (404)`, nativeIssueMissing(repo, number), false)
      }
      return readErrorMessage(
        issueResponse,
        `Loading issue #${number} in ${repo} failed (${issueResponse.status})`
      )
    }
    const issueJson: unknown = await issueResponse.json().catch(() => null)

    const comments: IssueCommentRow[] = []
    let cursor = ""
    const seen = new Set<string>()
    for (let page = 1; page <= 50; page++) {
      let response: Response
      try {
        response = await ctx.http(`${issuesPath(repo)}/${number}/comments${cursor === "" ? "" : `?cursor=${encodeURIComponent(cursor)}`}`)
      } catch (error) { return unreachable(`load comments for issue #${number} in ${repo}`, error) }
      if (!response.ok) return readErrorMessage(response, `Loading comments for issue #${number} in ${repo} failed (${response.status})`)
      const rows: unknown = await response.json().catch(() => null)
      if (!Array.isArray(rows)) return `The backend answered comments for #${number} with an unreadable payload`
      comments.push(...rows.flatMap(row => { const parsed = parseComment(row); return parsed ? [parsed] : [] }))
      const next = /<([^>]+)>;\s*rel="?next"?/.exec(response.headers.get("link") ?? "")?.[1]
      if (!next) break
      // Read only the opaque cursor; never follow a returned origin or path.
      cursor = new URL(next, "https://pagination.invalid").searchParams.get("cursor") ?? ""
      if (!cursor || seen.has(cursor)) return `Comments for #${number} did not finish loading.`
      seen.add(cursor)
      if (page === 50) return `Issue #${number} has more comments than could be loaded.`
    }

    const payload = parseDetail(issueJson, repo, number, comments)
    if (payload === null) {
      return `The backend answered issue #${number} in ${repo} with an unreadable payload`
    }
    if (payload.kind === "chat") {
      for (const comment of payload.comments) {
        if (comment.id === undefined) continue
        const response = await ctx.http(`${issuesPath(repo)}/${number}/comments/${comment.id}/reactions`)
        if (!response.ok) {
          if (response.status === 404) continue
          return readErrorMessage(response, `Loading reactions failed (${response.status})`)
        }
        const rows: unknown = await response.json().catch(() => null)
        if (!Array.isArray(rows)) return "Reactions returned an unreadable response."
        comment.reactions = rows.flatMap(row => isRecord(row) && typeof row.name === "string" && typeof row.actor === "string" && typeof row.active === "boolean" ? [{ name: row.name, actor: row.actor, active: row.active }] : [])
      }
    }
    const card: Card = {
      id: `issue-${repo}-${number}`,
      kind: "issue",
      title: payload.kind === "chat" ? payload.title : `Issue #${number} · ${repo}`,
      status: "active",
      createdAt: Date.now(),
      ordinal: ctx.nextOrdinal(),
      payload
    }
    return { card, ...readResult([
      /*
       * Name the tracker beside the number, as the GitHub read already does
       * ("will/flows · GitHub #6"). A connected repository's two trackers
       * number independently, so a bare "will/flows · #6" read back as
       * GitHub's canonical #6 — the misreading that passed a Cloud-only
       * write off as upstream proof (#4022). A conversation has no second
       * tracker to be confused with and keeps its own words.
       */
      `${payload.repo} · ${payload.kind === "chat" ? "" : "Smithers Cloud "}#${payload.number} ${payload.title} · ${payload.state}`,
      `Author: ${payload.author ?? "unknown"}`,
      `Labels: ${payload.labels.join(", ") || "none"}`,

      payload.issueBody,
      ...payload.comments.map((comment) =>
        `Comment by ${comment.persona?.username ?? comment.author ?? "unknown"}${comment.createdAt ? ` · ${comment.createdAt}` : ""}:\n${comment.commentBody}`)
    ].join("\n")) }
  }

  /**
   * The saved issue views the repository's factory declares, or none when
   * the read fails: the chips are a door onto the list, and a view the
   * person selects reports its own failure through the list read.
   */
  const readIssueViews = async (repo: string): Promise<ReadonlyArray<{ readonly id: string; readonly title: string }>> => {
    try {
      const response = await ctx.http(issueViewsRoute(ctx, repo))
      if (!response.ok) return []
      const body: unknown = await response.json().catch(() => null)
      return Array.isArray(body) ? body.flatMap((entry) => { const view = parseIssueView(entry); return view === null ? [] : [view] }) : []
    } catch {
      return []
    }
  }

  /**
   * One list read, mounting nothing: the repository's own tracker, an
   * install's GitHub-App door, or the GitHub source a repository that is not
   * imported degrades to. `listView` renders its card from this; the search
   * index reads the same rows without a card (SearchSeam, §6).
   */
  const issueListRead = (repo: string, filter: "open" | "closed" | "all", kind: IssueKindFilter, named: string | undefined) => async (): Promise<ViewResult> => {
    // An install has no Smithers tracker, conversations or saved views: its issues are GitHub's.
    if (install) return listFromInstall(repo, filter)
    // Plue 422s unknown states ("all" included) — omit the param to list every state.
    const search = new URLSearchParams()
    if (named !== undefined) search.set("view", named)
    else if (filter !== "all") search.set("state", filter)
    // Conversations are owner-private and excluded from the plain list; ask for them by kind (chat = issues contract; #2111).
    if (kind === "conversation") search.set("kind", "chat")
    const query = search.size === 0 ? "" : `?${search}`
    let response: Response
    try {
      response = await ctx.http(`${issuesPath(repo)}${query}`)
    } catch (error) {
      return unreachable(`list issues for ${repo}`, error)
    }
    if (!response.ok) {
      // The imported namespace 404s ⇔ the repo isn't imported: degrade to
      // the GitHub-source list instead of surfacing a broken 404. A named
      // view 404s when it is not declared: that is the answer, not a fallback.
      if (response.status === 404 && named !== undefined) return readRepositoryListError(response, `Listing the ${named} view of ${repo} failed (${response.status})`)
      if (response.status === 404) return listFromGithubSource(repo, filter)
      if (response.status === 401) ctx.dispatch({ type: "card.removed", actor: ctx.actor(), id: `issues-${repo}` })
      return readRepositoryListError(response, `Listing issues for ${repo} failed (${response.status})`)
    }
    const body: unknown = await response.json().catch(() => null)
    if (!Array.isArray(body)) {
      return `The backend answered issues for ${repo} with an unreadable payload`
    }
    const native = body.flatMap((entry) => {
      const parsed = parseListRow(entry)
      return parsed === null ? [] : [{ ...parsed, source: "smithers-cloud" as const }]
    }).filter((row) => kind === "all" || (kind === "conversation" ? row.kind === "chat" : row.kind !== "chat"))
    /*
     * Smithers Cloud's /issues is the repository's OWN tracker and is correctly
     * empty for a repo mirrored from GitHub; the upstream issues live at
     * the GitHub-source route (synced store or live GitHub, per plue). One
     * list shows both, each row labeled with where it came from, and the
     * GitHub read's provenance rides the card. A GitHub refusal (not
     * linked, not mirrored) is stated, never a silent absence.
     */
    // Read before GitHub: a GitHub 401 re-probes the session, and the view must settle in the scope it started in.
    const views = await readIssueViews(repo)
    // Conversations and saved views live in Smithers' own tracker; GitHub's rows join the unfiltered and issues lists.
    const github = kind === "conversation" || named !== undefined ? { issues: [], meta: undefined } : await readGithubIssues(repo, filter)
    const issues = [...native, ...github.issues]
    const card: Card = {
      id: `issues-${repo}`,
      kind: "issue-list",
      title: kind === "conversation" ? `Conversations · ${repo}` : `Issues · ${repo}`,
      status: "active",
      createdAt: Date.now(),
      ordinal: ctx.nextOrdinal(),
      payload: {
        repo, filter, issues,
        ...(kind === "all" ? {} : { kind }),
        ...(github.meta === undefined ? {} : { github: github.meta }),
        ...(named === undefined ? {} : { view: named }),
        ...(views.length === 0 ? {} : { views: [...views] })
      }
    }
    return { card, ...readResult(issues.length === 0
      ? `No ${filter === "all" ? "" : `${filter} `}${kind === "conversation" ? "conversations" : "issues"} in ${repo}${github.meta?.refusal ? ` (GitHub: ${github.meta.refusal})` : ""}.`
      : issues.map((issue) => issueRowValue(issue)).join("\n")) }
  }

  const listView = preparedView(ctx, (filter: "open" | "closed" | "all", repoArg?: string, kind: IssueKindFilter = "all", view?: string) => {
    const target = resolveTargetRepo(ctx.store, repoOf(repoArg))
    if ("error" in target) return target.error
    const repo = target.repo
    // A saved view carries its own state and addresses Smithers' own tracker (the API refuses view with state).
    const named = view === undefined || view === "" ? undefined : view
    return { id: `issues-${repo}`, title: `Issues · ${repo}`, key: JSON.stringify(["issues", repo, filter, kind, named ?? null]), pane: repo, read: issueListRead(repo, filter, kind, named) }
  })
  const issueView = preparedView(ctx, (number: number, repoArg?: string, asked?: "smithers-cloud" | "github") => {
    const target = resolveTargetRepo(ctx.store, repoOf(repoArg))
    if ("error" in target) return target.error
    const repo = target.repo
    /*
     * Every issue on an install is a GitHub issue; off an install an asked
     * source wins, and otherwise the repository's own declared tracker reads
     * the tracker the number actually belongs to. A recorded private
     * conversation keeps the Cloud card below (`bound`/`project`), so an
     * imported repository's tracker never opens one on GitHub.
     */
    const source = issueReadSource(repo, number, asked)
    const bound = [...ctx.store.collections.cards.values()].find(card => card.kind === "issue" && card.payload.conversation && card.payload.repo === repo && card.payload.number === number && source !== "github")
    return { id: `issue-${source === "github" ? "github-" : ""}${repo}-${number}`, title: `Issue #${number} · ${repo}`, pane: repo, ...(bound ? { target: bound } : {}),
      project: card => {
        if (card.kind !== "issue") return card
        const previous = [...ctx.store.collections.cards.values()].find(row => row.kind === "issue" && row.payload.source !== "github" && row.payload.repo === repo && row.payload.number === number)
        return previous?.kind === "issue" && source !== "github" ? { ...card, payload: { ...card.payload, conversation: previous.payload.conversation, commentDraft: previous.payload.commentDraft, pendingComments: previous.payload.pendingComments } } : card
      },
      read: () => install ? readInstallIssue(repo, number) : source === "github" ? readGithubIssue(repo, number) : readIssue(repo, number) }
  })
  /*
   * Every caller here is on a Smithers Cloud path — the Cloud branch of
   * `viewIssue`, and the re-reads after a Cloud PATCH/POST — so the tracker
   * is named rather than resolved again: a refresh always re-reads the
   * tracker its own mutation addressed.
   */
  const showIssue = (repo: string, number: number) => issueView(number, repo, "smithers-cloud")

  /** Re-fetch after a successful mutation; a refresh failure still states the mutation happened. */
  const refreshDetail = async (
    done: string,
    repo: string,
    number: number
  ): Promise<string | void> => {
    invalidatePreparedViews(ctx.store)
    const outcome = await showIssue(repo, number)
    if (typeof outcome === "string") return `${done}, but refreshing the card failed: ${outcome}`
  }

  const showCommentNotice = (
    key: string,
    title: string,
    detail: string,
    action?: { readonly label: string; readonly flow: "issues.view"; readonly args: string }
  ): void => {
    ctx.dispatch({ type: "toast.shown", actor: "system", key, title, action })
    if (ctx.resolveToast) ctx.resolveToast(key, { status: "failed", detail, action })
    else ctx.dispatch({ type: "toast.resolved", actor: "system", key, status: "failed", detail, action })
  }

  const refreshCommentDetail = async (repo: string, number: number): Promise<void | { readonly value: string }> => {
    invalidatePreparedViews(ctx.store)
    let failure: string | undefined
    try {
      const outcome = await showIssue(repo, number)
      if (typeof outcome === "string") failure = outcome
    } catch {
      failure = "The issue could not be reloaded."
    }
    if (failure === undefined) return
    const detail = `Refresh failed: ${failure}`
    const key = `issue.comment.refresh:${repo}:${number}`
    const action = { label: "Retry", flow: "issues.view" as const, args: `${number} ${repo}` }
    showCommentNotice(key, "Comment posted", detail, action)
    return { value: `Comment posted. ${detail}` }
  }

  const mutateComment = async (number: number, commentId: number, explicitRepo: string | undefined, method: "PATCH" | "DELETE", body?: { body: string }): Promise<string | void | { readonly value: string }> => {
    const target = resolveTargetRepo(ctx.store, repoOf(explicitRepo))
    if ("error" in target) return target.error
    const { repo } = target
    // The global comment route does not carry the issue number. Only mutate a
    // comment from the issue card's authoritative read, never an unrelated ID.
    const comment = [...ctx.store.collections.cards.values()].some(card => card.kind === "issue" && card.payload.source !== "github" && card.payload.repo === repo && card.payload.number === number && card.payload.comments.some(row => row.id === commentId))
    const tracker = issueWriteTarget(repo, number)
    if ("refusal" in tracker) return tracker.refusal
    if (!comment && tracker.source === "github") {
      /*
       * A GitHub comment is edited in place through the canonical durable
       * writer, keyed by the comment id the issue card's own read carries.
       * GitHub lets only a comment's author edit it, so a person's own
       * comment answers GitHub's refusal rather than being rewritten by the
       * App on their behalf. There is no delete: GitHub keeps the comment.
       */
      const edited = [...ctx.store.collections.cards.values()].some(card => card.kind === "issue" && card.payload.source === "github" &&
        card.payload.repo === repo && card.payload.number === number && card.payload.comments.some(row => row.id === commentId))
      if (!edited) return "Open the message before changing it."
      if (method === "DELETE") return `GitHub keeps its comments. Edit the message on #${number} in ${repo} instead.`
      return sendGitHubIssueAct(
        "comment", `Issue #${number}`, repo,
        `comment.edit:${repo}#${number}:${commentId}:${body?.body ?? ""}`, `/comments/${commentId}`, "PATCH",
        `Edit of the message on issue #${number} in ${repo}`,
        `Changing the message on issue #${number} in ${repo} failed`,
        { body: body?.body ?? "" }
      )
    }
    if (!comment) return "Open the message before changing it."
    let response: Response
    try {
      response = await ctx.http(`${issuesPath(repo)}/comments/${commentId}`, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) })
    } catch { return "Message status unknown: nothing answered. Refresh to check." }
    if (!response.ok) return readErrorMessage(response, `Changing the message failed (${response.status})`)
    await response.body?.cancel().catch(() => {})
    return refreshDetail(method === "DELETE" ? "Message deleted" : "Message saved", repo, number)
  }

  const updateLocalIssue = async (cardId: string, update: (payload: IssuePayload) => IssuePayload, actor: "user" | "smithers" | "system" = ctx.actor(), authoritative = false) => {
    const card = ctx.store.collections.cards.get(cardId)
    if (card?.kind !== "issue") return
    await ctx.dispatch({ type: authoritative ? "card.view.loaded" : "card.upsert", actor, card: { ...card, payload: update(card.payload) } }).isPersisted.promise
  }
  const drainComments = (cardId: string): void => {
    if (ctx.isDisposed?.() || !(ctx.store.collections.identitySessions.get("identity")?.state === "signed-in" || ctx.store.collections.cloudSessions.get("cloud")?.state === "signed-in")) return
    let active = issueMessageWrites.get(ctx.store)
    if (!active) issueMessageWrites.set(ctx.store, active = new Set())
    if (active.has(cardId)) return
    const card = ctx.store.collections.cards.get(cardId)
    if (card?.kind !== "issue" || !card.payload.pendingComments?.some(request => request.status === "requested")) return
    const first = card.payload.pendingComments?.find(row => row.status === "requested" && !row.turnId) ?? card.payload.pendingComments?.find(row => row.status === "requested")
    if (first?.turnId && ctx.store.session().phase !== "idle") return
    const ownerValid = captureCloudOwner(ctx, false)
    const requestOwner = first?.owner ?? card.payload.conversation?.owner ?? card.payload.author
    const currentOwner = () => ownerValid() && requestOwner !== undefined && requestOwner !== null && requestOwner === signedInOwner() && (!card.payload.conversation || card.payload.conversation.owner === requestOwner && card.payload.conversation.branchId === ctx.store.session().activeBranchId)
    if (!currentOwner()) return
    active.add(cardId)
    const send = async () => {
      while (currentOwner()) {
        const current = ctx.store.collections.cards.get(cardId)
        if (current?.kind !== "issue") break
        const request = current.payload.pendingComments?.find(row => row.status === "requested" && !row.turnId) ?? current.payload.pendingComments?.find(row => row.status === "requested")
        if (!request || (request.owner ?? current.payload.conversation?.owner ?? current.payload.author) !== signedInOwner() || request.turnId && ctx.store.session().phase !== "idle") break
        const sameThread = () => {
          const live = ctx.store.collections.cards.get(cardId)
          return currentOwner() && live?.kind === "issue" && live.payload.repo === current.payload.repo && (live.payload.number === current.payload.number || current.payload.number === 0 && live.payload.conversation?.creationKey === current.payload.conversation?.creationKey)
        }
        const fail = async (status: "unknown" | "failed", error: string) => {
          if (!sameThread()) return
          await updateLocalIssue(cardId, payload => ({ ...payload, pendingComments: payload.pendingComments?.map(row => row.id === request.id ? { ...row, status, error } : row) }), "system")
          return error
        }
        const work = async () => {
          let number = current.payload.number
          if (number === 0 && current.payload.conversation) {
            let created: Response
            try {
              created = await ctx.http(issuesPath(current.payload.repo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: current.payload.title, kind: "chat", visibility: "private", idempotency_key: current.payload.conversation.creationKey }) })
            } catch { return fail("unknown", "Chat status unknown: nothing answered. Retry to check.") }
            if (!currentOwner()) return
            if (!created.ok) return fail("failed", await readErrorMessage(created, `Creating chat failed (${created.status})`))
            const body: unknown = await created.json().catch(() => null)
            if (!sameThread()) return
            if (!isRecord(body) || asInt(body.number) === null) return fail("unknown", "Chat returned an unreadable receipt.")
            number = body.number as number
            await updateLocalIssue(cardId, payload => ({ ...payload, number }), "system")
          }
          if (!sameThread()) return
          let response: Response
          const editing = current.payload.comments.find(comment => comment.idempotencyKey === request.id && comment.commentBody !== request.text)
          try {
            response = await ctx.http(editing ? `${issuesPath(current.payload.repo)}/comments/${editing.id}` : `${issuesPath(current.payload.repo)}/${number}/comments`, {
              method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify(editing ? { body: request.text } : { body: request.text, idempotency_key: request.id, ...(request.persona ? { persona: request.persona } : {}) })
            })
          } catch { return fail("unknown", "Message status unknown: nothing answered. Retry to check.") }
          if (!sameThread()) return
          if (!response.ok) return fail("failed", await readErrorMessage(response, `Posting the message failed (${response.status})`))
          const receipt: unknown = await response.json().catch(() => null)
          if (!sameThread()) return
          const commentId = isRecord(receipt) ? asInt(receipt.id) : null
          if (commentId === null) return fail("unknown", "Message posted without a readable receipt. Retry to reconcile.")
          const result = await readIssue(current.payload.repo, number)
          if (!sameThread()) return
          if (typeof result === "string") return fail("unknown", `Message posted. ${result}`)
          if (result.card.kind !== "issue") return
          const loaded = result.card.payload
          const posted = loaded.comments.find(comment => comment.id === commentId)
          if (!posted) return fail("unknown", "Message posted. Refresh is incomplete; retry to reconcile.")
          posted.idempotencyKey ??= request.id
          await updateLocalIssue(cardId, payload => ({ ...loaded, conversation: payload.conversation, commentDraft: payload.commentDraft, pendingComments: payload.pendingComments }), "system", true)
          if (!sameThread()) return
          if (request.turnId && current.payload.conversation && launchConversationTurn) {
            const accepted = await launchConversationTurn(request.text, request.turnId, current.payload.conversation.owner)
            if (accepted === false) return fail("failed", "Message saved. Retry to start the response.")
          }
          if (sameThread()) await updateLocalIssue(cardId, payload => ({ ...payload, pendingComments: payload.pendingComments?.filter(row => row.id !== request.id) }), "system")
        }
        if (ctx.withToast) await ctx.withToast(`issue.message:${request.id}`, "Saving message", "Message saved", work, false, currentOwner, cardId)
        else await work()
      }
    }
    void send().catch(async () => {
      if (!currentOwner()) return
      const current = ctx.store.collections.cards.get(cardId)
      const request = current?.kind === "issue" ? current.payload.pendingComments?.find(row => row.status === "requested") : undefined
      if (request) await updateLocalIssue(cardId, payload => ({ ...payload, pendingComments: payload.pendingComments?.map(row => row.id === request.id ? { ...row, status: "unknown", error: "Message status unknown. Retry to check." } : row) }), "system")
    }).finally(() => { active!.delete(cardId); if (currentOwner()) drainComments(cardId) })
  }

  // Remote issue comments are authoritative. Restored cards reconnect through
  // the same read path; a poll is only a projection refresh, never a chat store.
  const subscribe: IssuesSeam["subscribe"] = onDispose => {
    const watches = new Map<string, { stop: () => void; address: string }>()
    let disposed = false
    const reconcile = () => {
      if (disposed) return
      const signedIn = ctx.store.collections.identitySessions.get("identity")?.state === "signed-in"
        || ctx.store.collections.cloudSessions.get("cloud")?.state === "signed-in"
      const cards = [...ctx.store.collections.cards.values()].flatMap(card => signedIn && card.kind === "issue" && card.payload.kind === "chat" && card.payload.source !== "github" && !card.loading && (!card.payload.conversation || card.payload.conversation.owner === signedInOwner() && card.payload.conversation.branchId === ctx.store.session().activeBranchId) ? [card] : [])
      const wanted = new Map(cards.map(card => [card.id, `${card.payload.repo}:${card.payload.number}`]))
      for (const [id, watch] of watches) if (wanted.get(id) !== watch.address) { watch.stop(); watches.delete(id) }
      for (const card of cards) {
        if (card.payload.conversation && card.payload.comments.some(comment => comment.idempotencyKey === `message-${ctx.store.session().turnId}-user`)) {
          const owner = ctx.store.collections.identitySessions.get("identity")?.login ?? ctx.store.collections.cloudSessions.get("cloud")?.username
          if (card.payload.conversation.owner === owner && card.payload.conversation.branchId === ctx.store.session().activeBranchId) {
            // Streamed reply text is compared and posted trimmed: the backend stores strings.TrimSpace(body), so an untrimmed compare would re-post and PATCH the same comment forever.
            const reply = ctx.store.session().phase === "idle" ? [...ctx.store.collections.messages.values()].find(message => message.role === "smithers" && message.id === `message-${ctx.store.session().turnId}-smithers` && !message.issueCardId && message.createdAt >= card.createdAt && message.text.trim() !== "" && !card.payload.pendingComments?.some(row => row.id === message.id) && !card.payload.comments.some(row => row.idempotencyKey === message.id && row.commentBody === message.text.trim())) : undefined
            const steering = [...ctx.store.collections.messages.values()].find(message => message.id.startsWith("message-steer-") && message.ordinal > (ctx.store.collections.messages.get(`message-${ctx.store.session().turnId}-user`)?.ordinal ?? Number.MAX_SAFE_INTEGER) && !message.issueCardId && !card.payload.pendingComments?.some(row => row.id === message.id) && !card.payload.comments.some(row => row.idempotencyKey === message.id))
            if (steering) void updateLocalIssue(card.id, payload => ({ ...payload, pendingComments: [...(payload.pendingComments ?? []), { id: steering.id, text: steering.text, owner, actor: "user", status: "requested" }] }), "user")
            if (reply) {
              void updateLocalIssue(card.id, payload => ({ ...payload, pendingComments: [...(payload.pendingComments ?? []), { id: reply.id, text: reply.text.trim(), owner, actor: "smithers", persona: { username: "Smithers" }, status: "requested" }] }), "smithers")
            }
          }
        }
        drainComments(card.id)
        if (card.payload.number === 0) continue
        if (watches.has(card.id)) continue
        let stopped = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const currentOwner = captureCloudOwner(ctx, false)
        const valid = () => !disposed && !stopped && currentOwner() && ctx.store.collections.cards.get(card.id)?.kind === "issue"
        const stop = () => { stopped = true; clearTimeout(timer) }
        watches.set(card.id, { stop, address: `${card.payload.repo}:${card.payload.number}` })
        const poll = async () => {
          if (!valid()) { stop(); watches.delete(card.id); return }
          const work = async () => {
            const started = ctx.store.collections.cards.get(card.id)
            if (started?.kind !== "issue") return
            const startedPayload = JSON.stringify(started.payload)
            const result = await readIssue(card.payload.repo, card.payload.number)
            if (!valid()) return
            if (typeof result === "string") return result
            const previous = ctx.store.collections.cards.get(card.id)
            if (previous?.kind !== "issue" || result.card.kind !== "issue" || previous.payload.number !== card.payload.number || previous.payload.repo !== card.payload.repo || JSON.stringify(previous.payload) !== startedPayload) return
            const payload = { ...result.card.payload, conversation: previous.payload.conversation, commentDraft: previous.payload.commentDraft, pendingComments: previous.payload.pendingComments }
            if (JSON.stringify(previous.payload) === JSON.stringify(payload)) return
            await ctx.dispatch({ type: "card.view.loaded", actor: "system", card: { ...previous, title: result.card.title, payload } }).isPersisted.promise
          }
          try {
            if (ctx.withToast) await ctx.withToast(`issue.sync:${card.id}`, "Syncing messages", "Messages synced", work, true, valid, card.id)
            else await work()
          } catch { /* The next authoritative read recovers transient transport errors. */ }
          if (valid()) timer = setTimeout(() => { void poll() }, 2_000)
        }
        timer = setTimeout(() => { void poll() }, 2_000)
      }
    }
    const schedule = () => queueMicrotask(reconcile)
    const changes = ctx.store.collections.cards.subscribeChanges(schedule)
    const session = ctx.store.collections.sessions.subscribeChanges(schedule)
    let ownerValid = captureCloudOwner(ctx, false)
    const retire = () => {
      if (!ownerValid()) {
        for (const watch of watches.values()) watch.stop()
        watches.clear()
        ownerValid = captureCloudOwner(ctx, false)
      }
      schedule()
    }
    const identity = ctx.store.collections.identitySessions.subscribeChanges(retire)
    const cloud = ctx.store.collections.cloudSessions.subscribeChanges(retire)
    reconcile()
    onDispose(() => { disposed = true; changes.unsubscribe(); session.unsubscribe(); identity.unsubscribe(); cloud.unsubscribe(); for (const watch of watches.values()) watch.stop(); watches.clear() })
  }

  return {
    readInstallIssue,
    submitConversation: async (text, turnId, repo, owner) => {
      if (!text.trim() || !owner || signedInOwner() !== owner || ctx.isDisposed?.()) return false
      const branchId = ctx.store.session().activeBranchId ?? "branch-main"
      const existing = [...ctx.store.collections.cards.values()].find(card => card.kind === "issue" && card.payload.conversation?.branchId === branchId && card.payload.conversation.owner === owner && card.payload.repo === repo)
      const cardId = existing?.id ?? `conversation-issue:${randomUuid()}`
      const request = { id: `message-${turnId}-user`, text, turnId, owner, actor: ctx.actor(), status: "requested" as const }
      if (existing?.kind === "issue") {
        if (existing.payload.pendingComments?.some(row => row.id === request.id || row.text === text && row.status === "requested")) return true
        await updateLocalIssue(cardId, payload => ({ ...payload, pendingComments: [...(payload.pendingComments ?? []), request] }))
      } else {
        await ctx.dispatch({ type: "card.upsert", actor: ctx.actor(), card: {
          id: cardId, kind: "issue", title: "Chat", status: "active", createdAt: Date.now(), ordinal: ctx.nextOrdinal(),
          payload: { repo, number: 0, kind: "chat", visibility: "private", title: "Chat", state: "open", author: owner, issueBody: "", labels: [], comments: [],
            conversation: { branchId, owner, creationKey: cardId }, pendingComments: [request] }
        } }).isPersisted.promise
      }
      await ctx.dispatch({ type: "composer.changed", actor: ctx.actor(), draft: "" }).isPersisted.promise
      drainComments(cardId)
      return true
    },
    subscribe,
    draftIssueComment: async (cardId, text) => { await updateLocalIssue(cardId, payload => ({ ...payload, commentDraft: text })) },
    listIssues: Object.assign((filter: "open" | "closed" | "all", explicitRepo?: string, kind?: IssueKindFilter, view?: string) => repositoryListRead(ctx, "issues", repoOf(explicitRepo), filter, renderRepositoryForm, (repo) => listView(filter, repo, kind ?? "all", view),
      [filter, kind === undefined || kind === "all" ? undefined : `--kind ${kind}`, view === undefined || view === "" ? undefined : `--view ${view}`].filter((part) => part !== undefined).join(" ")), { preload: listView.preload }),

    readIssueRows: async (repo, filter) => {
      let result: ViewResult
      try {
        result = await issueListRead(repo, filter, "all", undefined)()
      } catch (error) {
        /*
         * The one door that does not ANSWER its refusal: a 401 on the
         * repository's own tracker makes `readRepositoryListError` THROW
         * `RepositorySignInRequired`, so the prepared-view machinery can
         * offer the sign-in step and `repositoryListRead` can catch it for
         * `/issues`. This index door calls the read directly and caught
         * nothing, so an expired session escaped the index as a rejection:
         * `search.issues` presented its own internal-bug copy ("Smithers hit
         * a bug of its own, so that didn't finish") for a person who merely
         * needed to sign in, and the ring recorded NOTHING — the one outcome
         * the record above exists to name.
         *
         * The registry's sentence, never the 401's words: the rule
         * `repositoryListRead` already follows where a host has no sign-in
         * door. Any other throw is not this door's to answer.
         */
        if (!signInRequired(error)) throw error
        reportIssueIndex(ctx, "sign_in_required")
        return presentAppFailure(error, () => {}).sentence
      }
      if (typeof result === "string") { reportIssueIndex(ctx, "read_refused"); return result }
      if (result.card.kind !== "issue-list") {
        reportIssueIndex(ctx, "unreadable_view")
        return ISSUE_INDEX_UNREADABLE
      }
      const { issues, github } = result.card.payload
      /*
       * Rows, or the sentence a door answered instead — never a silent empty.
       * One read serves the list card and this index, and it already knows
       * the difference: `github.refusal` is the GitHub source's own answer,
       * which the CARD states beside the rows it did establish. Taking the
       * rows alone made a repository whose own tracker is correctly empty
       * and whose source REFUSED indistinguishable from a tracker that
       * listed nothing, and `search.issues` answered `0 results` for it
       * ([#3891](https://github.com/smithersai/smithers/issues/3891), still
       * reproducing on 2026-10-15 while `/issue 5` opened that very issue).
       * "0 results" claims every door answered and held nothing; a door that
       * refused has not answered, so its sentence is the answer, exactly as
       * `secrets` and `history` do through SearchSeam's `readRefused`.
       *
       * Rows the tracker DID establish still answer: a refusal beside them
       * is already on their own card, and this door indexes facts.
       */
      if (issues.length === 0 && github?.refusal !== undefined && github.refusal !== null) {
        reportIssueIndex(ctx, "source_refused")
        return github.refusal
      }
      reportIssueIndex(ctx, issues.length === 0 ? "empty" : "rows", issues)
      return issues
    },

    readTodoIssue: async (number, repo) => {
      const result = await (install ? readInstallIssue(repo, number) : readGithubIssue(repo, number))
      if (typeof result === "string") return result
      return result.card?.kind === "issue" ? result.card.payload : "Could not read this issue."
    },
    viewIssue: Object.assign(async (number: number, explicitRepo?: string, source?: "smithers-cloud" | "github") => {
      const target = resolveTargetRepo(ctx.store, repoOf(explicitRepo))
      if ("error" in target) return target.error
      /*
       * The same resolution the card itself takes, so the metadata read and
       * the card never address two different trackers for one number.
       */
      if (issueReadSource(target.repo, number, source) === "github") {
        return readRepositoryDetail(ctx, target.repo, "issue", number,
          () => issueView(number, target.repo, "github"), "github")
      }
      const shown = await readRepositoryDetail(ctx, target.repo, "issue", number, () => showIssue(target.repo, number), "smithers")
      return shown
    }, { preload: issueView.preload }),

    issueWriteTarget: repo => resolveTargetRepo(ctx.store, repo),

    createIssue: async (title, explicitRepo, kind, source) => {
      const target = resolveTargetRepo(ctx.store, repoOf(explicitRepo))
      if ("error" in target) return target.error
      const { repo } = target
      // A conversation is owner-private and MUST never reach GitHub (§3.1).
      if (source === "github" && kind === "chat") return `A conversation stays in ${repo}'s Smithers Cloud tracker; GitHub has no private conversations.`
      /*
       * A new issue has no number yet, so there is nothing recorded to read a
       * source off: the repository's own tracker decides. An install's
       * repository is a connected GitHub repository, so its ordinary issues
       * are GitHub's, and the create goes through the canonical durable
       * writer — the same door `/issue.new` uses, which opens the issue
       * GitHub actually numbered.
       */
      if (kind !== "chat" && (source === "github" || source === undefined && install)) {
        // An install's create goes through IssueCreateSeam, the door
        // `/issue.new` already uses. Every other origin addresses the
        // repository's own GitHub tracker, which answers the same durable
        // receipt; neither opens a Smithers Cloud row and reports its number.
        if (options.requestGitHubIssue !== undefined) return options.requestGitHubIssue(title, "")
        return sendGitHubIssueAct(
          "create", `"${title}"`, repo,
          `create:${repo}:${title}`, "", "POST",
          `Opening "${title}" in ${repo}'s GitHub tracker`,
          `Creating the issue in ${repo}'s GitHub tracker failed`,
          { title, body: "" }
        )
      }
      let response: Response
      try {
        response = await ctx.http(issuesPath(repo), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, ...(kind === "chat" ? { kind, visibility: "private" } : {}) })
        })
      } catch (error) {
        return unreachable(`create an issue in ${repo}`, error)
      }
      if (!response.ok) {
        // Mutations never fall back — the GitHub-source proxy is GET-only.
        if (response.status === 404) return issue404(response, `Creating the issue in ${repo} failed (404)`, `${repo} was not found`)
        return readErrorMessage(response, `Creating the issue in ${repo} failed (${response.status})`)
      }
      const body: unknown = await response.json().catch(() => null)
      const created = isRecord(body) ? asInt(body.number) : null
      if (created === null) {
        return `The issue was created in ${repo}, but the backend answered with an unreadable payload`
      }
      /*
       * Name the tracker, not just the repository. A connected repository
       * carries GitHub's issues beside these, numbered independently, so
       * "Issue #6 was created in owner/name" reads as GitHub's canonical #6
       * to the person and to an agent quoting the answer back — the exact
       * misreading that passed a Cloud-only write off as GitHub proof.
       */
      return refreshDetail(`Issue #${created} was created in ${repo}'s Smithers Cloud tracker`, repo, created)
    },

    setIssueState: async (number, state, explicitRepo, source) => {
      const target = resolveTargetRepo(ctx.store, repoOf(explicitRepo))
      if ("error" in target) return target.error
      const { repo } = target
      const tracker = issueWriteTarget(repo, number, source)
      if ("refusal" in tracker) return tracker.refusal
      if (tracker.source === "github") {
        /*
         * GitHub holds an issue open or closed and nothing else. Fixed and
         * verified are Smithers Cloud's own stages, so naming one for a
         * GitHub issue is refused rather than sent as a close.
         */
        if (state === "fixed" || state === "verified") {
          return `GitHub issues are open or closed; ${state} is a Smithers Cloud stage. Close #${number} in ${repo}, or add --source smithers-cloud.`
        }
        const verb = state === "closed" ? "Closing" : "Reopening"
        return sendGitHubIssueAct(
          "state", `Issue #${number}`, repo,
          `${state === "closed" ? "close" : "reopen"}:${repo}#${number}`,
          `/${number}/${state === "closed" ? "close" : "reopen"}`, "POST",
          `${verb} issue #${number} in ${repo}`,
          `Could not ${state === "closed" ? "close" : "reopen"} issue #${number} in ${repo}`
        )
      }
      const verb = state === "closed" ? "close" : state === "fixed" ? "mark fixed" : state === "verified" ? "verify" : "reopen"
      let response: Response
      try {
        response = await ctx.http(`${issuesPath(repo)}/${number}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state })
        })
      } catch (error) {
        return unreachable(`${verb} issue #${number} in ${repo}`, error)
      }
      if (!response.ok) {
        // Mutations never fall back — the GitHub-source proxy is GET-only.
        if (response.status === 404) return issue404(response, `Could not ${verb} issue #${number} in ${repo} (404)`, `Issue #${number} in ${repo} was not found`)
        return readErrorMessage(
          response,
          `Could not ${verb} issue #${number} in ${repo} (${response.status})`
        )
      }
      // The re-fetch below states the new truth; the PATCH echo is not read.
      await response.body?.cancel()
      return refreshDetail(`Issue #${number} in ${repo} is now ${state}`, repo, number)
    },

    transitionIssue: async (number, transition, explicitRepo) => {
      const target = resolveTargetRepo(ctx.store, repoOf(explicitRepo))
      if ("error" in target) return target.error
      const { repo } = target
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(transition)) {
        /*
         * #4068: this pointed at `/issues.transitions <repo>`, which no
         * registry declares. The transitions are the repository's own
         * declaration, so the refusal names that source instead of a door.
         */
        return `${transition} is not a transition id. ${repo} declares its transitions in .smithers/FACTORY.ts.`
      }
      /*
       * The declared states are GitHub labels, so a transition is a GitHub
       * act whatever the number's other tracker holds. A recorded private
       * conversation is never GitHub's, and asking to move one is refused
       * rather than crossed.
       */
      const tracker = issueWriteTarget(repo, number, "github")
      if ("refusal" in tracker) return tracker.refusal
      return sendGitHubIssueAct(
        "transition", `Issue #${number}`, repo,
        `transition:${repo}#${number}:${transition}`,
        `/${number}/transitions/${encodeURIComponent(transition)}`, "POST",
        `Moving issue #${number} in ${repo} through ${transition}`,
        `Could not move issue #${number} in ${repo} through ${transition}`
      )
    },

    editIssueComment: async (number, commentId, text, explicitRepo) => {
      if (!text.trim()) return "Write a message before saving it."
      return mutateComment(number, commentId, explicitRepo, "PATCH", { body: text })
    },
    deleteIssueComment: async (number, commentId, explicitRepo) => mutateComment(number, commentId, explicitRepo, "DELETE"),

    commentOnIssue: async (number, text, explicitRepo, persona, source) => {
      if (text.trim() === "") return "Write a comment before posting it."
      const target = resolveTargetRepo(ctx.store, repoOf(explicitRepo))
      if ("error" in target) return target.error
      const { repo } = target
      /*
       * A conversation is owner-private; its messages MUST never leave for
       * GitHub, not even when a command names the GitHub source (an agent
       * replaying `--source github` over a chat number, a stale card id).
       * The private row has no GitHub counterpart, so `issueWriteTarget`
       * refuses, never quietly redirects the message into the chat.
       */
      const tracker = issueWriteTarget(repo, number, source)
      if ("refusal" in tracker) return tracker.refusal
      if (tracker.source === "github") {
        return sendGitHubIssueAct(
          "comment", `Issue #${number}`, repo,
          `comment:${repo}#${number}:${text}`, `/${number}/comments`, "POST",
          `Comment on issue #${number} in ${repo}`,
          `Commenting on issue #${number} in ${repo} failed`,
          { body: text }
        )
      }
      const chat = [...ctx.store.collections.cards.values()].find(card => card.kind === "issue" && card.payload.kind === "chat" && card.payload.source !== "github" && card.payload.repo === repo && card.payload.number === number)
      if (chat?.kind === "issue") {
        if (chat.payload.pendingComments?.some(row => row.text === text && row.status === "requested" && JSON.stringify(row.persona) === JSON.stringify(persona))) return { value: "Requested" }
        const owner = signedInOwner()
        if (!owner) return "Sign in before sending a message."
        const request = { id: randomUuid(), text, owner, actor: ctx.actor(), status: "requested" as const, ...(persona ? { persona } : {}) }
        await updateLocalIssue(chat.id, payload => ({ ...payload, commentDraft: "", pendingComments: [...(payload.pendingComments ?? []), request] }))
        drainComments(chat.id)
        return { value: "Requested" }
      }
      let response: Response
      try {
        response = await ctx.http(`${issuesPath(repo)}/${number}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: text, ...(persona ? { persona } : {}) })
        })
      } catch {
        const detail = `No response from issue #${number} in ${repo}.`
        showCommentNotice(`issue.comment.unknown:${repo}:${number}`, "Comment status unknown", detail)
        return { value: `Comment status unknown. ${detail}` }
      }
      if (!response.ok) {
        // Mutations never fall back — the GitHub-source proxy is GET-only.
        if (response.status === 404) return issue404(response, `Commenting on issue #${number} in ${repo} failed (404)`, `Issue #${number} in ${repo} was not found`)
        return readErrorMessage(
          response,
          `Commenting on issue #${number} in ${repo} failed (${response.status})`
        )
      }
      // The re-fetch below re-lists the comments; the POST echo is not read.
      await response.body?.cancel().catch(() => {})
      return refreshCommentDetail(repo, number)
    },

  }
}
