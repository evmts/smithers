// Runs' contract (decision 0014 §3 and §5, docs/features/runs.md): the one home of the values the tab, the engine
// worker and the tests share. Nothing here imports a library, so every side can.

/** The route of every run this person may read. */
export const RUNS_PATH = "/app/runs"

/** The route of one run's page. */
export const runPath = (runId: string): string => `${RUNS_PATH}/${encodeURIComponent(runId)}`

/** How many runs the list shows: the newest. */
export const RUN_LIST_LIMIT = 50

/** How many journal events one read of a run's page takes: the engine's page bound. */
export const JOURNAL_PAGE = 500

/**
 * Whether a run of `flow` is work a person lists: an act on a run (`run/*`) isn't, nor the host's own work on the
 * device, such as preparing its store for a new build (`device/prepare`, decision 0021).
 */
export const listed = (flow: string): boolean => !flow.startsWith("run/") && !flow.startsWith("device/")

/** The engine's settled states: a run in one never changes again. */
export const SETTLED = ["completed", "failed", "cancelled"] as const

/** Whether a run in `status` has settled. */
export const settled = (status: string): boolean => (SETTLED as ReadonlyArray<string>).includes(status)

/**
 * Why an act on a run was refused:
 * - `not_found`: this engine holds no such run;
 * - `stale`: the run moved since the page read it (its journal's last sequence differs), so the page shows it again;
 * - `settled`: it has settled, so there is nothing to stop or resume;
 * - `not_settled`: it hasn't settled, so there is nothing to retry yet;
 * - `not_retryable`: its flow is never retried with its own payload;
 * - `not_here`: this engine doesn't run its flow.
 *
 * A store that can't be read or can't record the act fails the act's step instead; the page says the engine couldn't
 * be reached (`unavailable` in `REFUSAL_WORDS`).
 */
export const ACT_REFUSALS = ["not_found", "stale", "settled", "not_settled", "not_retryable", "not_here"] as const

/** The new run a retry starts for the act `actId`: one per act, so a repeated Retry starts one run. */
export const retriedRunId = (actId: string): string => `${actId}/run`

/** The act a person's Retry dispatches as: `retry:<runId>:<n>`, the n-th retry of that run. */
export const retryActId = (runId: string, n: number): string => `retry:${runId}:${n}`

/**
 * What runs record (docs/observability.md#runs): reads of a run in the tab and in the leader, and acts on runs. Ids,
 * counts, codes and sizes only: never a value of a run.
 */
export const RUNS_TELEMETRY = {
  records: ["run.inspect", "run.act", "run.read", "smithers_run_acts", "smithers_run_reads"],
  fields: ["runId", "act", "host", "outcome", "events", "bytes", "clipped", "durationMs", "smithers.run.host"],
} as const

/** The run page's buttons and lines (MINIMAL TEXT: a word each). */
export const STOP = "Stop"
export const RETRY = "Retry"
export const RETRY_LATEST = "Retry latest"
export const RESUME = "Resume"
export const ANSWER = "Answer"
export const OPEN = "Open"
export const THIS_DEVICE = "This device"
export const NO_RUNS = "No runs yet"
export const COULDNT_READ = "Couldn't read this run"
export const ON_ANOTHER_DEVICE = "On another device"

/** What a refused act reads as on the run page, by its code. */
export const REFUSAL_WORDS: Readonly<Record<string, string>> = {
  stale: "It moved. Look again.",
  settled: "It already ended.",
  not_settled: "It hasn't ended.",
  not_retryable: "This run can't be retried.",
  not_here: "This device can't run it.",
  not_found: "Not on this device.",
  unavailable: "Couldn't reach the engine.",
}
