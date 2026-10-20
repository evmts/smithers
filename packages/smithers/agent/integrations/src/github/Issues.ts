/**
 * Issue and issue-comment REST operations, and the hidden write marker that
 * lets a step adopt its own earlier write.
 *
 * These are plain operations over the {@link GitHubClient} in context, not
 * durable actions: the flow step that calls them chooses the token (a
 * person's user token or an App installation token) by providing the client,
 * and settles its own projection from the result.
 *
 * **Writing once.** A POST whose answer is lost (a 5xx, a dropped connection,
 * a timeout) fails with `outcomeUnknown: true`: GitHub may have created the
 * issue or comment. Repeating the POST risks a second one, so every created
 * issue and comment carries a hidden `<!-- smithers:write=<id> -->` marker
 * ({@link withWriteMarker}), where the id is the step's write id. A step
 * writes like this:
 *
 * 1. On its first attempt, POST once with the marked body.
 * 2. On an attempt after `outcomeUnknown`, look first:
 *    {@link findIssueByWrite} or {@link findCommentByWrite}, with `since` a
 *    little before the first attempt started. Adopt what it finds.
 * 3. Only when nothing carries the marker, POST again.
 *
 * A write id should be unguessable, such as a UUID. The finders return the
 * earliest-created match, so a copy someone posts after seeing the marker
 * never wins over the original. They read at most
 * {@link RECONCILE_PAGES} pages; an item beyond that budget is not found, so
 * keep `since` close to the first attempt.
 *
 * Every coordinate is validated before it becomes a request path, as
 * `Repository.repositoryPath` does, so a hostile owner, repository or number
 * cannot walk the token-bearing request to another endpoint.
 *
 * @since 1.0.0
 */

import { Effect, Option, Schema } from "effect"
import { IntegrationError } from "../core/IntegrationError.ts"
import { RECONCILE_PAGES } from "./Actions.ts"
import { GitHubClient } from "./GitHubClient.ts"
import { IssueNumber, requireRepositoryPath } from "./Repository.ts"

/**
 * The account on an issue or comment. GitHub sends `null` for a deleted
 * account.
 *
 * @category schemas
 * @since 1.0.0
 */
export const IssueUser = Schema.NullOr(Schema.Struct({ id: Schema.Number, login: Schema.String }))

/**
 * An issue as GitHub's REST API returns it, narrowed to the fields Smithers
 * reads. GitHub's other fields are dropped. `pull_request` is present when the
 * issue is a pull request.
 *
 * @category schemas
 * @since 1.0.0
 */
export const Issue = Schema.Struct({
  id: Schema.Number,
  node_id: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  state: Schema.Literals(["open", "closed"]),
  state_reason: Schema.NullOr(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed(null))),
  user: IssueUser,
  comments: Schema.Number,
  created_at: Schema.String,
  updated_at: Schema.String,
  closed_at: Schema.NullOr(Schema.String),
  pull_request: Schema.optionalKey(Schema.Unknown)
})

/**
 * A decoded {@link Issue}.
 *
 * @category models
 * @since 1.0.0
 */
export type Issue = typeof Issue.Type

/**
 * An issue comment as GitHub's REST API returns it, narrowed to the fields
 * Smithers reads.
 *
 * @category schemas
 * @since 1.0.0
 */
export const IssueComment = Schema.Struct({
  id: Schema.Number,
  node_id: Schema.String,
  body: Schema.NullOr(Schema.String),
  user: IssueUser,
  created_at: Schema.String,
  updated_at: Schema.String,
  issue_url: Schema.String
})

/**
 * A decoded {@link IssueComment}.
 *
 * @category models
 * @since 1.0.0
 */
export type IssueComment = typeof IssueComment.Type

/**
 * What a write id may be: 1 to 100 letters, digits and hyphens, such as a
 * UUID.
 *
 * @category constants
 * @since 1.0.0
 */
export const WRITE_ID_PATTERN = /^[A-Za-z0-9-]{1,100}$/

// Tolerant of whitespace inside the comment delimiters, as a person's edit
// may leave it.
const MARKER = /<!--\s*smithers:write=([A-Za-z0-9-]{1,100})\s*-->/g
// The marker with the blank line `withWriteMarker` puts before it, CRLF
// included, since github.com's editor saves CRLF line ends.
const MARKER_WITH_BREAK = /(?:\r?\n){0,2}<!--\s*smithers:write=[A-Za-z0-9-]{1,100}\s*-->/g

const invalidWriteId = (writeId: unknown): IntegrationError =>
  new IntegrationError(
    "invalid-config",
    "A write id must be 1 to 100 letters, digits and hyphens.",
    {
      field: "writeId",
      writeId: typeof writeId === "string" ? writeId.slice(0, 100) : typeof writeId,
      retryable: false
    }
  )

/**
 * The hidden marker for `writeId`: `<!-- smithers:write=<id> -->`, which
 * GitHub renders as nothing.
 *
 * Throws an `IntegrationError` `invalid-config` when `writeId` is not 1 to 100
 * letters, digits and hyphens.
 *
 * @category constructors
 * @since 1.0.0
 */
export const writeMarker = (writeId: string): string => {
  if (typeof writeId !== "string" || !WRITE_ID_PATTERN.test(writeId)) throw invalidWriteId(writeId)
  return `<!-- smithers:write=${writeId} -->`
}

/**
 * `body`, then a blank line and {@link writeMarker}. An empty body is the
 * marker alone.
 *
 * @category constructors
 * @since 1.0.0
 */
export const withWriteMarker = (body: string, writeId: string): string => {
  const marker = writeMarker(writeId)
  return body.length === 0 ? marker : `${body}\n\n${marker}`
}

/**
 * The write id the body's marker names, or `undefined`. Whitespace around the
 * marker and inside its delimiters is tolerated; with several markers, the
 * last one wins.
 *
 * @category getters
 * @since 1.0.0
 */
export const writeIdOf = (body: string | null | undefined): string | undefined => {
  if (typeof body !== "string") return undefined
  let writeId: string | undefined
  for (const match of body.matchAll(MARKER)) writeId = match[1]
  return writeId
}

/**
 * `body` with every write marker, and the blank line before each, removed, for
 * display. `withoutWriteMarker(withWriteMarker(body, id))` is `body`.
 *
 * @category getters
 * @since 1.0.0
 */
export const withoutWriteMarker = (body: string): string => body.replace(MARKER_WITH_BREAK, "")

const requireIssueNumber = (number: number): Effect.Effect<number, IntegrationError> =>
  Schema.is(IssueNumber)(number) ? Effect.succeed(number) : Effect.fail(
    new IntegrationError("invalid-config", "A GitHub issue number must be a positive integer.", {
      field: "number",
      number: typeof number === "number" ? number : typeof number,
      retryable: false
    })
  )

const requireWriteId = (writeId: string): Effect.Effect<string, IntegrationError> =>
  typeof writeId === "string" && WRITE_ID_PATTERN.test(writeId)
    ? Effect.succeed(writeId)
    : Effect.fail(invalidWriteId(writeId))

const requireSince = (since: string | undefined): Effect.Effect<string | undefined, IntegrationError> =>
  since === undefined || (typeof since === "string" && Number.isFinite(Date.parse(since)))
    ? Effect.succeed(since)
    : Effect.fail(
      new IntegrationError("invalid-config", "`since` must be an ISO 8601 timestamp.", {
        field: "since",
        retryable: false
      })
    )

const decodeFailed = (path: string, cause: unknown): IntegrationError =>
  new IntegrationError("decode-failed", `GitHub response for GET ${path} failed schema validation.`, {
    method: "GET",
    path
  }, { cause })

const decodeAll = <A>(
  schema: Schema.Decoder<A>,
  items: ReadonlyArray<unknown>,
  path: string
): Effect.Effect<ReadonlyArray<A>, IntegrationError> =>
  Schema.decodeUnknownEffect(Schema.Array(schema))(items).pipe(Effect.mapError((cause) => decodeFailed(path, cause)))

const decodeOne = <A>(
  schema: Schema.Decoder<A>,
  item: unknown,
  path: string
): Effect.Effect<A, IntegrationError> =>
  Schema.decodeUnknownEffect(schema)(item).pipe(Effect.mapError((cause) => decodeFailed(path, cause)))

// Whether a listed item, not yet decoded, carries `writeId`'s marker. Only the
// match is decoded, so an unrelated item GitHub shapes differently never
// blocks the reconciliation.
const markedWith = (item: unknown, writeId: string): boolean => {
  const body = typeof item === "object" && item !== null ? (item as { readonly body?: unknown }).body : undefined
  return typeof body === "string" && writeIdOf(body) === writeId
}

const isPullRequest = (item: unknown): boolean =>
  (item as { readonly pull_request?: unknown }).pull_request !== undefined

const spanAttributes = (owner: string, repo: string, number?: number): Record<string, unknown> => ({
  "github.owner": owner,
  "github.repo": repo,
  ...(number === undefined ? {} : { "github.number": number })
})

const query = (parameters: Record<string, string | undefined>): string => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) if (value !== undefined) search.set(key, value)
  const text = search.toString()
  return text.length === 0 ? "" : `?${text}`
}

/**
 * The issue (or pull request, which GitHub numbers in the same sequence):
 * `GET /repos/{owner}/{repo}/issues/{number}`.
 *
 * @category getters
 * @since 1.0.0
 */
export const getIssue = (
  owner: string,
  repo: string,
  number: number
): Effect.Effect<Issue, IntegrationError, GitHubClient> =>
  Effect.gen(function*() {
    const client = yield* GitHubClient
    const repository = yield* requireRepositoryPath(owner, repo)
    const issue = yield* requireIssueNumber(number)
    return yield* client.request("GET", `/repos/${repository}/issues/${issue}`, undefined, { schema: Issue })
  }).pipe(Effect.withSpan("GitHub.Issues.getIssue", { attributes: spanAttributes(owner, repo, number) }))

/**
 * The comments on issue `number`, oldest first:
 * `GET /repos/{owner}/{repo}/issues/{number}/comments`, optionally only those
 * updated since `since` (ISO 8601), within `maxPages` pages of 100 (default
 * 10). `truncated` is true when pages remained.
 *
 * @category getters
 * @since 1.0.0
 */
export const listComments = (
  owner: string,
  repo: string,
  number: number,
  options?: { readonly since?: string | undefined; readonly maxPages?: number | undefined }
): Effect.Effect<
  { readonly items: ReadonlyArray<IssueComment>; readonly truncated: boolean },
  IntegrationError,
  GitHubClient
> =>
  Effect.gen(function*() {
    const client = yield* GitHubClient
    const repository = yield* requireRepositoryPath(owner, repo)
    const issue = yield* requireIssueNumber(number)
    const since = yield* requireSince(options?.since)
    const path = `/repos/${repository}/issues/${issue}/comments`
    const page = yield* client.paginate(`${path}${query({ since })}`, { maxPages: options?.maxPages })
    const items = yield* decodeAll(IssueComment, page.items, path)
    return { items, truncated: page.truncated }
  }).pipe(Effect.withSpan("GitHub.Issues.listComments", { attributes: spanAttributes(owner, repo, number) }))

/**
 * Opens an issue: `POST /repos/{owner}/{repo}/issues`. Mark `body` with
 * {@link withWriteMarker} so a retry can find it.
 *
 * A lost answer fails `outcomeUnknown`; see the module notes before writing
 * again.
 *
 * @category constructors
 * @since 1.0.0
 */
export const createIssue = (
  owner: string,
  repo: string,
  input: { readonly title: string; readonly body: string }
): Effect.Effect<Issue, IntegrationError, GitHubClient> =>
  Effect.gen(function*() {
    const client = yield* GitHubClient
    const repository = yield* requireRepositoryPath(owner, repo)
    return yield* client.request("POST", `/repos/${repository}/issues`, { title: input.title, body: input.body }, {
      schema: Issue
    })
  }).pipe(Effect.withSpan("GitHub.Issues.createIssue", { attributes: spanAttributes(owner, repo) }))

/**
 * Comments on issue or pull request `number`:
 * `POST /repos/{owner}/{repo}/issues/{number}/comments`. Mark `body` with
 * {@link withWriteMarker} so a retry can find it.
 *
 * A lost answer fails `outcomeUnknown`; see the module notes before writing
 * again.
 *
 * @category constructors
 * @since 1.0.0
 */
export const createComment = (
  owner: string,
  repo: string,
  number: number,
  body: string
): Effect.Effect<IssueComment, IntegrationError, GitHubClient> =>
  Effect.gen(function*() {
    const client = yield* GitHubClient
    const repository = yield* requireRepositoryPath(owner, repo)
    const issue = yield* requireIssueNumber(number)
    return yield* client.request("POST", `/repos/${repository}/issues/${issue}/comments`, { body }, {
      schema: IssueComment
    })
  }).pipe(Effect.withSpan("GitHub.Issues.createComment", { attributes: spanAttributes(owner, repo, number) }))

/**
 * The issue whose body carries `writeId`'s marker, among issues updated since
 * `since` (ISO 8601), walking at most {@link RECONCILE_PAGES} pages of
 * `GET /repos/{owner}/{repo}/issues?state=all&sort=created&direction=desc&since=…`.
 * Pull requests are skipped.
 *
 * With more than one match, the earliest created wins. An issue beyond the
 * page budget is not found.
 *
 * @category getters
 * @since 1.0.0
 */
export const findIssueByWrite = (
  owner: string,
  repo: string,
  options: { readonly writeId: string; readonly since: string }
): Effect.Effect<Option.Option<Issue>, IntegrationError, GitHubClient> =>
  Effect.gen(function*() {
    const client = yield* GitHubClient
    const repository = yield* requireRepositoryPath(owner, repo)
    const writeId = yield* requireWriteId(options.writeId)
    const since = yield* requireSince(options.since)
    const path = `/repos/${repository}/issues`
    const page = yield* client.paginate(
      `${path}${query({ state: "all", sort: "created", direction: "desc", since })}`,
      { maxPages: RECONCILE_PAGES }
    )
    // Newest first, so the last match is the earliest created.
    let found: unknown
    for (const item of page.items) if (markedWith(item, writeId) && !isPullRequest(item)) found = item
    return found === undefined ? Option.none() : Option.some(yield* decodeOne(Issue, found, path))
  }).pipe(Effect.withSpan("GitHub.Issues.findIssueByWrite", { attributes: spanAttributes(owner, repo) }))

/**
 * The comment on issue `number` whose body carries `writeId`'s marker, among
 * comments updated since `since` (ISO 8601), walking at most
 * {@link RECONCILE_PAGES} pages.
 *
 * With more than one match, the earliest created wins. A comment beyond the
 * page budget is not found.
 *
 * @category getters
 * @since 1.0.0
 */
export const findCommentByWrite = (
  owner: string,
  repo: string,
  number: number,
  options: { readonly writeId: string; readonly since: string }
): Effect.Effect<Option.Option<IssueComment>, IntegrationError, GitHubClient> =>
  Effect.gen(function*() {
    const client = yield* GitHubClient
    const repository = yield* requireRepositoryPath(owner, repo)
    const issue = yield* requireIssueNumber(number)
    const writeId = yield* requireWriteId(options.writeId)
    const since = yield* requireSince(options.since)
    const path = `/repos/${repository}/issues/${issue}/comments`
    const page = yield* client.paginate(`${path}${query({ since })}`, { maxPages: RECONCILE_PAGES })
    // Oldest first, so the first match is the earliest created.
    const found = page.items.find((item) => markedWith(item, writeId))
    return found === undefined ? Option.none() : Option.some(yield* decodeOne(IssueComment, found, path))
  }).pipe(Effect.withSpan("GitHub.Issues.findCommentByWrite", { attributes: spanAttributes(owner, repo, number) }))
