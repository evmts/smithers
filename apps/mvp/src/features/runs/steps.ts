import { FlowRuntime, Interpreter } from "@smthrs/flow"
import { EngineStore } from "@smthrs/flows"
import { Effect, Layer, Metric, Option, Schema } from "effect"
import { declarationOf as declared } from "../../flows/declarations"
import { type FlowName, names } from "../../flows/registry"
import { listed, RUN_LIST_LIMIT, retriedRunId, settled } from "./contract"
import {
  Cancel,
  CancelRun,
  Inspect,
  InspectRun,
  List,
  ListRuns,
  Resume,
  ResumeRun,
  Retry,
  RetryRun,
  RunActRefused,
} from "./flows"
import { retryable } from "./retry"
import { startRoot } from "./start"

// What the acts on runs and the run reads do (decision 0014 §2 and §6, docs/features/runs.md#acts): each reads the run
// through the engine's own `RunInspection` (`@smthrs/engine-store`, which the browser engine provides to every flow it
// registers) and acts through its `FlowRuntime`. Only an engine's host imports this module.

/** Acts on runs, by `act` (`cancel`, `retry`, `resume`), `host` and `outcome`. */
export const acts = Metric.counter("smithers_run_acts", {
  description: "Acts on runs, by act, host and outcome",
  incremental: true,
})

type Act = "cancel" | "retry" | "resume"

/** Records an act: `run.act` with its outcome, and its count. Ids and codes only. */
const recordAct = (act: Act, runId: string, outcome: string) =>
  Effect.andThen(
    Metric.update(Metric.withAttributes(acts, { act, host: "local", outcome }), 1),
    Effect.logWithLevel(outcome === "requested" || outcome === "retried" || outcome === "resumed" || outcome === "settled"
      ? "Info"
      : "Warn")("run.act").pipe(Effect.annotateLogs({ feature: "runs", act, runId, outcome })),
  )

/** Refuses `act` on `runId` with `code`, recorded. */
const refuse = (act: Act, runId: string, code: RunActRefused["code"]) =>
  Effect.andThen(recordAct(act, runId, code), Effect.fail(new RunActRefused({ code })))

/** The run's summary, or `not_found`. */
const summaryOf = (act: Act | undefined, runId: string) =>
  Effect.gen(function* () {
    const inspection = yield* EngineStore.RunInspection.RunInspection
    const read = yield* inspection.inspect(runId, { limit: 1 }).pipe(
      Effect.map(Option.some),
      Effect.catchTag("@smthrs/engine-store/RunNotFound", () => Effect.succeed(Option.none())),
      // A store that can't be read fails the act's step: the person's page says the engine couldn't be reached.
      Effect.orDie,
    )
    if (Option.isSome(read)) return read.value
    return yield* act === undefined ? Effect.fail(new RunActRefused({ code: "not_found" })) : refuse(act, runId, "not_found")
  })

/** The declaration this engine runs `flow` with, or none. */
const declarationOf = (flow: string) =>
  (names as ReadonlyArray<string>).includes(flow) ? declared(flow as FlowName) : undefined

/** `run/cancel/request`: Stop. A settled run answers its status; a fence from the future is stale. */
export const cancel = ({ runId, seq }: { readonly runId: string; readonly seq: number }) =>
  Effect.gen(function* () {
    const { run } = yield* summaryOf("cancel", runId)
    if (settled(run.status)) {
      yield* recordAct("cancel", runId, "settled")
      return { outcome: "settled" as const, status: run.status }
    }
    if (seq > run.lastSeq) return yield* refuse("cancel", runId, "stale")
    const flow = declarationOf(run.flowName)
    if (flow === undefined) return yield* refuse("cancel", runId, "not_here")
    // A cancellation the store couldn't record leaves the run going: the step fails, and the person sees it.
    yield* Effect.orDie((yield* FlowRuntime.FlowRuntime).interrupt(flow, runId))
    yield* recordAct("cancel", runId, "requested")
    return { outcome: "requested" as const, status: run.status }
  })

/** `run/resume/drive`: Resume. Only a run that hasn't settled and hasn't moved since the page read it. */
export const resume = ({ runId, seq }: { readonly runId: string; readonly seq: number }) =>
  Effect.gen(function* () {
    const { run } = yield* summaryOf("resume", runId)
    if (settled(run.status)) return yield* refuse("resume", runId, "settled")
    if (seq !== run.lastSeq) return yield* refuse("resume", runId, "stale")
    const flow = declarationOf(run.flowName)
    if (flow === undefined) return yield* refuse("resume", runId, "not_here")
    yield* (yield* FlowRuntime.FlowRuntime).resume(flow, runId)
    yield* recordAct("resume", runId, "resumed")
    return { resumed: true }
  })

/** A stored payload with what `version` asks: `current` drops the revision a person's flow pinned. */
export const versioned = (flow: string, payload: unknown, version: "pinned" | "current"): unknown => {
  if (version === "pinned" || flow !== "flow/run" || typeof payload !== "object" || payload === null) return payload
  const { revision: _revision, ...rest } = payload as Record<string, unknown>
  return rest
}

/** `run/retry/start`: Retry. A settled run of a retryable flow, again, as a new run of its own. */
export const retry = ({ runId, version }: { readonly runId: string; readonly version: "pinned" | "current" }) =>
  Effect.gen(function* () {
    const { run } = yield* summaryOf("retry", runId)
    if (!settled(run.status)) return yield* refuse("retry", runId, "not_settled")
    if (!retryable(run.flowName)) return yield* refuse("retry", runId, "not_retryable")
    // A retryable flow is a registered one, so this engine runs it.
    const flow = declared(run.flowName as FlowName)
    // The run was read a moment ago: a store that can't read it now is a defect, not an answer.
    const stored = yield* Effect.orDie((yield* EngineStore.RunInspection.RunInspection).payload(runId))
    // The engine stored the payload encoded by the flow's own schema; a registered flow's schema needs no service.
    const codec = Schema.toCodecJson(flow.payloadSchema) as unknown as Schema.Codec<unknown, unknown>
    const payload = yield* Schema.decodeUnknownEffect(codec)(versioned(run.flowName, stored.payload, version)).pipe(
      Effect.catch(() => refuse("retry", runId, "not_retryable")),
    )
    const instance = yield* FlowRuntime.FlowInstance
    const retried = retriedRunId(instance.executionId)
    yield* startRoot(flow, retried, payload)
    yield* recordAct("retry", runId, "retried")
    return { runId: retried }
  })

/** `run/list/read`: the newest runs a person lists, acts on runs left out. */
export const list = () =>
  Effect.gen(function* () {
    // A store that can't be read fails the read: the agent hears it failed, never an empty list.
    const page = yield* Effect.orDie((yield* EngineStore.RunInspection.RunInspection).list({ limit: RUN_LIST_LIMIT }))
    return {
      runs: page.runs.filter((run) => listed(run.flowName)).map((run) => ({
        runId: run.runId,
        flow: run.flowName,
        status: run.status,
        createdAtMs: run.createdAtMs,
        finishedAtMs: run.finishedAtMs,
        seq: run.lastSeq,
      })),
    }
  })

/** `run/inspect/read`: one run, compact: its steps by action, and its result's text. */
export const inspect = ({ runId }: { readonly runId: string }) =>
  Effect.gen(function* () {
    const { run, steps } = yield* summaryOf(undefined, runId)
    return {
      runId: run.runId,
      flow: run.flowName,
      status: run.status,
      seq: run.lastSeq,
      steps: steps.map((step) => ({ action: step.action, status: step.status })),
      result: run.result?.text ?? null,
    }
  })

/** The acts and reads, registered with their steps. Needs the engine's `FlowRuntime` and `RunInspection`. */
export const registration = Layer.mergeAll(
  Interpreter.layerWithImplementations(Cancel, CancelRun.toLayer(cancel)),
  Interpreter.layerWithImplementations(Retry, RetryRun.toLayer(retry)),
  Interpreter.layerWithImplementations(Resume, ResumeRun.toLayer(resume)),
  Interpreter.layerWithImplementations(List, ListRuns.toLayer(list)),
  Interpreter.layerWithImplementations(Inspect, InspectRun.toLayer(inspect)),
)
