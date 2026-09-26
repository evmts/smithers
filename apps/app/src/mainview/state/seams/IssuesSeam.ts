import { invalidatePreparedViews,preparedView,type ViewAction,type ViewResult } from "../PreparedView"
import { readRepositoryDetail } from "../RepositoryReadReceipts"
import { readRepositoryListError,repositoryListRead,type RepositoryForm } from "./RepositoryListSeam"

import type { Card } from "../AppState"
import { repositoryCiConfigured } from "../RepositoryJobs"
import { resolveTargetRepo } from "../RepoContext"
import type { SeamContext } from "./SeamContext"
import { captureCloudOwner,errorMessage,errorText,readErrorMessage,readResult,unreachableSentence } from "./SeamContext"
import { refusalOf } from "@smthrs/rpc/Refusal"
import type { PersonaRef } from "@smthrs/rpc/Threads"

/** Which threads a list shows: every issue, only chats, or only tasks (smithers-ui-DESIGN.md §3.1). */
export type IssueKindFilter = "all" | "chat" | "task"
/** The backend's issue states; a task moves open → fixed → verified → closed. */
export type IssueState = "open" | "fixed" | "verified" | "closed"

export interface IssuesSeam {
  /** Renders the list card and answers the rows as text (the model reads the value, never the card). */
  readonly listIssues: ViewAction<[filter: "open" | "closed" | "all", repo?: string, kind?: IssueKindFilter]>
  readonly viewIssue: ViewAction<[number: number, repo?: string, source?: "smithers-cloud" | "github"]>
  readonly createIssue: (title: string, repo?: string, kind?: "issue" | "chat") => Promise<string | void>
  readonly setIssueState: (
    number: number,
    state: IssueState,
    repo?: string
  ) => Promise<string | void>
  readonly commentOnIssue: (number: number, text: string, repo?: string) => Promise<string | void | { readonly value: string }>
  /*
   * Threads (smithers-ui-DESIGN.md §3.1): a chat issue's sends are pending
   * rows the drain posts with an idempotency key; a failed or unknown send is
   * retried by the person; reactions ride the comment reactions route; task
   * metadata rides the issue PATCH. Visible chat cards re-read on a cadence.
   */
  readonly retryIssueComment: (cardId: string, requestId: string) => Promise<string | void>
  readonly reactToIssueComment: (number: number, commentId: string, name: string, active: boolean, repo?: string) => Promise<string | void>
  readonly setIssueTask: (number: number, field: "owner" | "due" | "priority" | "parent", value: string, repo?: string) => Promise<string | void>
  readonly subscribe: (onDispose: (release: () => void) => void) => void
}

export const CHAT_POLL_MS = 2_500

type IssueListPayload = Extract<Card, { kind: "issue-list" }>["payload"]
type IssueListRow = IssueListPayload["issues"][number]
type IssuePayload = Extract<Card, { kind: "issue" }>["payload"]
type IssueCommentRow = IssuePayload["comments"][number]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const asInt = (value: unknown): number | null => typeof value === "number" && Number.isInteger(value) ? value : null

const asIssueState = (value: unknown): IssueState => value === "closed" || value === "fixed" || value === "verified" ? value : "open"
const asString = (value: unknown): string | undefined => typeof value === "string" && value !== "" ? value : undefined

/** A user summary off the wire (`{ id, login, avatar_url? }`, a persona `{ username, iconUrl? }`, or a bare login) as a persona. */
const personOf = (value: unknown): PersonaRef | undefined => {
  if (typeof value === "string") return value === "" ? undefined : { id: value, name: value }
  if (!isRecord(value)) return undefined
  const login = asString(value.login) ?? asString(value.username) ?? asString(value.name)
  if (login === undefined) return undefined
  const avatar = asString(value.avatar_url) ?? asString(value.avatarUrl) ?? asString(value.iconUrl)
  return { id: login, name: login, ...(avatar === undefined ? {} : { iconUrl: avatar }) }
}

type Profile = { readonly id: string; readonly label: string }
/** A persona named after a configured agent profile resolves to it, by id then by label. */
const resolved = (persona: PersonaRef, profiles: ReadonlyArray<Profile>): PersonaRef => {
  const profile = profiles.find((row) => row.id === persona.id) ?? profiles.find((row) => row.label.toLowerCase() === persona.name.toLowerCase())
  return profile === undefined ? persona : { ...persona, id: profile.id, agentId: profile.id }
}

/** Intent metadata the issue carries, when it carries any (owner, due, priority, parent, fixer, verifier). */
const taskOf = (value: Record<string, unknown>, profiles: ReadonlyArray<Profile>): IssueListRow["task"] => {
  const owner = personOf(value.owner)
  const fixedBy = personOf(value.fixed_by)
  const verifiedBy = personOf(value.verified_by)
  const priority = asInt(value.priority)
  const parentNumber = isRecord(value.parent) ? asInt(value.parent.number) : asInt(value.parent_number)
  const due = asString(value.due) ?? asString(value.due_at)
  const task = {
    ...(owner === undefined ? {} : { owner: resolved(owner, profiles) }),
    ...(due === undefined ? {} : { due }),
    ...(priority === null || priority < 0 || priority > 3 ? {} : { priority: priority as 0 | 1 | 2 | 3 }),
    ...(parentNumber === null ? {} : { parent: { number: parentNumber, ...(isRecord(value.parent) && asString(value.parent.title) !== undefined ? { title: value.parent.title as string } : {}) } }),
    ...(fixedBy === undefined ? {} : { fixedBy: resolved(fixedBy, profiles) }),
    ...(verifiedBy === undefined ? {} : { verifiedBy: resolved(verifiedBy, profiles) })
  }
  return Object.keys(task).length === 0 ? undefined : task
}

/** Follow `Link: <…?cursor=…>; rel="next"`, reading only the opaque cursor. */
const nextCursor = (response: Response): string | undefined => {
  const next = /<([^>]+)>;\s*rel="?next"?/.exec(response.headers.get("link") ?? "")?.[1]
  if (next === undefined) return undefined
  return new URL(next, "https://pagination.invalid").searchParams.get("cursor") ?? undefined
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

/** One list row; null when the entry carries no usable issue number. */
const parseListRow = (value: unknown, profiles: ReadonlyArray<Profile> = []): IssueListRow | null => {
  if (!isRecord(value)) return null
  const number = asInt(value.number)
  if (number === null) return null
  const comments = asInt(value.comment_count)
  const task = taskOf(value, profiles)
  const last = isRecord(value.last_comment) ? value.last_comment : undefined
  const lastPersona = last === undefined ? undefined : personOf(last.persona) ?? personOf(last.commenter)
  return {
    number,
    title: typeof value.title === "string" ? value.title : "",
    state: asIssueState(value.state),
    author: authorLogin(value.author),
    ...forgeFacts(value, value.author),
    labels: parseLabels(value.labels),
    comments: comments !== null && comments >= 0 ? comments : 0,
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : null,
    ...(value.kind === "chat" ? { kind: "chat" as const } : {}),
    ...(task === undefined ? {} : { task }),
    ...(lastPersona === undefined ? {} : { last: { persona: resolved(lastPersona, profiles), text: asString(last!.body) ?? "", at: asString(last!.created_at) ?? "" } }),
    ...(value.slack !== undefined && value.slack !== null ? { slack: true } : {})
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

/** Label names are the stable keys; forgeFacts supplies their optional colors. */
const parseLabels = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((label) => isRecord(label) && typeof label.name === "string" ? [label.name] : [])
    : []

/** One comment off Plue's IssueCommentResponse shape; null when not a record. */
const parseComment = (value: unknown, profiles: ReadonlyArray<Profile> = []): IssueCommentRow | null => {
  if (!isRecord(value)) return null
  const id = asInt(value.id)
  const persona = personOf(value.persona)
  const origin = value.origin === "slack" ? "slack" : value.origin === "app" ? "app" : undefined
  return {
    author: typeof value.commenter === "string" && value.commenter !== "" ? value.commenter : null,
    commentBody: typeof value.body === "string" ? value.body : "",
    createdAt: typeof value.created_at === "string" ? value.created_at : null,
    ...(id === null ? {} : { id: String(id) }),
    ...(persona === undefined ? {} : { persona: resolved(persona, profiles), ...(persona.iconUrl === undefined ? {} : { authorAvatar: persona.iconUrl }) }),
    ...(origin === undefined ? {} : { origin })
  }
}

/** The detail payload; null only when the body is not a record at all. */
const parseDetail = (
  value: unknown,
  repo: string,
  number: number,
  comments: ReadonlyArray<IssueCommentRow>,
  profiles: ReadonlyArray<Profile> = []
): IssuePayload | null => {
  if (!isRecord(value)) return null
  const task = taskOf(value, profiles)
  return {
    repo,
    number: asInt(value.number) ?? number,
    title: typeof value.title === "string" ? value.title : "",
    state: asIssueState(value.state),
    author: authorLogin(value.author),
    ...forgeFacts(value, value.author),
    issueBody: typeof value.body === "string" ? value.body : "",
    labels: parseLabels(value.labels),
    comments: [...comments],
    ...(value.kind === "chat" ? { kind: "chat" as const } : {}),
    ...(task === undefined ? {} : { task })
  }
}

const pendingSends = new WeakMap<SeamContext["store"], Set<string>>()

/** One row formatter for imported and GitHub-source issue results. */
const issueRowValue = (issue: IssueListRow, source = issue.source): string =>
  `#${issue.number} ${issue.title} · ${issue.state}${source === "github" ? " · GitHub" : ""}`



export const createIssuesSeam = (ctx: SeamContext, renderRepositoryForm?: RepositoryForm): IssuesSeam => {
  const issuesPath = (repo: string): string => {
    const [owner = "", name = ""] = repo.split("/")
    return `${ctx.baseUrl}/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues`
  }
  /** The configured agent profiles the agents card holds, so personas resolve to them; none before the card loads. */
  const profiles = (): ReadonlyArray<Profile> => {
    const card = ctx.store.collections.cards.get("agents")
    return card?.kind === "agents" && "native" in card.payload ? card.payload.agents.map((agent) => ({ id: agent.id, label: agent.label })) : []
  }
  /** Who is reading, so their own reactions and pending sends are known. */
  const viewer = (): PersonaRef | undefined => {
    const login = ctx.store.collections.identitySessions.get("identity")?.login ?? ctx.store.collections.cloudSessions.get("cloud")?.username
    return login === undefined || login === null || login === "" ? undefined : resolved({ id: login, name: login }, profiles())
  }
  /** The open card of a chat issue, if any. */
  const chatCard = (repo: string, number: number): Extract<Card, { kind: "issue" }> | undefined => {
    const found = [...ctx.store.collections.cards.values()].find((card) =>
      card.kind === "issue" && card.payload.kind === "chat" && card.payload.source !== "github" && card.payload.repo === repo && card.payload.number === number)
    return found?.kind === "issue" ? found : undefined
  }

  /*
   * IMPORT-READINESS (multi src/smithersCloud/importReadiness.ts): the
   * `/api/repos/{o}/{r}/**` namespace only exists for repositories IMPORTED
   * into Smithers Cloud — for a source-only repo every request there answers
   * 404. The same repo's GitHub-source metadata still lists issues through
   * `GET /api/user/github-repos/{o}/{r}/issues` (GET-only through the
   * Worker), so reads degrade to the source list; mutations never fall back.
   */
  const githubSourceIssuesPath = (repo: string, filter: "open" | "closed" | "all"): string => {
    const [owner = "", name = ""] = repo.split("/")
    // GitHub accepts state=all (only Plue's imported namespace rejects it).
    return `${ctx.baseUrl}/api/user/github-repos/${encodeURIComponent(owner)}/${
      encodeURIComponent(name)
    }/issues?state=${filter}`
  }

  const notImported = (repo: string): string => `${repo} isn't imported yet — run /repos.import ${repo} first`

  /*
   * The 404 split on a mutation, from the typed refusal — never from the
   * platform's prose. plue codes a number it does not have ("issue not found")
   * and a namespace it does not have ("repository not found") alike as
   * `not_found` (PlueFailureCodes.ts, fault "user"), so the response cannot
   * name the cause: reading it as the namespace told `/issue.close 999` in a
   * repository the user had just listed to import it. This is the not-found it
   * is, at the address this app asked for, which the generic code's own
   * message does not name.
   */
  const explain404 = async (response: Response, fallback: string, whenNotFound?: string): Promise<string> => {
    const body: unknown = await response.json().catch(() => null)
    const refusal = refusalOf({ body, status: response.status, message: errorMessage(body, fallback) })
    return refusal.code === "not_found" ? whenNotFound ?? fallback : refusal.message
  }

  /*
   * The one cause local state still names, and only on the namespace-scoped
   * create: a checkout the sidebar pins that this launch has not opened. Open
   * is `collections.repos`, the state FilesSeam's `knownRepo` reads; opening a
   * checkout pins it (AppProjection, `repos.loaded`), so a pin on its own says
   * nothing. A pin says the checkout is here, never that an issue number
   * exists, so the number-scoped routes never read an import out of it, and it
   * answers only the typed `not_found` — any other code still has its own say.
   */
  const notImportedPin = (repo: string): string | undefined =>
    ![...ctx.store.collections.repos.values()].some((open) => open.name === repo)
      && [...ctx.store.collections.pinnedRepos.values()].some((pin) => pin.name === repo)
      ? notImported(repo)
      : undefined

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
    } catch (error) {
      return { issues: [], meta: { source: "unreachable", syncedAt: null, stale: false, syncError: null, refusal: errorText(error) } }
    }
    const meta = {
      source: response.headers.get("x-metadata-source") ?? (response.ok ? "github" : "refused"),
      syncedAt: response.headers.get("x-metadata-synced-at"),
      stale: response.headers.get("x-metadata-stale") === "true",
      syncError: response.headers.get("x-metadata-sync-error"),
      refusal: null as string | null
    }
    if (!response.ok) {
      return { issues: [], meta: { ...meta, refusal: await readRepositoryListError(response, `GitHub issues answered ${response.status}`) } }
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
      comments.push(...rows.flatMap(row => isRecord(row) ? [{
        author: authorLogin(row.user),
        ...(isRecord(row.user) && typeof row.user.avatar_url === "string" ? { authorAvatar: row.user.avatar_url } : {}),
        commentBody: typeof row.body === "string" ? row.body : "",
        createdAt: typeof row.created_at === "string" ? row.created_at : null
      }] : []))
      if (!/rel="?next"?/.test(response.headers.get("link") ?? "")) break
      if (page === 50) return `GitHub issue #${number} has more comments than could be loaded. Open it on GitHub to read the full conversation.`
    }
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
      ...comments.map(comment => `Comment by ${comment.author ?? "unknown"}:\n${comment.commentBody}`)
    ].join("\n")) }
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
        return `Issue #${number} in ${repo} answered 404. For a GitHub issue, use /issues.view ${number} ${repo} --source github.`
      }
      return readErrorMessage(
        issueResponse,
        `Loading issue #${number} in ${repo} failed (${issueResponse.status})`
      )
    }
    const issueJson: unknown = await issueResponse.json().catch(() => null)

    const known = profiles()
    const comments: IssueCommentRow[] = []
    let cursor: string | undefined
    const seen = new Set<string>()
    for (let page = 1; page <= 50; page += 1) {
      let commentsResponse: Response
      try {
        commentsResponse = await ctx.http(`${issuesPath(repo)}/${number}/comments${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`)
      } catch (error) {
        return unreachable(`load comments for issue #${number} in ${repo}`, error)
      }
      if (!commentsResponse.ok) {
        return readErrorMessage(
          commentsResponse,
          `Loading comments for issue #${number} in ${repo} failed (${commentsResponse.status})`
        )
      }
      const commentsJson: unknown = await commentsResponse.json().catch(() => null)
      if (!Array.isArray(commentsJson)) return `The backend answered comments for #${number} with an unreadable payload`
      comments.push(...commentsJson.flatMap((entry) => { const parsed = parseComment(entry, known); return parsed === null ? [] : [parsed] }))
      // Read only the opaque cursor; never follow a returned origin or path.
      cursor = nextCursor(commentsResponse)
      if (cursor === undefined) break
      if (seen.has(cursor)) return `Comments for #${number} did not finish loading.`
      seen.add(cursor)
      if (page === 50) return `Issue #${number} has more comments than could be loaded.`
    }

    const payload = parseDetail(issueJson, repo, number, comments, known)
    if (payload === null) {
      return `The backend answered issue #${number} in ${repo} with an unreadable payload`
    }
    const me = viewer()
    if (me !== undefined) payload.viewer = me
    if (payload.kind === "chat") {
      /* The Slack mapping and the reactions exist only for chats (chat-sync contract); a 404 is an unmapped thread. */
      const mapping = await ctx.http(`${issuesPath(repo)}/${number}/slack`).catch(() => undefined)
      if (mapping?.ok) {
        const wire: unknown = await mapping.json().catch(() => null)
        if (isRecord(wire) && asString(wire.team_id) !== undefined && asString(wire.channel_id) !== undefined) {
          payload.slack = { teamId: wire.team_id as string, channelId: wire.channel_id as string, ...(asString(wire.thread_ts) === undefined ? {} : { threadTs: wire.thread_ts as string }) }
        }
      }
      for (const comment of payload.comments) {
        if (comment.id === undefined) continue
        const response = await ctx.http(`${issuesPath(repo)}/${number}/comments/${comment.id}/reactions`).catch(() => undefined)
        if (response?.ok !== true) continue
        const rows: unknown = await response.json().catch(() => null)
        if (!Array.isArray(rows)) continue
        const counts = new Map<string, { count: number; mine: boolean }>()
        for (const row of rows) {
          if (!isRecord(row) || typeof row.name !== "string" || row.active === false) continue
          const held = counts.get(row.name) ?? { count: 0, mine: false }
          held.count += 1
          if (me !== undefined && row.actor === me.id) held.mine = true
          counts.set(row.name, held)
        }
        comment.reactions = [...counts].map(([name, { count, mine }]) => ({ name, count, mine }))
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
      `${payload.repo} · #${payload.number} ${payload.title} · ${payload.state}`,
      `Author: ${payload.author ?? "unknown"}`,
      `Labels: ${payload.labels.join(", ") || "none"}`,

      payload.issueBody,
      ...payload.comments.map((comment) =>
        `Comment by ${comment.persona?.name ?? comment.author ?? "unknown"}${comment.createdAt ? ` · ${comment.createdAt}` : ""}:\n${comment.commentBody}`)
    ].join("\n")) }
  }

  const listView = preparedView(ctx, (filter: "open" | "closed" | "all", repoArg?: string, kind: IssueKindFilter = "all") => {
    const target = resolveTargetRepo(ctx.store, repoArg)
    if ("error" in target) return target.error
    const repo = target.repo
    return { id: `issues-${repo}`, title: `Issues · ${repo}`, key: JSON.stringify(["issues", repo, filter, kind]), pane: repo, read: async (): Promise<ViewResult> => {
      // Plue 422s unknown states ("all" included) — omit the param to list every state.
      const search = new URLSearchParams()
      if (filter !== "all") search.set("state", filter)
      // Chats are owner-private and excluded from the plain list; ask for them by kind (chat-sync contract; connect issue).
      if (kind === "chat") search.set("kind", "chat")
      const query = search.size === 0 ? "" : `?${search}`
      let response: Response
      try {
        response = await ctx.http(`${issuesPath(repo)}${query}`)
      } catch (error) {
        return unreachable(`list issues for ${repo}`, error)
      }
      if (!response.ok) {
        // The imported namespace 404s ⇔ the repo isn't imported: degrade to
        // the GitHub-source list instead of surfacing a broken 404.
        if (response.status === 404) return listFromGithubSource(repo, filter)
        return readRepositoryListError(response, `Listing issues for ${repo} failed (${response.status})`)
      }
      const body: unknown = await response.json().catch(() => null)
      if (!Array.isArray(body)) {
        return `The backend answered issues for ${repo} with an unreadable payload`
      }
      const known = profiles()
      const native = body.flatMap((entry) => {
        const parsed = parseListRow(entry, known)
        return parsed === null ? [] : [{ ...parsed, source: "smithers-cloud" as const }]
      }).filter((row) => kind === "all" || (kind === "task" ? row.task !== undefined : row.kind === "chat"))
      /*
       * Smithers Cloud's /issues is the repository's OWN tracker and is correctly
       * empty for a repo mirrored from GitHub; the upstream issues live at
       * the GitHub-source route (synced store or live GitHub, per plue). One
       * list shows both, each row labeled with where it came from, and the
       * GitHub read's provenance rides the card. A GitHub refusal (not
       * linked, not mirrored) is stated, never a silent absence.
       */
      // Chats and tasks live in Smithers' own tracker; GitHub's rows join only the unfiltered list.
      const github = kind === "all" ? await readGithubIssues(repo, filter) : { issues: [], meta: undefined }
      const issues = [...native, ...github.issues]
      const card: Card = {
        id: `issues-${repo}`,
        kind: "issue-list",
        title: kind === "chat" ? `Chats · ${repo}` : kind === "task" ? `Tasks · ${repo}` : `Issues · ${repo}`,
        status: "active",
        createdAt: Date.now(),
        ordinal: ctx.nextOrdinal(),
        payload: { repo, filter, issues, ...(kind === "all" ? {} : { kind }), ...(github.meta === undefined ? {} : { github: github.meta }) }
      }
      return { card, ...readResult(issues.length === 0
        ? `No ${filter === "all" ? "" : `${filter} `}issues in ${repo}${github.meta?.refusal ? ` (GitHub: ${github.meta.refusal})` : ""}.`
        : issues.map((issue) => issueRowValue(issue)).join("\n")) }
    } }
  })
  const issueView = preparedView(ctx, (number: number, repoArg?: string, source?: "smithers-cloud" | "github") => {
    const target = resolveTargetRepo(ctx.store, repoArg)
    if ("error" in target) return target.error
    const repo = target.repo
    return { id: `issue-${source === "github" ? "github-" : ""}${repo}-${number}`, title: `Issue #${number} · ${repo}`, pane: repo,
      /* A re-read keeps the sends the server has not confirmed yet. */
      project: (card) => {
        if (card.kind !== "issue" || source === "github") return card
        const previous = chatCard(repo, number)
        return previous?.payload.pending === undefined ? card : { ...card, payload: { ...card.payload, pending: previous.payload.pending } }
      },
      read: () => source === "github" ? readGithubIssue(repo, number) : readIssue(repo, number) }
  })
  const showIssue = (repo: string, number: number) => issueView(number, repo)

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
    } catch (error) {
      failure = errorText(error)
    }
    if (failure === undefined) return
    const detail = `Refresh failed: ${failure}`
    const key = `issue.comment.refresh:${repo}:${number}`
    const action = { label: "Retry", flow: "issues.view" as const, args: `${number} ${repo}` }
    showCommentNotice(key, "Comment posted", detail, action)
    return { value: `Comment posted. ${detail}` }
  }

  const updateChat = async (cardId: string, change: (payload: IssuePayload) => IssuePayload, actor: "user" | "smithers" | "system" = ctx.actor()) => {
    const card = ctx.store.collections.cards.get(cardId)
    if (card?.kind !== "issue") return
    await ctx.dispatch({ type: "card.upsert", actor, card: { ...card, payload: change(card.payload) } }).isPersisted.promise
  }

  /** Re-read a chat the person changed, keeping the sends the server has not confirmed. */
  const refreshChat = async (repo: string, number: number): Promise<void> => {
    const card = chatCard(repo, number)
    if (card === undefined) return
    const result = await readIssue(repo, number)
    const latest = chatCard(repo, number)
    if (typeof result === "string" || result.card.kind !== "issue" || latest === undefined) return
    await ctx.dispatch({ type: "card.view.loaded", actor: "system", card: { ...latest, title: result.card.title, payload: { ...result.card.payload, pending: latest.payload.pending } } }).isPersisted.promise
  }

  /**
   * Post a chat card's requested sends one at a time; each settles only on the
   * server's answer. The request id is the idempotency key, so a retry after a
   * lost answer cannot post twice; a lost answer is `unknown`, never resent on
   * its own (chat-sync contract: absent lookup does not authorize resend).
   */
  const drain = (cardId: string): void => {
    let active = pendingSends.get(ctx.store)
    if (active === undefined) pendingSends.set(ctx.store, active = new Set())
    if (active.has(cardId)) return
    const card = ctx.store.collections.cards.get(cardId)
    if (card?.kind !== "issue" || !(card.payload.pending ?? []).some((request) => request.status === "requested")) return
    const owner = captureCloudOwner(ctx, false)
    active.add(cardId)
    const send = async () => {
      while (owner()) {
        const current = ctx.store.collections.cards.get(cardId)
        if (current?.kind !== "issue") break
        const request = (current.payload.pending ?? []).find((row) => row.status === "requested")
        if (request === undefined) break
        const { repo, number } = current.payload
        const same = () => { const live = ctx.store.collections.cards.get(cardId); return owner() && live?.kind === "issue" && live.payload.repo === repo && live.payload.number === number }
        const fail = async (status: "failed" | "unknown", error: string) => {
          if (same()) await updateChat(cardId, (payload) => ({ ...payload, pending: (payload.pending ?? []).map((row) => row.id === request.id ? { ...row, status, error } : row) }), "system")
          return error
        }
        const work = async () => {
          let response: Response
          try {
            response = await ctx.http(`${issuesPath(repo)}/${number}/comments`, {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ body: request.text, idempotency_key: request.id })
            })
          } catch (error) { return fail("unknown", `Delivery unknown: ${errorText(error)}`) }
          if (!same()) return
          if (!response.ok) return fail("failed", await readErrorMessage(response, `Sending the message failed (${response.status})`))
          await response.body?.cancel().catch(() => {})
          await updateChat(cardId, (payload) => ({ ...payload, pending: (payload.pending ?? []).filter((row) => row.id !== request.id) }), "system")
          invalidatePreparedViews(ctx.store)
          await refreshChat(repo, number)
        }
        if (ctx.withToast) await ctx.withToast(`issue.message:${request.id}`, "Sending", "Sent", work, false, owner, cardId)
        else await work()
      }
    }
    void send().catch(async (error) => {
      const current = ctx.store.collections.cards.get(cardId)
      const request = current?.kind === "issue" ? (current.payload.pending ?? []).find((row) => row.status === "requested") : undefined
      if (request !== undefined && owner()) await updateChat(cardId, (payload) => ({ ...payload, pending: (payload.pending ?? []).map((row) => row.id === request.id ? { ...row, status: "unknown", error: errorText(error) } : row) }), "system")
    }).finally(() => { active!.delete(cardId); if (owner()) drain(cardId) })
  }

  /* Visible chats re-read on a cadence; a poll is a projection refresh, never a second message store. */
  const subscribe: IssuesSeam["subscribe"] = (onDispose) => {
    const watches = new Map<string, () => void>()
    let disposed = false
    const reconcile = () => {
      if (disposed) return
      const signedIn = ctx.store.collections.identitySessions.get("identity")?.state === "signed-in" || ctx.store.collections.cloudSessions.get("cloud")?.state === "signed-in"
      const chats = signedIn ? [...ctx.store.collections.cards.values()].filter((card) =>
        card.kind === "issue" && card.payload.kind === "chat" && card.payload.source !== "github" && card.loading !== true && card.status !== "error") : []
      for (const [id, stop] of watches) if (!chats.some((card) => card.id === id)) { stop(); watches.delete(id) }
      for (const card of chats) {
        drain(card.id)
        if (watches.has(card.id)) continue
        const owner = captureCloudOwner(ctx, false)
        let stopped = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const valid = () => !disposed && !stopped && owner() && ctx.store.collections.cards.get(card.id)?.kind === "issue"
        watches.set(card.id, () => { stopped = true; clearTimeout(timer) })
        const poll = async () => {
          if (!valid()) { watches.get(card.id)?.(); watches.delete(card.id); return }
          try {
            const live = ctx.store.collections.cards.get(card.id)
            if (live?.kind === "issue") {
              const result = await readIssue(live.payload.repo, live.payload.number)
              const latest = ctx.store.collections.cards.get(card.id)
              if (valid() && typeof result !== "string" && result.card.kind === "issue" && latest?.kind === "issue") {
                const next = { ...result.card.payload, pending: latest.payload.pending }
                if (JSON.stringify(next) !== JSON.stringify(latest.payload)) {
                  await ctx.dispatch({ type: "card.view.loaded", actor: "system", card: { ...latest, title: result.card.title, payload: next } }).isPersisted.promise
                }
              }
            }
          } catch { /* The next read recovers a transient transport error. */ }
          if (valid()) timer = setTimeout(() => { void poll() }, CHAT_POLL_MS)
        }
        timer = setTimeout(() => { void poll() }, CHAT_POLL_MS)
      }
    }
    const schedule = () => queueMicrotask(reconcile)
    const changes = ctx.store.collections.cards.subscribeChanges(schedule)
    const identity = ctx.store.collections.identitySessions.subscribeChanges(schedule)
    const cloud = ctx.store.collections.cloudSessions.subscribeChanges(schedule)
    reconcile()
    onDispose(() => { disposed = true; changes.unsubscribe(); identity.unsubscribe(); cloud.unsubscribe(); for (const stop of watches.values()) stop(); watches.clear() })
  }

  return {
    subscribe,
    retryIssueComment: async (cardId, requestId) => {
      await updateChat(cardId, (payload) => ({ ...payload, pending: (payload.pending ?? []).map((row) => row.id === requestId ? { id: row.id, text: row.text, at: row.at, status: "requested" as const } : row) }))
      drain(cardId)
    },
    reactToIssueComment: async (number, commentId, name, active, explicitRepo) => {
      const target = resolveTargetRepo(ctx.store, explicitRepo)
      if ("error" in target) return target.error
      let response: Response
      try {
        response = await ctx.http(`${issuesPath(target.repo)}/${number}/comments/${encodeURIComponent(commentId)}/reactions`, {
          method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, active })
        })
      } catch (error) { return `Reaction status unknown: ${errorText(error)}` }
      if (!response.ok) return readErrorMessage(response, `Saving the reaction failed (${response.status})`)
      await response.body?.cancel().catch(() => {})
      invalidatePreparedViews(ctx.store)
      await refreshChat(target.repo, number)
    },
    setIssueTask: async (number, field, value, explicitRepo) => {
      const target = resolveTargetRepo(ctx.store, explicitRepo)
      if ("error" in target) return target.error
      const { repo } = target
      let response: Response
      try {
        response = await ctx.http(`${issuesPath(repo)}/${number}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [field]: value }) })
      } catch (error) { return unreachable(`set ${field} on task #${number} in ${repo}`, error) }
      if (!response.ok) {
        if (response.status === 404) return explain404(response, `Issue #${number} in ${repo} was not found`)
        return readErrorMessage(response, `Setting ${field} on task #${number} failed (${response.status})`)
      }
      await response.body?.cancel().catch(() => {})
      return refreshDetail(`Task #${number} ${field} set`, repo, number)
    },
    listIssues: Object.assign((filter: "open" | "closed" | "all", explicitRepo?: string, kind?: IssueKindFilter) => repositoryListRead(ctx, "issues", explicitRepo, filter, renderRepositoryForm, (repo) => listView(filter, repo, kind ?? "all")), { preload: listView.preload }),

    viewIssue: Object.assign(async (number: number, explicitRepo?: string, source?: "smithers-cloud" | "github") => {
      const target = resolveTargetRepo(ctx.store, explicitRepo)
      if ("error" in target) return target.error
      if (source === "github") return readRepositoryDetail(ctx, target.repo, "issue", number,
        () => issueView(number, target.repo, "github"), "github")
      const shown = await readRepositoryDetail(ctx, target.repo, "issue", number, () => showIssue(target.repo, number))
      return shown
    }, { preload: issueView.preload }),

    createIssue: async (title, explicitRepo, kind) => {
      const target = resolveTargetRepo(ctx.store, explicitRepo)
      if ("error" in target) return target.error
      const { repo } = target
      const owner = ctx.store.collections.identitySessions.get("identity")?.login ?? null
      let response: Response
      try {
        response = await ctx.http(issuesPath(repo), {
          method: "POST",
          headers: { "content-type": "application/json" },
          // A chat is owner-private and idempotent on its key (chat-sync contract).
          body: JSON.stringify(kind === "chat" ? { title, kind: "chat", idempotency_key: crypto.randomUUID() } : { title })
        })
      } catch (error) {
        return unreachable(`create an issue in ${repo}`, error)
      }
      if (!response.ok) {
        // Mutations never fall back — the GitHub-source proxy is GET-only.
        if (response.status === 404) return explain404(response, `${repo} was not found`, notImportedPin(repo))
        return readErrorMessage(response, `Creating the issue in ${repo} failed (${response.status})`)
      }
      const body: unknown = await response.json().catch(() => null)
      const created = isRecord(body) ? asInt(body.number) : null
      if (created === null) {
        return `The issue was created in ${repo}, but the backend answered with an unreadable payload`
      }
      const key = `setup-ci:${owner}:${repo}`
      if (kind !== "chat" && owner === (ctx.store.collections.identitySessions.get("identity")?.login ?? null)
        && !repositoryCiConfigured(ctx.store.collections.cards.values(), repo, owner)
        && ![...ctx.store.collections.toasts.values()].some(toast => toast.key === key)) {
        const action = { label: "Set up CI", flow: "ci.setup" as const, args: repo }
        ctx.dispatch({ type: "toast.shown", actor: "system", key, title: "Improve issue checks", action })
        if (ctx.resolveToast) ctx.resolveToast(key, { status: "ok", detail: "", action })
        else ctx.dispatch({ type: "toast.resolved", actor: "system", key, status: "ok", detail: "", action })
      }
      return refreshDetail(`Issue #${created} was created in ${repo}`, repo, created)
    },

    setIssueState: async (number, state, explicitRepo) => {
      const target = resolveTargetRepo(ctx.store, explicitRepo)
      if ("error" in target) return target.error
      const { repo } = target
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
        if (response.status === 404) return explain404(response, `Issue #${number} in ${repo} was not found`)
        return readErrorMessage(
          response,
          `Could not ${verb} issue #${number} in ${repo} (${response.status})`
        )
      }
      // The re-fetch below states the new truth; the PATCH echo is not read.
      await response.body?.cancel()
      return refreshDetail(`Issue #${number} in ${repo} is now ${state}`, repo, number)
    },

    commentOnIssue: async (number, text, explicitRepo) => {
      if (text.trim() === "") return "Write a comment before posting it."
      const target = resolveTargetRepo(ctx.store, explicitRepo)
      if ("error" in target) return target.error
      const { repo } = target
      /* A chat send is a pending row the drain posts with an idempotency key; the card says "sending…" until the server answers. */
      const chat = chatCard(repo, number)
      if (chat !== undefined) {
        if ((chat.payload.pending ?? []).some((row) => row.text === text && row.status === "requested")) return { value: "Requested" }
        const request = { id: crypto.randomUUID(), text, at: Date.now(), status: "requested" as const }
        await updateChat(chat.id, (payload) => ({ ...payload, pending: [...(payload.pending ?? []), request] }))
        drain(chat.id)
        return { value: "Requested" }
      }
      let response: Response
      try {
        response = await ctx.http(`${issuesPath(repo)}/${number}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: text })
        })
      } catch (error) {
        const detail = `No response from issue #${number} in ${repo}: ${errorText(error)}`
        showCommentNotice(`issue.comment.unknown:${repo}:${number}`, "Comment status unknown", detail)
        return { value: `Comment status unknown. ${detail}` }
      }
      if (!response.ok) {
        // Mutations never fall back — the GitHub-source proxy is GET-only.
        if (response.status === 404) return explain404(response, `Issue #${number} in ${repo} was not found`)
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
