import type { AttemptRow, JsonValueData, JournalRow, RunRow as UiRunRow, StepRow, WaitData } from "@smthrs/ui"
import {
  CLOUD,
  COULDNT_READ,
  isRemoteRun,
  listed,
  NOT_FOUND,
  NOT_STARTED,
  ON_ANOTHER_DEVICE,
  runPath,
  settled,
  THIS_DEVICE,
} from "./contract"
import { retryable } from "./retry"
import type { Inspection, RunPage, RunRow } from "./schema"

// A run's page as a frontend draws it (decision 0014 §5, docs/features/runs.md#the-run-page): pure functions from the
// engine's read of a run to `@smthrs/ui`'s run-page rows. The steps are the plan's action calls and child boundaries,
// and the runs this run started: an agent's cell calls and a person's flow's pinned child, whose input and result are
// that step's input and output. The engine doesn't record an action's input, so only a child's step has one.

/** One step of the page: its row, and what its detail shows. */
export interface PageStep {
  readonly logs?: ReadonlyArray<JsonValueData>
  readonly row: StepRow
  readonly input: JsonValueData | null
  readonly output: JsonValueData | null
  readonly attempts: ReadonlyArray<AttemptRow>
  readonly wait: WaitData | null
  /** A child run's own page. */
  readonly href: string | null
}

/** The step a page shows the detail of: the selected one, else the latest. */
export const selectedStep = (steps: ReadonlyArray<PageStep>, selected: string | null): PageStep | undefined =>
  steps.find((step) => step.row.id === selected) ?? steps.find((step) => step.row.state === "running" || step.row.state === "waiting") ?? [...steps].reverse().find((step) => step.row.state !== "pending") ?? steps[0]

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
 * Each act runs on this device's engine, so a run on Cloudflare offers none: a TODO's run stops when its TODO drops.
 */
export const actsOf = (inspection: Inspection, now: number) => {
  const { run } = inspection
  if (isRemoteRun(run.runId)) return { stop: false, retry: false, resume: false }
  const last = inspection.journal.events.at(-1)?.emittedAtMs ?? run.createdAtMs
  return {
    stop: !settled(run.status) && run.cancelRequestedAtMs === null,
    retry: settled(run.status) && retryable(run.flowName),
    resume: run.status === "suspended" || (run.status === "running" && now - last >= STALLED_AFTER_MS),
  }
}

/** Where a run runs, as its header says: this device, or Cloudflare. */
export const hostOf = (runId: string): string => (isRemoteRun(runId) ? CLOUD : THIS_DEVICE)

/** What a page says when it has no run to show, by why. */
export const missingOf = (page: Pick<RunPage, "id" | "state">): string =>
  page.state === "not_started"
    ? NOT_STARTED
    : page.state === "not_found"
    ? isRemoteRun(page.id) ? NOT_FOUND : ON_ANOTHER_DEVICE
    : COULDNT_READ

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
