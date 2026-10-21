// The branch sandbox tools' contract between the browser, ChatApi, the remote flows and the tests (decision 0005 §5,
// docs/features/sandbox-tools.md): the one home of every value they share. Nothing here imports a library, so every
// side can. The tools themselves, their inputs, outputs and bounds, are `@smthrs/sandbox`'s `SandboxTools`.

/**
 * `POST <route>` `{ callId, call, conversationId? }` runs one tool on a branch's machine: the person's own call names
 * the conversation their tab shows, the agent's call is recognized by its answer (`answerId`). `GET <route>/<id>` reads
 * how the call settled.
 */
export const SANDBOX_CALLS_ROUTE = "/api/sandbox/calls"

/** The Postgres table of tool calls (db/migrations/0024_sandbox_calls.ts): who called what where, and how it ended. */
export const SANDBOX_CALLS_TABLE = "sandbox_calls"

/** A call's status: running on the machine, done with its result, or failed with why. */
export const CALL_STATUSES = ["running", "done", "failed"] as const
export type CallStatus = (typeof CALL_STATUSES)[number]

/**
 * Why a call failed on the machine: it couldn't start or answer (`unavailable`), the branch couldn't be checked out
 * (`checkout`), a command started before never recorded how it ended (`lost`), or the tool refused it (the rest,
 * `SandboxTools.ToolRefused`'s reasons).
 */
export const CALL_FAILURES = [
  "unavailable",
  "checkout",
  "lost",
  "path",
  "not_found",
  "not_a_file",
  "not_a_directory",
  "not_a_repository",
  "too_large",
] as const
export type CallFailure = (typeof CALL_FAILURES)[number]

/** The largest `POST /api/sandbox/calls` body: a whole file's write and its JSON escaping. */
export const MAX_CALL_BODY_BYTES = 3 * 1024 * 1024

/** The execution id of the remote `sandbox/Call` for one call: the call's own id, so a resend starts nothing new. */
export const callExecutionId = (callId: string): string => `sandbox-call:${callId}`

/** The execution id of the `sandbox/Keep` that watches one generation of a branch's machine. */
export const keepExecutionId = (branchId: string, generation: number): string => `sandbox-keep:${branchId}:${generation}`

/**
 * How long a machine stays awake with nothing happening in it: no call, no terminal input and no process but the
 * shells, before `sandbox/Keep` puts it to sleep (`SANDBOX_IDLE_SECONDS` overrides it). Cloudflare's own inactivity
 * timeout, 30 minutes, is only the backstop.
 */
export const DEFAULT_IDLE_SECONDS = 15 * 60

/** How often `sandbox/Keep` asks a machine whether it is idle. */
export const KEEP_EVERY_SECONDS = 5 * 60

/**
 * What the sandbox tools record in the browser (docs/observability.md#browser): each call's request and wait, by tool
 * and outcome. Never a command, a path, a file's content or output.
 */
export const SANDBOX_TELEMETRY = {
  records: ["sandbox.call", "sandbox.call.start", "sandbox.call.post", "sandbox.call.result", "smithers_web_sandbox_calls"],
  fields: ["tool", "outcome", "status", "callId", "durationMs", "door"],
} as const

/**
 * The namespace a call's id is derived in (RFC 9562 version 5, `@smthrs/crypto`'s `Uuid.v5`): the call id of a client
 * flow's run is the version 5 UUID of its execution id, so a step run again after a crash or a closed tab names the
 * same call, and the machine runs it once.
 */
export const CALL_ID_NAMESPACE = "3d6b2f1a-8c4e-4b7a-9e15-6f0c2d8a7b31"
