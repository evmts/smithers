import type { AttemptRow, JsonValueData, JournalRow, RunRow as UiRunRow, StepRow, StepState, WaitData } from "@smthrs/ui"
import { listed, runPath, settled } from "./contract"
import { retryable } from "./retry"
import type { Inspection, RunPage, RunRow, RunStatus } from "./schema"

// A run's page as a frontend draws it (decision 0014 §5, docs/features/runs.md#the-run-page): pure functions from the
// engine's read of a run to `@smthrs/ui`'s run-page rows. The steps are the plan's action calls and child boundaries,
// and the runs this run started: an agent's cell calls and a person's flow's pinned child, whose input and result are
// that step's input and output. The engine doesn't record an action's input, so only a child's step has one.

/** A plan node a person reads as a step: an action, or a call to another flow that isn't the run itself. */
const isStep = (step: Inspection["steps"][number]) =>
  step.kind === "ActionCall" || (step.kind === "FlowCall" && step.nodeId !== "root")

/** A child run's status as a step's. */
export const stepStateOf = (status: RunStatus): StepState =>
  status === "completed"
    ? "completed"
    : status === "failed" || status === "cancelled"
    ? "failed"
    : status === "suspended"
    ? "waiting"
    : "running"

/** One step of the page: its row, and what its detail shows. */
export interface PageStep {
  readonly row: StepRow
  readonly input: JsonValueData | null
  readonly output: JsonValueData | null
  readonly attempts: ReadonlyArray<AttemptRow>
  readonly wait: WaitData | null
  /** A child run's own page. */
  readonly href: string | null
}

/** Every step of `inspection`, in the order they started. */
export const stepsOf = (inspection: Inspection): ReadonlyArray<PageStep> => {
  const nodes = inspection.steps.filter(isStep).map((step): PageStep => ({
    row: {
      id: `step:${step.nodeId}`,
      label: step.action ?? step.kind,
      kind: step.kind,
      state: step.status,
      startedAtMs: step.scheduledAtMs,
      endedAtMs: step.settledAtMs,
      depth: 0,
      attempts: step.attempts.length,
      failedAttempts: step.attempts.filter((attempt) => attempt.error !== null).length,
    },
    input: null,
    output: step.output,
    attempts: step.attempts.map((attempt) => ({
      attempt: attempt.attempt,
      state: attempt.state,
      startedAtMs: attempt.startedAtMs,
      finishedAtMs: attempt.finishedAtMs,
      error: attempt.error,
    })),
    wait: null,
    href: null,
  }))
  const children = inspection.children.map((child): PageStep => ({
    row: {
      id: `run:${child.runId}`,
      label: child.flowName,
      kind: "run",
      state: stepStateOf(child.status),
      startedAtMs: child.createdAtMs,
      endedAtMs: child.finishedAtMs,
      depth: 1,
      attempts: 0,
      failedAttempts: 0,
    },
    input: child.input,
    output: child.result,
    attempts: [],
    wait: child.waiting === null ? null : { kind: child.waiting.kind, sinceMs: null, wakeAtMs: child.waiting.wakeAtMs },
    href: runPath(child.runId),
  }))
  return [...nodes, ...children].sort((left, right) => left.row.startedAtMs - right.row.startedAtMs)
}

/** The step a page shows the detail of: the selected one, else the latest. */
export const selectedStep = (steps: ReadonlyArray<PageStep>, selected: string | null): PageStep | undefined =>
  steps.find((step) => step.row.id === selected) ?? steps.at(-1)

/** The journal's rows: the first page and every page More read after it. */
export const journalOf = (page: RunPage): ReadonlyArray<JournalRow> => {
  const inspection = page.inspection as Inspection
  return [...inspection.journal.events, ...(page.more as ReadonlyArray<JournalRow>)].map((event) => ({
    seq: event.seq,
    eventType: event.eventType,
    emittedAtMs: event.emittedAtMs,
    payload: event.payload,
  }))
}

/** How long a running run may record nothing before the page offers Resume: it may have no host driving it. */
export const STALLED_AFTER_MS = 60_000

/**
 * Which acts the page offers on a run at `now`: Stop while it hasn't settled and no stop was asked; Retry once it
 * settled, when its flow is retried; Resume while it waits, or runs but has recorded nothing for `STALLED_AFTER_MS`.
 */
export const actsOf = (inspection: Inspection, now: number) => {
  const { run } = inspection
  const last = inspection.journal.events.at(-1)?.emittedAtMs ?? run.createdAtMs
  return {
    stop: !settled(run.status) && run.cancelRequestedAtMs === null,
    retry: settled(run.status) && retryable(run.flowName),
    resume: run.status === "suspended" || (run.status === "running" && now - last >= STALLED_AFTER_MS),
  }
}

/** The runs a person's list shows, newest first: work, never an act on a run. */
export const listRows = (runs: ReadonlyArray<RunRow>): ReadonlyArray<UiRunRow> =>
  runs
    .filter((run) => listed(run.flow))
    .sort((left, right) => right.createdAtMs - left.createdAtMs)
    .map((run) => ({
      id: run.id,
      flow: run.flow,
      state: run.status,
      cancelRequested: run.cancelRequested,
      startedAtMs: run.startedAtMs ?? run.createdAtMs,
      finishedAtMs: run.finishedAtMs,
      href: runPath(run.id),
    }))

/** How many times `runId` was retried from this device: each Retry is one `run/retry` act, `retry:<runId>:<n>`. */
export const retriesOf = (runs: ReadonlyArray<RunRow>, runId: string): number =>
  runs.filter((run) => run.flow === "run/retry" && run.id.startsWith(`retry:${runId}:`)).length
