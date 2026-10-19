export const BOX_BUSY_REASON = "The workspace service is busy starting other boxes; try again in a moment."
export const BOX_BUSY_WAITING = "Starting a machine, please wait…"
/** Observed hosted coding records; no clocks or optimistic stage completion. */
export interface TestReceipt {
  command: string
  exit_code: number
  commit: string
  finished_at: string
  output_tail: string
  tests_run: number | null
}
export interface CodingResult {
  head_commit: string | null
  head_change_id: string | null
  test_not_run?: { reason_code: string; reason: string } | null
  test_receipt: TestReceipt | null
}
export interface HostedSession {
  [key: string]: unknown
  id: string
  stage?: "queued" | "started" | null
  queued_at?: string | null
  message_count?: number
  status: "active" | "completed" | "failed" | "cancelled" | "timed_out"
  reason_code: string | null
  reason: string | null
  retryable: boolean
  workspace: { [key: string]: unknown; id: string; name: string; status: string } | null
  run: {
    [key: string]: unknown
    id: number
    status: "queued" | "running" | "success" | "failure" | "cancelled"
    model?: string | null
    started_at?: string | null
    finished_at?: string | null
  } | null
}
export interface HostedPull {
  landing_number: number
  branch: string
  pull_number: number
  pull_url: string
  head_commit: string
  tested: boolean
  passed: boolean
}
export const HOSTED_STAGES = [
  "Admitted",
  "Allocating a machine",
  "Cloning",
  "Model working",
  "Testing",
  "Pull request opened"
] as const
export type HostedStage = (typeof HOSTED_STAGES)[number]
export interface HostedObservation {
  id: string
  repo: string
  request: string
  sessionId: string | null
  owner: string | null
  phase: "starting" | "running" | "done" | "failed"
  accepted: boolean
  session: HostedSession | null
  result: CodingResult | null
  pull: HostedPull | null
  files: { path: string; additions?: number; deletions?: number }[]
  merged?: { by: string | null; commit: string | null }
  observedAt?: number
  busyRetries?: number
  busyWaiting?: boolean
  noChange?: boolean
  outcome?: string
  activity?: string
  filesRead?: boolean
  filesError?: string
  diff?: string
  diffOpen?: boolean
  error: string | null
  stages: Partial<Record<HostedStage, number>>
}
/** Session completion, not a successful task or run, authorizes the ready card. */
export const hostedSessionPhase = (session: HostedSession, result: CodingResult | null): HostedObservation["phase"] => {
  if (
    ["failed", "cancelled", "timed_out"].includes(session.status) ||
    session.run?.status === "failure" ||
    session.run?.status === "cancelled"
  )
    return "failed"
  if (session.status === "completed") return result ? "done" : "failed"
  return "running"
}
export const hostedFailureReason = (session: HostedSession): string =>
  session.reason ??
  (session.status === "timed_out"
    ? "The agent run timed out."
    : session.status === "cancelled" || session.run?.status === "cancelled"
      ? "The agent run was cancelled."
      : session.status === "completed"
        ? "The agent completed without returning a change."
        : "The agent stopped before returning a change.")
export const testingCopy = (result: CodingResult | null) => {
  const receipt = result?.test_receipt
  const tested = receipt != null && receipt.commit === result?.head_commit
  const passed = tested && receipt.exit_code === 0 && receipt.tests_run !== 0
  const text =
    !tested
      ? receipt == null && result?.test_not_run
        ? `Tests not run: ${result.test_not_run.reason}`
        : "Tests not run at this commit"
      : receipt.tests_run === 0
        ? `${receipt.command} ran 0 tests in the agent's sandbox`
        : `${receipt.command} exited ${receipt.exit_code} in the agent's sandbox at ${receipt.commit.slice(0, 12)}${receipt.tests_run === null ? "" : ` · ${receipt.tests_run} tests`}`
  const note =
    receipt == null
      ? text
      : !tested
        ? "Tests not run at this commit"
        : receipt.tests_run === 0
          ? "No tests ran. You can still open a pull request; this goes in its description."
          : !passed
            ? `Tests failed (exit ${receipt.exit_code}). You can still open a pull request; the failure goes in its description.`
            : null
  return { tested, passed, text, note, command: tested ? receipt.command : null }
}
export const finishedCopy = (session: HostedSession | null): string | null => {
  const start = session?.run?.started_at
  const end = session?.run?.finished_at
  if (!start || !end) return null
  const seconds = Math.floor((Date.parse(end) - Date.parse(start)) / 1000)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return `finished just now · took\u00a0${seconds >= 60 ? `${Math.floor(seconds / 60)}\u00a0m\u00a0` : ""}${seconds % 60}\u00a0s`
}
// A fresh box is bound at admission and reads "starting" until it runs (Platform f-aseaz8): that is allocation.
// Cloning is the setup after the box runs and before the model works. A queued turn may still show its
// previous box, so it never starts the Cloning clock.
const boxStarting = (session: HostedSession | null) =>
  session?.workspace?.status === "pending" || session?.workspace?.status === "starting"
const boxCloning = (session: HostedSession | null) =>
  session?.stage !== "queued" &&
  (session?.workspace?.status === "provisioning" ||
    (session?.workspace?.status === "running" && (!session.run || session.run.status === "queued")))
export const observeStages = (
  prior: HostedObservation["stages"],
  session: HostedSession | null,
  accepted: boolean,
  result: CodingResult | null,
  pull: HostedPull | null,
  now: number
): HostedObservation["stages"] => {
  const next = { ...prior }
  const mark = (stage: HostedStage, observed: boolean) => {
    if (observed && next[stage] === undefined) next[stage] = now
  }
  mark("Admitted", accepted)
  mark("Allocating a machine", accepted && (session?.run?.status === "queued" || session?.workspace === null || boxStarting(session)))
  mark("Cloning", boxCloning(session))
  mark("Model working", session?.run?.status === "running")
  mark("Testing", result?.test_receipt != null)
  mark("Pull request opened", pull !== null)
  return next
}
export const deriveHostedChange = (row: HostedObservation) => {
  const testing = testingCopy(row.result)
  const terminal = row.phase === "done" || row.phase === "failed"
  const signalled = row.pull
    ? 5
    : row.result
      ? 4
      : row.session?.run?.status === "running" || row.session?.run?.status === "success"
        ? 3
        : boxCloning(row.session)
          ? 2
          : row.accepted && (row.session?.run?.status === "queued" || row.session?.workspace === null || boxStarting(row.session))
            ? 1
            : row.sessionId ? 1 : 0
  const active = row.busyWaiting || row.session?.stage === "queued" ? 1 : Math.max(
    signalled,
    ...HOSTED_STAGES.map((label, index) => (row.stages[label] === undefined ? -1 : index))
  )
  return {
    testing,
    model: row.session?.run?.model ?? null,
    finished: finishedCopy(row.session),
    reason: row.session?.reason ?? row.error,
    retryable: row.busyRetries !== undefined || (row.session?.retryable ?? false),
    stages: HOSTED_STAGES.map((label, index) => {
      const start = row.stages[label]
      const nextStart = row.stages[HOSTED_STAGES[index + 1]!]
      const tone = (row.busyWaiting || row.session?.stage === "queued") && index === 1 ? "live" : index === 0 && row.sessionId ? "done" : !row.accepted
        ? "pending"
        : index === 5 && !row.pull
          ? "pending"
          : index === 4 && row.result && !testing.tested
            ? "skipped"
            : index === 4 && row.result && !testing.passed
            ? row.result.test_receipt
              ? "failed"
              : "skipped"
            : index > active
              ? "pending"
              : index === active && !terminal && !(label === "Model working" && row.session?.run?.status === "success")
                ? "live"
                : "done"
      const end =
        label === "Testing" && row.result?.test_receipt
          ? Date.parse(row.result.test_receipt.finished_at)
          : (nextStart ?? (tone === "live" ? row.observedAt : undefined))
      return {
        label,
        tone,
        duration:
          start !== undefined && end !== undefined && Number.isFinite(end) && end >= start
            ? `${Math.floor((end - start) / 1000)} s`
            : null
      }
    })
  }
}
export const landingRefusal = (code: string | null, fallback: string): string =>
  ({
    sign_in_required: "Sign in to open a pull request.",
    guest_refused: "Sign in to open a pull request.",
    push_permission_required: "Only people who can push to this repository can open a pull request.",
    agent_credential_refused: "A person must open the pull request.",
    session_not_found: "This agent run could not be found.",
    head_receipt_mismatch: "Tests not run at this commit. Run the change again before opening a pull request.",
    no_coding_result: "The agent has not returned a change yet.",
    no_turn_head: "The agent has not returned a change head yet.",
    // A Smithers-native repository has no GitHub repository to open a pull request on (PM d-ky555a).
    github_destination_required: "This repository isn't connected to GitHub, so a pull request can't open here."
  })[code ?? ""] ?? fallback
