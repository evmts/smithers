// The repository feature's contract between the browser and RepoApi (docs/features/repo.md, decision 0006): the one
// home of every value the browser, RepoApi, the flows, the end-to-end tests and the unit tests share. Nothing here
// imports a library, so every side can.

/** `POST <route>` `{ owner, name }` asks for a clone; `GET <route>/<owner>/<name>/{tree,blob}/<sha>[/<path>]` reads. */
export const REPOS_ROUTE = "/api/repos"

/** RepoApi's Electric shape proxy for `repositories`: `GET`. */
export const REPOSITORIES_SHAPE_ROUTE = "/api/shapes/repositories"

/** The Postgres table the shape proxy serves. */
export const REPOSITORIES_TABLE = "repositories"

/** A GitHub owner: a letter or digit, then up to 38 letters, digits or hyphens. */
export const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

/** A GitHub repository name: 1 to 100 letters, digits, `.`, `_` or `-`, never `.` or `..`. */
export const NAME_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/

/** First path segments the app owns, so no owner can take them. */
export const RESERVED_OWNERS: ReadonlyArray<string> = ["app", "api", "assets"]

/** A full commit SHA: the only revision RepoApi reads at, since a SHA never changes. */
export const SHA_PATTERN = /^[0-9a-f]{40}$/

/** The largest `POST /api/repos` body. */
export const MAX_REQUEST_BYTES = 1024

/** The largest file RepoApi returns; above it, `413 { code: "too_large", size }` without reading the body. */
export const MAX_BLOB_BYTES = 512 * 1024

/** The longest file path RepoApi reads, in characters, and the most segments in it. */
export const MAX_PATH_LENGTH = 1024
export const MAX_PATH_SEGMENTS = 64

/** One page of a tree listing from Code Storage. */
export const TREE_PAGE_SIZE = 5_000

/** A row's status: being cloned, ready to read, failed, or refused by a budget (decision 0006, Capacity and spend). */
export const STATUSES = ["cloning", "ready", "failed", "capacity"] as const
export type Status = (typeof STATUSES)[number]

/**
 * Why a clone failed: the repository is missing or private on GitHub (`not_found`), has no commits (`empty`), Code
 * Storage or GitHub couldn't do it (`unavailable`), or the sync didn't finish in time (`timed_out`).
 */
export const FAILURES = ["not_found", "empty", "unavailable", "timed_out"] as const
export type Failure = (typeof FAILURES)[number]

/**
 * Which budget refused a clone: imports are paused, Code Storage's stored bytes or this month's reads are spent, the
 * repository is over the per-repository size, or GitHub withheld its size (`size_unknown`, until `retry_at`).
 */
export const CAPACITY_REASONS = ["paused", "storage", "reads", "too_large", "size_unknown"] as const
export type CapacityReason = (typeof CAPACITY_REASONS)[number]

/**
 * The refusal codes RepoApi answers with, as `{ code }`: `invalid` (400), `authentication` (401, cloning needs sign-in),
 * `not_found` (404), `too_large` (413, with `size` for a file), `repository_limit` (429), `capacity` (503, the read
 * budget is spent), `unavailable` (503, with `Retry-After` when Code Storage said when) and `not_configured` (503, no
 * Code Storage organization).
 */
export const REFUSALS = [
  "invalid",
  "authentication",
  "not_found",
  "too_large",
  "repository_limit",
  "capacity",
  "unavailable",
  "not_configured",
] as const
export type Refusal = (typeof REFUSALS)[number]

/** Whether `owner` and `name` name a GitHub repository the app may clone: valid, and not a reserved first segment. */
export const isRepository = (owner: string, name: string): boolean =>
  OWNER_PATTERN.test(owner) && NAME_PATTERN.test(name) && !RESERVED_OWNERS.includes(owner.toLowerCase())

/** A repository's id: `github/<owner>/<name>`, lowercased. Also its Code Storage name and its clone's key. */
export const repoId = (owner: string, name: string): string => `github/${owner}/${name}`.toLowerCase()

/**
 * A clone attempt's execution id, from the repository's id and the attempt's own `clone_id`, a UUID drawn when the
 * attempt was created. Never the `attempt` counter: it restarts when `repositories` is reset or restored, while the
 * Durable Objects keep the executions it named.
 */
export const cloneExecutionId = (id: string, cloneId: string): string => `repo-clone:${id}:${cloneId}`

/** Whether `path` is a file path RepoApi reads: relative, bounded, with no empty, `.` or `..` segment. */
export const isFilePath = (path: string): boolean => {
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return false
  const segments = path.split("/")
  return segments.length <= MAX_PATH_SEGMENTS && segments.every((s) => s !== "" && s !== "." && s !== "..")
}

/** `GET` route of a repository's file list at `sha`: `{ paths, truncated }`. */
export const treeRoute = (owner: string, name: string, sha: string): string =>
  `${REPOS_ROUTE}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree/${sha}`

/** `GET` route of a file at `sha`: its bytes. */
export const blobRoute = (owner: string, name: string, sha: string, path: string): string =>
  `${REPOS_ROUTE}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${sha}/${
    path.split("/").map(encodeURIComponent).join("/")
  }`

/** The file list RepoApi answers: every file's path, and whether it stopped before the end. */
export interface TreeListing {
  readonly paths: ReadonlyArray<string>
  readonly truncated: boolean
}

/** How many leading bytes decide whether a file is binary. */
export const BINARY_SNIFF_BYTES = 8 * 1024

const utf8 = new TextDecoder("utf-8", { fatal: true })

/**
 * A file's bytes as text, or `undefined` when the file is binary: a NUL byte among its first `BINARY_SNIFF_BYTES`, or
 * bytes that aren't UTF-8. RepoApi and the browser decide the same way.
 */
export const textOf = (bytes: Uint8Array): string | undefined => {
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return undefined
  try {
    return utf8.decode(bytes)
  } catch {
    return undefined
  }
}

// The repository view's copy. No other repository copy exists.

/** The button that asks for a clone. */
export const CLONE = "Clone"

/** The button on a failed or refused clone. */
export const TRY_AGAIN = "Try again"

/** The view's one action: copies the location's link at the head commit. */
export const COPY_PERMALINK = "Copy permalink"

/** Where Clone would be, for a signed-out person. */
export const SIGN_IN_TO_CLONE = "Sign in to clone"

/** A repository GitHub doesn't have, or keeps private. */
export const NOT_FOUND = "Not found"

/** What a failed clone shows, by failure. */
export const FAILURE_COPY: Readonly<Record<Failure, string>> = {
  not_found: NOT_FOUND,
  empty: "Empty repository",
  unavailable: "Couldn't clone",
  timed_out: "Clone timed out",
}

/** What a refused clone shows, by reason; `size_unknown` adds the time GitHub gives the size again. */
export const CAPACITY_COPY: Readonly<Record<CapacityReason, string>> = {
  paused: "Imports paused",
  storage: "Imports paused",
  reads: "Imports paused",
  too_large: "Too large to import",
  size_unknown: "Can't check its size until",
}

/** A view read Code Storage couldn't answer. */
export const BUSY = "Code Storage is busy"

/** A view read that failed for any other reason: the network, or a gateway's 5xx. */
export const COULDNT_LOAD = "Couldn't load"

/** A view read refused by this month's read budget. */
export const READING_PAUSED = "Reading paused"

/**
 * What the repository view records in the browser (docs/features/repo.md), by name, and the attributes they carry.
 * ChatApi's relay keeps exactly what src/telemetry.ts merges from every feature; none of these fields carries a file's
 * content.
 */
export const REPO_TELEMETRY = {
  records: [
    "repo.clone",
    "repo.open",
    "repo.tree.load",
    "repo.blob.load",
    "repo.permalink",
    "repo.clone.post",
    "repo.tree.get",
    "repo.blob.get",
    "smithers_web_repo_clone_clicks",
    "smithers_web_repo_clones",
    "smithers_web_repo_opens",
    "smithers_web_repo_tree_load_ms",
    "smithers_web_repo_blob_load_ms",
    "smithers_web_repo_permalink_copies",
  ],
  fields: ["outcome", "status", "kind", "durationMs", "smithers.repo.kind"],
} as const
