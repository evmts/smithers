// The TODOs feature's contract between the browser, ChatApi's stack routes, the stack's writer and the tests (decision
// 0016, docs/features/todos.md): the one home of every value they share. Nothing here imports a library, so every side
// can.

import { REPOS_ROUTE } from "../repo/contract"

/** The last segment of `POST /api/repos/<owner>/<name>/stack`, the one route every change to a stack goes through. */
export const STACK_SEGMENT = "stack"

/** `POST /api/repos/<owner>/<name>/stack`. */
export const stackRoute = (owner: string, name: string): string =>
  `${REPOS_ROUTE}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${STACK_SEGMENT}`

/** Electric shape proxies: `GET ...?repo=<owner>/<name>`, one repository's rows. */
export const TODOS_SHAPE_ROUTE = "/api/shapes/todos"
export const TODO_REQUESTS_SHAPE_ROUTE = "/api/shapes/todo-requests"

/** The Postgres tables (migration `0021_todos`). `stacks`, `todo_attempts` and `stack_ops` are never synced. */
export const STACKS_TABLE = "stacks"
export const TODOS_TABLE = "todos"
export const TODO_REQUESTS_TABLE = "todo_requests"
export const TODO_ATTEMPTS_TABLE = "todo_attempts"
export const STACK_OPS_TABLE = "stack_ops"

/**
 * The `todos` columns a device syncs: never `created_by` or `settled_by`, which are person ids, or the SHAs, which only
 * the run reads. Listed, so a column added later stays on the server until it is named here.
 */
export const TODO_COLUMNS = [
  "id",
  "repo_id",
  "number",
  "title",
  "state",
  "step",
  "position",
  "revision",
  "attempt",
  "branch",
  "pr_number",
  "failure",
  "note",
  "created_login",
  "created_at",
  "updated_at",
  "settled_at",
] as const

/** The `todo_requests` columns a device syncs: each revision of a TODO's prompt. */
export const TODO_REQUEST_COLUMNS = ["todo_id", "revision", "repo_id", "prompt", "acceptance", "by_login", "created_at"] as const

/** A TODO's states (mvp.md §4.1). Slice 1 reaches Queued and Dropped from a person, the rest from the `todo` run. */
export const TODO_STATES = [
  "queued",
  "starting",
  "working",
  "needs_you",
  "in_review",
  "merged",
  "dropped",
  "failed",
] as const
export type TodoState = (typeof TODO_STATES)[number]

/** The states that leave the stack: their TODO has no position. */
export const SETTLED_STATES = ["merged", "dropped"] as const satisfies ReadonlyArray<TodoState>

/** The states that hold one of the stack's lanes: started and not yet settled or failed. */
export const LANE_STATES = ["starting", "working", "needs_you", "in_review"] as const satisfies ReadonlyArray<TodoState>

/** The `todo` run's steps (decision 0016 §2), which light a TODO's step strip. */
export const TODO_STEPS = ["plan", "implement", "publish", "propose", "await"] as const
export type TodoStep = (typeof TODO_STEPS)[number]

/** Why a TODO failed (decision 0016 §1). */
export const TODO_FAILURES = [
  "plan",
  "implement",
  "empty_change",
  "publish_refused",
  "pr_refused",
  "app_not_installed",
  "budget",
] as const
export type TodoFailure = (typeof TODO_FAILURES)[number]

/** What happened on GitHub to settle a TODO (decision 0016 §1). */
export const TODO_NOTES = ["merged_on_github", "closed_on_github", "out_of_order"] as const
export type TodoNote = (typeof TODO_NOTES)[number]

/**
 * The changes a person makes to a stack in slice 1 (decision 0016 §1): `commit` appends a TODO, `drop` takes one out.
 * Slice 2 adds `move` and `amend`, which the `stack_ops` table already admits.
 */
export const STACK_OPS = ["commit", "drop"] as const
export type StackOp = (typeof STACK_OPS)[number]

/** Who a change acts for: a person's own press, or the agent's call for them (decision 0016 Appendix B). */
export const STACK_VIAS = ["person", "agent"] as const
export type StackVia = (typeof STACK_VIAS)[number]

/** The longest TODO title, in characters. */
export const MAX_TITLE_LENGTH = 120

/** The longest prompt, in UTF-8 bytes. */
export const MAX_PROMPT_BYTES = 16_384

/** The most acceptance criteria a TODO takes, and the longest one, in characters. */
export const MAX_ACCEPTANCE = 20
export const MAX_ACCEPTANCE_LENGTH = 300

/** The largest `POST .../stack` body, in bytes: a whole prompt, title and criteria, and their JSON. */
export const MAX_STACK_BODY_BYTES = 2 * MAX_PROMPT_BYTES + 4 * (MAX_TITLE_LENGTH + MAX_ACCEPTANCE * MAX_ACCEPTANCE_LENGTH) +
  1024

/** The largest TODO number a route or payload takes: Postgres `integer`. */
export const MAX_TODO_NUMBER = 2_147_483_647

/** How many TODOs a new stack holds open at most (`stacks.max_open`'s default). */
export const DEFAULT_MAX_OPEN = 50

/** How many TODOs a new stack works on at once (`stacks.lanes`'s default): one, in slice 1 (decision 0016 §10). */
export const DEFAULT_LANES = 1

/**
 * The refusal codes the stack route answers with, as `{ code }`: `invalid` (400), `authentication` (401), `forbidden`
 * (403: not a Member, or the agent's commit or drop, which only a person makes), `not_found` (404: no TODO with that
 * number), `conflict` (409: the op id was used for another change), `stack_full` (409: `max_open` TODOs are open),
 * `merged` (409: a merged TODO can't be dropped), `too_large` (413) and `unavailable` (503).
 */
export const STACK_REFUSALS = [
  "invalid",
  "authentication",
  "forbidden",
  "not_found",
  "conflict",
  "stack_full",
  "merged",
  "too_large",
  "unavailable",
] as const
export type StackRefusal = (typeof STACK_REFUSALS)[number]

/** A refusal's HTTP status. */
export const REFUSAL_STATUS: Readonly<Record<StackRefusal, number>> = {
  invalid: 400,
  authentication: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  stack_full: 409,
  merged: 409,
  too_large: 413,
  unavailable: 503,
}

/** What a stack's writer settles a change as: done (`committed`, `dropped`), or refused for the stack's state. */
export const STACK_OUTCOMES = ["committed", "dropped", "stack_full", "merged", "not_found"] as const
export type StackOutcome = (typeof STACK_OUTCOMES)[number]

/**
 * Why this device's change stays Not sent: the route refused it (the codes it never sends again). `unavailable` is sent
 * again, so it never stays.
 */
export const NOT_SENT_REASONS = [
  "invalid",
  "authentication",
  "forbidden",
  "not_found",
  "conflict",
  "stack_full",
  "merged",
  "too_large",
] as const satisfies ReadonlyArray<Exclude<StackRefusal, "unavailable">>
export type NotSentReason = (typeof NOT_SENT_REASONS)[number]

/** The route's refusal of a send, by its `code`: the codes this device never sends again; the rest are sent again. */
export const notSentOf = (code: string | undefined): NotSentReason | undefined =>
  (NOT_SENT_REASONS as ReadonlyArray<string>).includes(code ?? "") ? (code as NotSentReason) : undefined

/** What a Not sent change says, by its reason. */
export const NOT_SENT_COPY: Readonly<Record<NotSentReason, string>> = {
  invalid: "Invalid",
  authentication: "Sign in",
  forbidden: "Not allowed",
  not_found: "Not found",
  conflict: "Conflict",
  stack_full: "Stack full",
  merged: "Merged",
  too_large: "Too long",
}

/**
 * The namespaces a client flow's ids are derived in (RFC 9562 version 5, `@smthrs/crypto`'s `Uuid.v5`): a `todo/commit`
 * or `todo/drop` run's op id, and a `todo/draft` run's draft id, are its execution id's UUID here, so a step run again
 * names the same change or draft. A commit's op id is also its TODO's id.
 */
export const OP_ID_NAMESPACE = "0b6e2c4f-7a1d-4e38-9c52-1f0d3a8b6e74"
export const DRAFT_ID_NAMESPACE = "5c3a9e17-2b84-4f60-a1d7-8e4f0c2b9d35"

/** The engine channel a TODO step asks the tab that started it on: `<engine name>/todos`. */
export const todosChannel = (engineName: string): string => `${engineName}/todos`

/** How long a TODO step waits for the tab that asked to keep its draft or queue its change. */
export const QUEUE_WITHIN = "10 seconds"

/** The app's stack routes. */
export const stackPath = (owner: string, name: string): string => `/${owner}/${name}/stack`
export const todoPath = (owner: string, name: string, number: number): string => `/${owner}/${name}/stack/${number}`

/** A stack route's `$number` as the TODO number it names, or `undefined` for anything but 1 to `MAX_TODO_NUMBER`. */
export const todoNumberOf = (text: string): number | undefined => {
  if (!/^[1-9][0-9]{0,9}$/.test(text)) return undefined
  const number = Number(text)
  return number <= MAX_TODO_NUMBER ? number : undefined
}

/** A draft's title when the agent or the slash command gave none: the prompt's first line, cut to the limit. */
export const titleOf = (prompt: string): string => {
  const line = prompt.trim().split("\n", 1)[0]!.replace(/^#+\s*/, "").trim()
  return line.length <= MAX_TITLE_LENGTH ? line : `${line.slice(0, MAX_TITLE_LENGTH - 1)}…`
}

/** UTF-8 bytes of `text`. */
export const bytesOf = (text: string): number => new TextEncoder().encode(text).length

/** Whether `title` is a TODO title: 1 to `MAX_TITLE_LENGTH` characters, not blank. */
export const isTitle = (title: string): boolean => title.trim().length > 0 && title.length <= MAX_TITLE_LENGTH

/** Whether `prompt` is a TODO prompt: not blank, at most `MAX_PROMPT_BYTES`. */
export const isPrompt = (prompt: string): boolean => prompt.trim().length > 0 && bytesOf(prompt) <= MAX_PROMPT_BYTES

/** Whether `acceptance` is a TODO's acceptance criteria: at most `MAX_ACCEPTANCE`, each 1 to the limit, not blank. */
export const isAcceptance = (acceptance: ReadonlyArray<string>): boolean =>
  acceptance.length <= MAX_ACCEPTANCE &&
  acceptance.every((line) => line.trim().length > 0 && line.length <= MAX_ACCEPTANCE_LENGTH)

/** Buttons and states. */
export const STACK = "Stack"
export const NEW_TODO = "New TODO"
export const EDIT = "Edit"
export const DISCARD = "Discard"
export const NOT_FOUND = "Not found"

/** What the TODOs feature records in the browser (docs/observability.md#todos), by name, and their fields: never text. */
export const TODOS_TELEMETRY = {
  records: [
    "todos.draft",
    "todos.queue",
    "todos.send",
    "todos.pending",
    "smithers_todo_drafts",
    "smithers_todo_queued",
    "smithers_todo_sends",
    "smithers_todo_pending_actions",
    "execute_tool todo/draft",
  ],
  fields: ["op", "door", "via", "outcome", "status", "code", "opId", "draftId", "durationMs", "action"],
} as const
