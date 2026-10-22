import { Agent, Budget, QuotaPolicy } from "@smthrs/agent"
import { digestSync, Uuid } from "@smthrs/crypto"
import { FlowRuntime, Interpreter } from "@smthrs/flow"
import { Evaluator } from "@smthrs/model"
import { Clock, Effect, Layer, Option } from "effect"
import * as AgentHost from "../agent/host"
import { startRoot } from "../runs/start"
import { FlowsClient } from "./api"
import { DRAFT_ID_NAMESPACE } from "./contract"
import { PROMPT_CALLABLE } from "./callable"
import { checkSource, passes, readSource } from "./checks"
import {
  AdmitSave,
  AdmitWrite,
  DraftFlow,
  type Drafted,
  FlowAnswer,
  FlowDelete,
  FlowDraftDelete,
  FlowList,
  FlowNew,
  FlowPrompt,
  FlowRead,
  FlowRun,
  FlowSave,
  FlowWrite,
  LoadFlow,
  NextRound,
  OpenRound,
  type Opened,
  PromptAgent,
  ReadCode,
  ReadFlows,
  RecordAnswers,
  RemoveDraft,
  RemoveFlow,
  WriteRound,
} from "./flows"
import { type DraftFailure, draftFailure } from "./failure"
import { recordLoad, recordRound, recordSave, recordWrite } from "./metrics"
import { roundExecutionId, roundOf } from "./round"
import { DraftNotReady, FlowInvalid, FlowNeedsSandbox, NameTaken } from "./reference"
import type { DraftQuestion, DraftStatus } from "./schema"
import { placementOf, readGenerated, renderSource, SOURCE_PATH } from "./source"

// What your own flows' steps do (decision 0014 §2, docs/features/flows.md#your-own-flows): ChatApi's flows and drafts
// routes through `FlowsClient`, the static checks over the registry's `ModuleFlow` (./checks.ts), and the agent through
// the same seat, catalog and policies `chat/Answer` runs on (src/features/agent/host.ts). Only an engine's host imports
// this module: the engine worker and the Node host.

/** The answered questions of a round, as the drafting agent reads them. */
const answered = (questions: ReadonlyArray<DraftQuestion>) =>
  questions.flatMap((question) => (question.answer === undefined ? [] : [{ question: question.text, answer: question.answer }]))

/** `flow/new/open`: writes the round's draft row (drafting) and reads what the agent drafts from. */
export const open = ({ name, request }: { readonly name: string; readonly request: string }) =>
  Effect.gen(function* () {
    const client = yield* FlowsClient
    const instance = yield* FlowRuntime.FlowInstance
    const openedAtMs = yield* Clock.currentTimeMillis
    const named = roundOf(instance.executionId)
    // A draft started outside a round (an agent's call, a slash command) is named by its execution, never at random.
    const draftId = named?.draftId ?? (yield* Uuid.v5(DRAFT_ID_NAMESPACE, instance.executionId).pipe(Effect.orDie))
    const round = named?.round ?? 0
    if (round === 0) {
      // A name the person already has: this draft edits that flow, from its latest revision.
      const existing = yield* client.source(name).pipe(
        Effect.map(Option.some),
        Effect.catchTag("@smthrs/mvp/flows/FlowNotFound", () => Effect.succeed(Option.none())),
      )
      const flowId = Option.match(existing, { onNone: () => null, onSome: (flow) => flow.flowId })
      yield* client.writeDraft(draftId, {
        scope: "person",
        round,
        request,
        name,
        status: "drafting",
        summary: null,
        files: [],
        checks: [],
        questions: [],
        failure: null,
        flowId,
      })
      return {
        draftId,
        round,
        name,
        request,
        flowId,
        previous: Option.match(existing, { onNone: () => null, onSome: (flow) => flow.source }),
        answers: [],
        openedAtMs,
      } satisfies Opened
    }
    const draft = yield* client.draft(draftId)
    yield* client.writeDraft(draftId, {
      scope: "person",
      round,
      request: draft.request,
      name: draft.name,
      status: "drafting",
      summary: draft.summary,
      files: draft.files,
      checks: draft.checks,
      questions: draft.questions,
      failure: null,
      flowId: draft.flowId,
    })
    return {
      draftId,
      round,
      name,
      request: draft.request,
      flowId: draft.flowId,
      previous: draft.files[0]?.text ?? null,
      answers: answered(draft.questions),
      openedAtMs,
    } satisfies Opened
  })

/**
 * What `flow/new/write` writes for a round: the round's status, file, checks, questions and why it failed. A draft whose
 * checks fail is a failed round (`checks`), with its file and checks shown; one the agent never drafted failed with
 * the agent's code (./failure.ts).
 */
export const roundOutcome = (input: {
  readonly round: number
  readonly name: string
  readonly drafted: Drafted | null
  readonly failure?: unknown
}): {
  readonly status: Exclude<DraftStatus, "drafting" | "saved" | "proposed">
  readonly files: ReadonlyArray<{ readonly path: string; readonly text: string }>
  readonly checks: ReturnType<typeof checkSource>
  readonly questions: ReadonlyArray<DraftQuestion>
  readonly summary: string | null
  readonly failure: DraftFailure | null
} => {
  const { drafted } = input
  if (drafted === null) {
    return { status: "failed", files: [], checks: [], questions: [], summary: null, failure: draftFailure(input.failure) }
  }
  const text = renderSource({
    name: input.name,
    description: drafted.description,
    flows: drafted.flows,
    instructions: drafted.instructions,
  })
  const questions = drafted.questions.map((question, index) => ({
    id: `r${input.round}q${index + 1}`,
    text: question.text,
    assumed: question.assumed,
    blocking: question.blocking,
  }))
  const checks = checkSource(text, input.name, PROMPT_CALLABLE)
  const passed = passes(checks)
  return {
    status: !passed ? "failed" : questions.some((question) => question.blocking) ? "needs_you" : "ready",
    files: [{ path: SOURCE_PATH, text }],
    checks,
    questions,
    summary: drafted.summary === "" ? null : drafted.summary,
    failure: passed ? null : "checks",
  }
}

/** `flow/new/write`: the round's file, checks and questions on the draft's row, and the round's record. */
export const write = (input: typeof WriteRound.payloadSchema.Type) =>
  Effect.gen(function* () {
    const outcome = roundOutcome(input)
    yield* (yield* FlowsClient).writeDraft(input.draftId, {
      scope: "person",
      round: input.round,
      request: input.request,
      name: input.name,
      status: outcome.status,
      summary: outcome.summary,
      files: outcome.files,
      checks: outcome.checks,
      questions: outcome.questions,
      failure: outcome.failure,
      flowId: input.flowId,
    })
    yield* recordRound({
      draftId: input.draftId,
      round: input.round,
      outcome: outcome.status,
      failure: outcome.failure,
      checks: outcome.checks.flatMap((check) => (check.ok ? [] : [`${check.check}:${check.code}`])),
      questions: outcome.questions.length,
      durationMs: (yield* Clock.currentTimeMillis) - input.openedAtMs,
    })
    return { draftId: input.draftId, round: input.round, status: outcome.status, name: input.name }
  })

/** `flow/answer/record`: records the answers, and reads the draft's name and request back for the next round. */
export const record = (input: typeof RecordAnswers.payloadSchema.Type) =>
  Effect.gen(function* () {
    const client = yield* FlowsClient
    yield* client.answer(input.draftId, { round: input.round, answers: input.answers })
    const draft = yield* client.draft(input.draftId)
    // `flow/new` names every draft it writes.
    return { name: draft.name!, request: draft.request }
  })

/** `flow/answer/next`: starts the draft's next round, without waiting for it. */
export const next = (input: typeof NextRound.payloadSchema.Type) =>
  Effect.gen(function* () {
    const round = input.round + 1
    yield* startRoot(FlowNew, roundExecutionId(input.draftId, round), { name: input.name, request: input.request })
    return { draftId: input.draftId, round }
  })

/** `flow/save/admit`: the draft's file, checked again here, saved through ChatApi. */
export const admit = ({ draftId }: { readonly draftId: string }) =>
  Effect.gen(function* () {
    const client = yield* FlowsClient
    const draft = yield* client.draft(draftId)
    const notReady = (code: string) =>
      Effect.andThen(recordSave(draftId, code), Effect.fail(new DraftNotReady({ code })))
    const [file] = draft.files
    if (draft.status !== "ready" && draft.status !== "saved") return yield* notReady("not_ready")
    if (draft.name === null || file === undefined || file.path !== SOURCE_PATH) return yield* notReady("not_ready")
    if (draft.questions.some((question) => question.blocking && question.answer === undefined)) {
      return yield* notReady("needs_you")
    }
    // Checked again where the write is admitted (decision 0014 §2): the file the round checked, as it is now.
    if (!passes(checkSource(file.text, draft.name, PROMPT_CALLABLE))) return yield* notReady("checks")
    const saved = yield* client.save({
      draftId,
      name: draft.name,
      // The checks passed, so the registry read a description.
      description: readSource(file.text, draft.name).description!,
      source: file.text,
      digest: digestSync(file.text),
    }).pipe(
      Effect.catchTag("@smthrs/mvp/flows/FlowsRefused", (refused) =>
        Effect.gen(function* () {
          yield* recordSave(draftId, refused.code)
          return yield* refused.code === "name_taken" ? Effect.fail(new NameTaken()) : Effect.fail(refused)
        })),
    )
    yield* recordSave(draftId, "saved")
    return { flowId: saved.flowId, name: saved.name, revision: saved.revision }
  })

/**
 * `flow/run/load`: one revision's flow.ts, its digest and checks verified, pinned with what it may call. Only a drafted
 * flow as drafted runs here: any other code fails `FlowNeedsSandbox` before anything runs (./source.ts).
 */
export const load = (input: typeof LoadFlow.payloadSchema.Type) =>
  Effect.gen(function* () {
    const found = yield* (yield* FlowsClient).source(input.name, input.revision)
    const invalid = (check: string) => Effect.andThen(recordLoad(check), Effect.fail(new FlowInvalid({ check })))
    if (digestSync(found.source) !== found.digest) return yield* invalid("digest")
    const failed = checkSource(found.source, found.name, PROMPT_CALLABLE).find((check) => !check.ok)
    if (failed !== undefined) return yield* invalid(failed.check)
    const generated = readGenerated(found.source)
    if (generated === undefined) return yield* Effect.andThen(recordLoad("sandbox"), Effect.fail(new FlowNeedsSandbox()))
    yield* recordLoad("loaded")
    return {
      flowId: found.flowId,
      name: found.name,
      revision: found.revision,
      digest: found.digest,
      instructions: generated.instructions,
      allowed: generated.flows,
      input: input.input ?? "",
    }
  })

/** `flow/read/source`: one revision's code, and where it runs. */
export const read = (input: typeof ReadCode.payloadSchema.Type) =>
  Effect.gen(function* () {
    const found = yield* (yield* FlowsClient).source(input.name, input.revision)
    return {
      flowId: found.flowId,
      name: found.name,
      revision: found.revision,
      source: found.source,
      placement: placementOf(found.source),
    }
  })

/** How a refused write is recorded: ChatApi's code, `not_found`, or `unavailable`. */
export const writeOutcome = (error: { readonly _tag: string; readonly code?: string }): string =>
  error.code ?? (error._tag === "@smthrs/mvp/flows/FlowNotFound" ? "not_found" : "unavailable")

/** `flow/write/admit`: the code, checked here as every revision is, saved through ChatApi as the next revision. */
export const writeCode = (input: typeof AdmitWrite.payloadSchema.Type) =>
  Effect.gen(function* () {
    const placement = placementOf(input.source)
    const failed = checkSource(input.source, input.name, PROMPT_CALLABLE).find((check) => !check.ok)
    if (failed !== undefined) {
      return yield* Effect.andThen(recordWrite(`check:${failed.check}`, placement), Effect.fail(new FlowInvalid({ check: failed.check })))
    }
    const written = yield* (yield* FlowsClient).write({
      name: input.name,
      revision: input.revision,
      // The checks passed, so the registry read a description.
      description: readSource(input.source, input.name).description!,
      source: input.source,
      digest: digestSync(input.source),
    }).pipe(Effect.tapError((error) => recordWrite(writeOutcome(error), placement)))
    yield* recordWrite("written", placement)
    return { flowId: written.flowId, name: written.name, revision: written.revision, placement }
  })

/** `flow/delete/remove`: deletes it; `deleted` is false when it was gone already. */
export const remove = ({ flowId }: { readonly flowId: string }) =>
  Effect.flatMap(FlowsClient, (client) => client.remove(flowId)).pipe(Effect.map((deleted) => ({ deleted })))

/**
 * `flow/draft/delete/remove`: stops the draft's round if this engine runs it (a round elsewhere is refused when it
 * writes), then deletes the draft; `deleted` is false when it was gone already or isn't the person's.
 */
export const removeDraft = ({ draftId }: { readonly draftId: string }) =>
  Effect.gen(function* () {
    const client = yield* FlowsClient
    // Refused (gone, or not the person's): nothing this person can delete.
    const draft = yield* client.draft(draftId).pipe(
      Effect.map(Option.some),
      Effect.catchTag("@smthrs/mvp/flows/FlowsRefused", () => Effect.succeed(Option.none())),
    )
    if (Option.isNone(draft)) return { deleted: false }
    // An id this engine doesn't hold is ignored; a stop the store couldn't record leaves a round whose write is refused.
    yield* Effect.ignore((yield* FlowRuntime.FlowRuntime).interrupt(FlowNew, roundExecutionId(draftId, draft.value.round)))
    return { deleted: yield* client.deleteDraft(draftId) }
  })

/** `flow/list/read`: the person's flows. */
export const list = () =>
  Effect.flatMap(FlowsClient, (client) => client.list).pipe(
    Effect.map(({ flows }) => ({
      flows: flows.map(({ name, description, revision, placement }) => ({ name, description, revision, placement })),
    })),
  )

/**
 * Every `flow/*` flow registered with its steps. The agent's steps need the agent's runtime (`agentRuntime`), and
 * every step that calls ChatApi needs `FlowsClient`.
 */
export const registration = Layer.mergeAll(
  Interpreter.layerWithImplementations(
    FlowNew,
    Layer.mergeAll(OpenRound.toLayer(open), DraftFlow.layer, WriteRound.toLayer(write)),
  ),
  Interpreter.layerWithImplementations(
    FlowAnswer,
    Layer.mergeAll(RecordAnswers.toLayer(record), NextRound.toLayer(next)),
  ),
  Interpreter.layerWithImplementations(FlowSave, AdmitSave.toLayer(admit)),
  Interpreter.layerWithImplementations(FlowRun, LoadFlow.toLayer(load)),
  Interpreter.layerWithImplementations(FlowPrompt, PromptAgent.layer),
  Interpreter.layerWithImplementations(FlowRead, ReadCode.toLayer(read)),
  Interpreter.layerWithImplementations(FlowWrite, AdmitWrite.toLayer(writeCode)),
  Interpreter.layerWithImplementations(FlowDelete, RemoveFlow.toLayer(remove)),
  Interpreter.layerWithImplementations(FlowDraftDelete, RemoveDraft.toLayer(removeDraft)),
  Interpreter.layerWithImplementations(FlowList, ReadFlows.toLayer(list)),
)

/**
 * The agent's runtime for the drafting and running agents: the model endpoint's `agent` seat on `origin`, the app's
 * catalog (scoped per run, src/flows/catalog.ts) and `chat/Answer`'s policies. Their events go to no sink: a person's
 * flow shows on its run page, not as an answer's parts.
 */
export const agentRuntime = (origin: string) =>
  Layer.mergeAll(AgentHost.agentHost, AgentHost.seats(origin), Agent.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(QuotaPolicy.layerDefault(), Budget.layerUnbounded())),
    Layer.provideMerge(Layer.mergeAll(Agent.layerDefaults, Evaluator.layerUnavailable())),
  )

/** Your own flows on a host: the registration, with ChatApi on `origin` and the agent's runtime. */
export const layer = (origin: string) =>
  registration.pipe(
    Layer.provide(agentRuntime(origin)),
    Layer.provide(FlowsClient.layer({ origin })),
  )
