// The branch workspace's contract between the browser, ChatApi, the flows and the tests (decision 0013,
// docs/features/branch-workspace.md): the one home of every value they share. Nothing here imports a library, so every
// side can.

/** `POST <route>` `{ owner, name, ref? }` tracks a branch GitHub already has: `branch/Track`. */
export const BRANCHES_ROUTE = "/api/branches"

/** ChatApi's Electric shape proxy for one repository's `branches`: `GET ?repo=<repository id>`. */
export const BRANCHES_SHAPE_ROUTE = "/api/shapes/branches"

/** The Postgres tables the branch workspace adds (db/migrations/0014_branch_workspace.ts). */
export const BRANCHES_TABLE = "branches"
export const CONVERSATIONS_TABLE = "conversations"

/**
 * The namespace of every conversation's id: a conversation's id is the version 5 UUID of its branch's id in it, so a
 * device that knows a branch knows its conversation offline (decision 0013, decision 2).
 */
export const CONVERSATION_NAMESPACE = "5b0a6f0e-2c5d-4f0e-9a43-0c1e6a7b8d91"

/**
 * The branch of the deployment's own repository (`GITHUB_REPOSITORY`) that the rows written before branches existed
 * belong to, and that `/app` shows until the launcher lands (decision 0013 §1 and §5).
 */
export const HOME_BRANCH = "main"

/** The branch modes (decision 0007 §5): `locked` (the default branch: changes only by merge), `open` and `restricted`. */
export const MODES = ["locked", "open", "restricted"] as const
export type Mode = (typeof MODES)[number]

/** The longest branch name the app tracks, in characters. */
export const MAX_BRANCH_NAME_LENGTH = 255

/** The largest `POST /api/branches` body. */
export const MAX_TRACK_BODY_BYTES = 2 * 1024

/**
 * Whether `name` is a branch name git accepts (`git check-ref-format --branch`), within the app's length: no control
 * characters, spaces or `~^:?*[\`, no `..`, `@{` or `//`, no segment starting with `.` or ending in `.lock`, and not
 * starting with `-`, starting or ending with `/`, or ending with `.`.
 */
export const isBranchName = (name: string): boolean =>
  name.length > 0 &&
  name.length <= MAX_BRANCH_NAME_LENGTH &&
  name !== "@" &&
  !name.startsWith("-") &&
  !/[\x00-\x20\x7f~^:?*[\\]/.test(name) &&
  !name.includes("..") &&
  !name.includes("@{") &&
  !name.includes("//") &&
  !name.startsWith("/") &&
  !name.endsWith("/") &&
  !name.endsWith(".") &&
  name.split("/").every((segment) => !segment.startsWith(".") && !segment.endsWith(".lock"))

/**
 * The refusal codes the branch routes answer with, as `{ code }`: `invalid` (400), `authentication` (401),
 * `forbidden` (403: not a Member), `not_found` (404: GitHub has no such repository or branch), `locked` (409: the
 * branch is locked), and `unavailable` (503).
 */
export const REFUSALS = ["invalid", "authentication", "forbidden", "not_found", "locked", "unavailable"] as const
export type Refusal = (typeof REFUSALS)[number]

/**
 * What the branch workspace records in the browser (docs/observability.md#browser), by name, and the attributes they
 * carry: `branch/track`'s step and its request, opening a branch's page, and chat showing a branch's conversation. No
 * attribute carries a branch's name or anything asked.
 */
export const BRANCH_TELEMETRY = {
  records: [
    "branch.track",
    "branch.track.post",
    "branch.open",
    "smithers_web_branch_tracks",
    "smithers_web_branch_opens",
    "chat conversation opened",
    "chat conversation shown",
  ],
  fields: ["outcome", "status", "durationMs", "conversation", "conversationId"],
} as const
