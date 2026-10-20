import { Agent, Budget, QuotaPolicy } from "@smthrs/agent"
import { digestSync } from "@smthrs/crypto"
import { FlowRuntime, Interpreter } from "@smthrs/flow"
import { Evaluator } from "@smthrs/model"
import { Clock, Effect, Layer, Option } from "effect"
import * as AgentHost from "../agent/host"
import { startRoot } from "../runs/start"
import { FlowsClient } from "./api"
import { PROMPT_CALLABLE } from "./callable"
import { SKILL_PATH } from "./contract"
import {
  AdmitSave,
  DraftFlow,
  type Drafted,
  FlowAnswer,
  FlowDelete,
  FlowList,
  FlowNew,
  FlowPrompt,
  FlowRun,
  FlowSave,
  LoadFlow,
  NextRound,
  OpenRound,
  type Opened,
  PromptAgent,
  ReadFlows,
  RecordAnswers,
  RemoveFlow,
  WriteRound,
} from "./flows"
import { recordLoad, recordRound, recordSave } from "./metrics"
import { roundExecutionId, roundOf } from "./round"
import { DraftNotReady, FlowInvalid, NameTaken } from "./reference"
import type { DraftQuestion, DraftStatus } from "./schema"
import { checkSkill, passes, readSkill, renderSkill } from "./skill"

// What your own flows' steps do (decision 0014 §2, docs/features/flows.md#your-own-flows): ChatApi's flows and drafts
// routes through `FlowsClient`, the static checks over the registry's `MarkdownFlow`, and the agent through the same
// seat, catalog and policies `chat/Answer` runs on (src/features/agent/host.ts). Only an engine's host imports this
// module: the engine worker and the Node host.

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
    const draftId = named?.draftId ?? crypto.randomUUID()
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

/** What `flow/new/write` writes for a round: the round's status, file, checks and questions. */
export const roundOutcome = (input: {
  readonly round: number
  readonly name: string
  readonly drafted: Drafted | null
}): {
  readonly status: Exclude<DraftStatus, "drafting" | "saved" | "proposed">
  readonly files: ReadonlyArray<{ readonly path: string; readonly text: string }>
  readonly checks: ReturnType<typeof checkSkill>
  readonly questions: ReadonlyArray<DraftQuestion>
  readonly summary: string | null
} => {
  const { drafted } = input
  if (drafted === null) return { status: "failed", files: [], checks: [], questions: [], summary: null }
  const text = renderSkill({
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
  return {
    status: questions.some((question) => question.blocking) ? "needs_you" : "ready",
    files: [{ path: SKILL_PATH, text }],
    checks: checkSkill(text, input.name, PROMPT_CALLABLE),
    questions,
    summary: drafted.summary === "" ? null : drafted.summary,
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
      failure: input.failure,
      flowId: input.flowId,
    })
    yield* recordRound({
      draftId: input.draftId,
      round: input.round,
      outcome: outcome.status,
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
    if (draft.name === null || file === undefined || file.path !== SKILL_PATH) return yield* notReady("not_ready")
    if (draft.questions.some((question) => question.blocking && question.answer === undefined)) {
      return yield* notReady("needs_you")
    }
    // Checked again where the write is admitted (decision 0014 §2): the file the round checked, as it is now.
    if (!passes(checkSkill(file.text, draft.name, PROMPT_CALLABLE))) return yield* notReady("checks")
    const skill = readSkill(file.text, draft.name).skill!
    const saved = yield* client.save({
      draftId,
      name: draft.name,
      description: skill.description,
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

/** `flow/run/load`: one revision's `SKILL.md`, its digest and checks verified, pinned with what it may call. */
export const load = (input: typeof LoadFlow.payloadSchema.Type) =>
  Effect.gen(function* () {
    const found = yield* (yield* FlowsClient).source(input.name, input.revision)
    const invalid = (check: string) => Effect.andThen(recordLoad(check), Effect.fail(new FlowInvalid({ check })))
    if (digestSync(found.source) !== found.digest) return yield* invalid("digest")
    const failed = checkSkill(found.source, found.name, PROMPT_CALLABLE).find((check) => !check.ok)
    if (failed !== undefined) return yield* invalid(failed.check)
    const skill = readSkill(found.source, found.name).skill!
    yield* recordLoad("loaded")
    return {
      flowId: found.flowId,
      name: found.name,
      revision: found.revision,
      digest: found.digest,
      instructions: skill.instructions,
      allowed: skill.flows,
      input: input.input ?? "",
    }
  })

/** `flow/delete/remove`: deletes it; `deleted` is false when it was gone already. */
export const remove = ({ flowId }: { readonly flowId: string }) =>
  Effect.flatMap(FlowsClient, (client) => client.remove(flowId)).pipe(Effect.map((deleted) => ({ deleted })))

/** `flow/list/read`: the person's flows. */
export const list = () =>
  Effect.flatMap(FlowsClient, (client) => client.list).pipe(
    Effect.map(({ flows }) => ({
      flows: flows.map(({ name, description, revision }) => ({ name, description, revision })),
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
  Interpreter.layerWithImplementations(FlowDelete, RemoveFlow.toLayer(remove)),
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
