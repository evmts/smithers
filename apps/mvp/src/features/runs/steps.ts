import { Uuid } from "@smthrs/crypto"
import { FlowRuntime, Interpreter } from "@smthrs/flow"
import { EngineStore } from "@smthrs/flows"
import { Clock, Context, type Duration, Effect, Layer, Metric, Option, Schema } from "effect"
import { asker } from "../../flows/askingTab"
import { RunCredentials } from "../../flows/credentials"
import { declarationOf as declared } from "../../flows/declarations"
import type { Door } from "../../flows/dispatch"
import { type FlowName, names } from "../../flows/registry"
import { requesterOf } from "../../flows/requests"
import {
  listed,
  RUN_LIST_LIMIT,
  retriedRunId,
  runsChannel,
  settled,
  STEER_ID_NAMESPACE,
  STEER_QUEUE_WITHIN,
} from "./contract"
import {
  Cancel,
  CancelRun,
  Inspect,
  InspectRun,
  List,
  ListRuns,
  QueueSteer,
  Resume,
  ResumeRun,
  Retry,
  RetryRun,
  RunActRefused,
  Steer,
  SteerStepRefused,
} from "./flows"
import { steersQueued } from "./metrics"
import { type RunsCall, SteerKept } from "./schema"
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
  // The latest: neither the revision nor the flow it ran.
  const { revision: _revision, flowId: _flowId, ...rest } = payload as Record<string, unknown>
  return rest
}

/**
 * What a run of your flow (`flow/run`) ran: the flow id and revision its load pinned, as its `flow/run/prompt` child's
 * payload holds them, or none when it never got that far. A pinned Retry runs exactly those, even when the run named no
 * revision or the flow's name went to another flow since.
 */
const ranRevision = (children: ReadonlyArray<{ readonly runId: string; readonly flowName: string }>) =>
  Effect.gen(function* () {
    const child = children.find((each) => each.flowName === "flow/run/prompt")
    if (child === undefined) return undefined
    const read = yield* (yield* EngineStore.RunInspection.RunInspection).payload(child.runId).pipe(Effect.option)
    if (Option.isNone(read)) return undefined
    const { flowId, revision } = read.value.payload as { readonly flowId?: unknown; readonly revision?: unknown }
    return typeof flowId === "string" && typeof revision === "number" ? { flowId, revision } : undefined
  })

/** `run/retry/start`: Retry. A settled run of a retryable flow, again, as a new run of its own. */
export const retry = ({ runId, version }: { readonly runId: string; readonly version: "pinned" | "current" }) =>
  Effect.gen(function* () {
    const { run, children } = yield* summaryOf("retry", runId)
    if (!settled(run.status)) return yield* refuse("retry", runId, "not_settled")
    if (!retryable(run.flowName)) return yield* refuse("retry", runId, "not_retryable")
    // A retryable flow is a registered one, so this engine runs it.
    const flow = declared(run.flowName as FlowName)
    // The run was read a moment ago: a store that can't read it now is a defect, not an answer.
    const stored = yield* Effect.orDie((yield* EngineStore.RunInspection.RunInspection).payload(runId))
    const ran = version === "pinned" && run.flowName === "flow/run" ? yield* ranRevision(children) : undefined
    const original = ran === undefined ? stored.payload : { ...(stored.payload as object), ...ran }
    // The engine stored the payload encoded by the flow's own schema; a registered flow's schema needs no service.
    const codec = Schema.toCodecJson(flow.payloadSchema) as unknown as Schema.Codec<unknown, unknown>
    const payload = yield* Schema.decodeUnknownEffect(codec)(versioned(run.flowName, original, version)).pipe(
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
    const inspection = yield* EngineStore.RunInspection.RunInspection
    const runs: Array<EngineStore.RunInspection.RunList["runs"][number]> = []
    let cursor: string | undefined
    do {
      const page = yield* Effect.orDie(inspection.list({ limit: RUN_LIST_LIMIT, ...(cursor === undefined ? {} : { cursor }) }))
      runs.push(...page.runs.filter((run) => listed(run.flowName)))
      cursor = page.cursor ?? undefined
    } while (runs.length < RUN_LIST_LIMIT && cursor !== undefined)
    return {
      runs: runs.slice(0, RUN_LIST_LIMIT).map((run) => ({
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

/** The tabs of this browser, as a steer step reaches them: only the tab that started a request answers. */
export class TabRuns extends Context.Service<
  TabRuns,
  {
    /** Asks the tab that started `requester` to queue `call`'s message; none when no tab answered within the wait. */
    readonly ask: (call: { readonly requester: string; readonly call: RunsCall }) => Effect.Effect<
      Option.Option<{ readonly door: Door; readonly kept: boolean }>
    >
  }
>()("@smthrs/mvp/runs/TabRuns") {
  /** Over the runs channel of engine `name` (`TabChannel`), waiting `within` (`STEER_QUEUE_WITHIN` unless set). */
  static readonly layerChannel = (options: { readonly name: string; readonly within?: Duration.Input }) =>
    Layer.effect(
      TabRuns,
      Effect.gen(function* () {
        const ask = yield* asker<RunsCall, typeof SteerKept>({
          channel: runsChannel(options.name),
          output: SteerKept,
          within: options.within ?? STEER_QUEUE_WITHIN,
        })
        return TabRuns.of({
          ask: ({ requester, call }) =>
            ask(requester, call).pipe(Effect.map(Option.map(({ door, output }) => ({ door, kept: output.kept })))),
        })
      }),
    )
}

/**
 * What `run/steer/queue` does (docs/features/runs.md#steering): derive the message's id from the run, so a step run
 * again names the same message, and ask the tab that started the run, the person's or the one whose agent asked, to put
 * it in the device's outbox; answer `requested`. A run that isn't the person's own press, the agent's call among them,
 * hands the tab its run credential with the message, so ChatApi reads who sent it from that (decision 0017 slice 0).
 * Records a span `runs.steer.queue`, a log line and a count of `steersQueued` by door and outcome, never the message. A
 * tab gone, an outbox that wouldn't take it, or a run with no credential to send fails `SteerStepRefused`.
 */
export const queueSteer = (payload: { readonly runId: string; readonly body: string }) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const { executionId } = yield* FlowRuntime.FlowInstance
    const requester = requesterOf(executionId)
    const via = executionId !== requester ? "agent" : "person"
    const steerId = yield* Uuid.v5(STEER_ID_NAMESPACE, executionId).pipe(Effect.orDie)
    const credential = yield* Effect.result((yield* RunCredentials).bearer)
    // A run that has no credential to send queues nothing: its message never goes in the person's session.
    const reply = credential._tag === "Failure" ? Option.none() : yield* (yield* TabRuns).ask({
      requester,
      call: {
        kind: "steer",
        steer: {
          id: steerId,
          runId: payload.runId,
          body: payload.body,
          ...(Option.isSome(credential.success) ? { credential: credential.success.value } : {}),
        },
      },
    })
    const door: Door | "unknown" = via === "agent"
      ? "agent"
      : Option.match(reply, { onNone: () => "unknown" as const, onSome: (answered) => answered.door })
    const outcome = credential._tag === "Failure"
      ? "no_credential" as const
      : Option.isNone(reply)
      ? "tab_gone" as const
      : reply.value.kept
      ? "kept" as const
      : "not_kept" as const
    yield* Metric.update(Metric.withAttributes(steersQueued, { door, outcome }), 1)
    yield* Effect.annotateCurrentSpan({ steerId, runId: payload.runId, via, door, outcome })
    yield* Effect.logWithLevel(outcome === "kept" ? "Info" : "Warn")("runs.steer.queue").pipe(
      Effect.annotateLogs({
        steerId,
        runId: payload.runId,
        via,
        door,
        outcome,
        durationMs: (yield* Clock.currentTimeMillis) - startedAt,
        feature: "runs",
      }),
    )
    if (outcome !== "kept") return yield* new SteerStepRefused({ reason: outcome })
    return { steerId, status: "requested" as const }
  }).pipe(Effect.withSpan("runs.steer.queue"))

/**
 * The acts and reads, registered with their steps, and `run/steer` asking through the host's `TabRuns`. Needs the
 * engine's `FlowRuntime` and `RunInspection`.
 */
export const registration = Layer.mergeAll(
  Interpreter.layerWithImplementations(Steer, QueueSteer.toLayer(queueSteer)),
  Interpreter.layerWithImplementations(Cancel, CancelRun.toLayer(cancel)),
  Interpreter.layerWithImplementations(Retry, RetryRun.toLayer(retry)),
  Interpreter.layerWithImplementations(Resume, ResumeRun.toLayer(resume)),
  Interpreter.layerWithImplementations(List, ListRuns.toLayer(list)),
  Interpreter.layerWithImplementations(Inspect, InspectRun.toLayer(inspect)),
)
