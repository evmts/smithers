import { AgentAction } from "@smthrs/agent"
import { Action, Flow, RetryPolicy } from "@smthrs/flow"
import { Node, Placement } from "@smthrs/plan"
import { Schema } from "effect"
import { FLOW_MODEL_ROLE, MAX_CALLS, MAX_FLOW_FRAMES, MAX_QUESTIONS } from "./contract"
import { PROMPT_CATALOG } from "./callable"
import { AUTHOR_SYSTEM, authorPrompt, FLOW_SYSTEM, flowPrompt } from "./instructions"
import {
  DraftNotReady,
  FlowAnswerReference,
  FlowDeleteReference,
  FlowDraftDeleteReference,
  FlowInvalid,
  FlowDraftsReference,
  FlowListReference,
  FlowNeedsSandbox,
  FlowNewReference,
  FlowNotFound,
  FlowPromptReference,
  FlowReadReference,
  FlowRunReference,
  FlowSaveReference,
  FlowsRefused,
  FlowsUnavailable,
  FlowWriteReference,
  NameTaken,
  Pinned,
  RouteFailure,
  RoundEnded,
  SavedFlow,
} from "./reference"
import { Description } from "./schema"

// Your own flows, as an engine runs them (decision 0014 §2, docs/features/flows.md#your-own-flows). A person's flow is
// flow source, a `Flow.make` module (./source.ts), whether drafted from a prompt or written by hand:
//
//   flow/new { name, request }          execution <draftId>:<round>; any other id starts round 0 of a new draft
//     flow/new/open   ─ the draft row (drafting), the flow it edits, the draft so far and the person's answers
//     flow/new/draft  ─ the agent drafts: description, instructions, flows, questions ≤ 5 (AgentAction, seat agent)
//     flow/new/write  ─ the flow.ts it makes, the static checks, the row: ready, needs_you or failed
//   flow/answer { draftId, round, answers } ─ records them, then starts round n + 1
//   flow/save { draftId }               ─ a ready draft becomes your flow
//   flow/read { name, revision? }       ─ a revision's code, and where it runs
//   flow/write { name, revision, source } ─ code you wrote, checked, becomes the next revision
//   flow/run { name, input?, revision?, flowId? }
//     flow/run/load   ─ the revision's flow.ts, its digest and its checks; code not drafted as drafted needs a sandbox
//     flow/run/prompt ─ a child execution, whose payload pins the revision and its list: the agent follows it
//   flow/draft/delete { draftId }      ─ stops the draft's round here, then deletes the draft
//   flow/delete { flowId }, flow/list
//
// A drafted flow's body is one agent step that follows its instructions; `flow/run/prompt` is that step as this engine
// declares it, its payload pinned from the source, so the person's own engine runs only code the system wrote. Every
// model call is a sealed step of its run through the server's model endpoint, role `agent`, and the agent reaches the
// world only through the calls the flow lists (src/flows/catalog.ts). What a step does is injected by the host
// (./steps.ts). This module imports @smthrs/agent, so only an engine's host imports it; the tab dispatches by
// ./reference.ts.

/** The steps that call ChatApi: tried for a minute while it can't answer; a refusal or a missing flow is final. */
export const ROUTE_RETRY = RetryPolicy.make({
  initialMs: 500,
  factor: 2,
  maxMs: 8_000,
  expirationMs: 60_000,
  nonRetryable: [
    "@smthrs/mvp/flows/FlowsRefused",
    "@smthrs/mvp/flows/FlowNotFound",
    "@smthrs/mvp/flows/FlowInvalid",
    "@smthrs/mvp/flows/FlowNeedsSandbox",
    "@smthrs/mvp/flows/NameTaken",
    "@smthrs/mvp/flows/DraftNotReady",
  ],
})

/** The tag `flow/run/prompt` fails with when its agent couldn't finish. */
const FLOW_AGENT_FAILED = "@smthrs/mvp/flows/FlowAgentFailed" as const

/** One question the drafting agent asks. */
const Question = Schema.Struct({
  text: Schema.String.check(Schema.isBetweenLength(1, 500)),
  assumed: Schema.String.check(Schema.isMaxLength(500)),
  blocking: Schema.Boolean,
})

/** What the drafting agent answers: the flow's description, its instructions, its calls and its questions. */
export const Drafted = Schema.Struct({
  description: Description.annotate({ description: "One sentence saying what the flow does, at most 1,024 characters" }),
  instructions: Schema.String.check(Schema.isBetweenLength(1, 60_000)).annotate({
    description: "What the agent running the flow does, in the second person",
  }),
  flows: Schema.Array(Schema.String).check(Schema.isMaxLength(MAX_CALLS)).annotate({
    description: "The catalog flows it may call",
  }),
  questions: Schema.Array(Question).check(Schema.isMaxLength(MAX_QUESTIONS)),
  summary: Schema.String.check(Schema.isMaxLength(500)).annotate({ description: "One sentence for the person" }),
})
export type Drafted = typeof Drafted.Type

/** One answered question, as the drafting agent reads it. */
const Answered = Schema.Struct({ question: Schema.String, answer: Schema.String })

/** What a round opens with. */
export const Opened = Schema.Struct({
  draftId: Schema.String,
  round: Schema.Number,
  name: Schema.String,
  request: Schema.String,
  flowId: Schema.NullOr(Schema.String),
  previous: Schema.NullOr(Schema.String),
  answers: Schema.Array(Answered),
  openedAtMs: Schema.Number,
})
export type Opened = typeof Opened.Type

/** `flow/new/open`: the draft's row for this round, and what the agent drafts from. */
export const OpenRound = Action.make("flow/new/open", {
  payload: { name: Schema.String, request: Schema.String },
  success: Opened,
  error: RouteFailure,
  tier: "sealed",
  retryPolicy: ROUTE_RETRY,
})

/** `flow/new/draft`: the agent drafts the flow. A draft whose fields don't decode is corrected twice at most. */
export const DraftFlow = AgentAction.make("flow/new/draft", {
  payload: {
    name: Schema.String,
    request: Schema.String,
    previous: Schema.NullOr(Schema.String),
    answers: Schema.Array(Answered),
  },
  output: Drafted,
  seat: FLOW_MODEL_ROLE,
  system: AUTHOR_SYSTEM,
  profile: "conversation",
  prompt: (task) => authorPrompt({ ...task, catalog: PROMPT_CATALOG }),
  corrections: 2,
  maxFrames: MAX_FLOW_FRAMES,
})

/** `flow/new/write`: the flow.ts, its checks and the round's status, on the draft's row. */
export const WriteRound = Action.make("flow/new/write", {
  payload: {
    draftId: Schema.String,
    round: Schema.Number,
    name: Schema.String,
    request: Schema.String,
    flowId: Schema.NullOr(Schema.String),
    drafted: Schema.NullOr(Drafted),
    /** The drafting agent's failure as its step journaled it, when it drafted nothing; `write` reads its code. */
    failure: Schema.Unknown,
    openedAtMs: Schema.Number,
  },
  success: RoundEnded,
  error: RouteFailure,
  tier: "sealed",
  retryPolicy: ROUTE_RETRY,
})

/** How a round's drafting ended: the draft, or the agent's failure. */
interface Outcome {
  readonly drafted: Drafted | null
  readonly failure: unknown
}

/** `flow/new`: one round of a draft. Its tag and schemas are its reference's. */
export const FlowNew = Flow.make(FlowNewReference._tag, {
  description: FlowNewReference.description!,
  modelInvocable: true,
  payload: FlowNewReference.payloadSchema,
  success: FlowNewReference.successSchema,
  error: FlowNewReference.errorSchema,
  body: Node.capture(
    { open: OpenRound.name, draft: DraftFlow.name, write: WriteRound.name },
    ({ name, request }) =>
      OpenRound.call({ name, request }).pipe(
        Node.bindPlanned(Node.capture({ draft: DraftFlow.name, write: WriteRound.name }, (opened) =>
          DraftFlow.call({
            name: opened.name,
            request: opened.request,
            previous: opened.previous,
            answers: opened.answers,
          }).pipe(
            Node.map(Node.capture({ failure: null }, (drafted: Drafted): Outcome => ({ drafted, failure: null }))),
            // The agent couldn't draft (the model failed, or its answer never decoded): the round fails with the
            // agent's failure, whose code `flow/new/write` reads (./failure.ts), and the card offers another.
            Node.catch({
              onFailure: Node.capture({}, (failure) => Node.succeed({ drafted: null, failure })),
            }),
            Node.bindPlanned(Node.capture({ write: WriteRound.name }, (outcome) =>
              WriteRound.call({
                draftId: opened.draftId,
                round: opened.round,
                name: opened.name,
                request: opened.request,
                flowId: opened.flowId,
                drafted: outcome.drafted,
                failure: outcome.failure,
                openedAtMs: opened.openedAtMs,
              }))),
          ))),
      ),
  ),
}).annotate(Flow.Placement, Placement.client())

/** `flow/answer/record`: records the answers on the draft; answers its name and request for the next round. */
export const RecordAnswers = Action.make("flow/answer/record", {
  payload: FlowAnswerReference.payloadSchema.fields,
  success: Schema.Struct({ name: Schema.String, request: Schema.String }),
  error: RouteFailure,
  tier: "sealed",
  retryPolicy: ROUTE_RETRY,
})

/** `flow/answer/next`: starts the draft's next round, `<draftId>:<round + 1>`, without waiting for it. */
export const NextRound = Action.make("flow/answer/next", {
  payload: { draftId: Schema.String, round: Schema.Number, name: Schema.String, request: Schema.String },
  success: FlowAnswerReference.successSchema,
  tier: "sealed",
})

/** `flow/answer`: the person's answers start the next round. */
export const FlowAnswer = Flow.make(FlowAnswerReference._tag, {
  description: FlowAnswerReference.description!,
  modelInvocable: false,
  payload: FlowAnswerReference.payloadSchema,
  success: FlowAnswerReference.successSchema,
  error: FlowAnswerReference.errorSchema,
  body: Node.capture(
    { record: RecordAnswers.name, next: NextRound.name },
    ({ draftId, round, answers }) =>
      RecordAnswers.call({ draftId, round, answers }).pipe(
        Node.bindPlanned(Node.capture({ next: NextRound.name }, (recorded) =>
          NextRound.call({ draftId, round, name: recorded.name, request: recorded.request }))),
      ),
  ),
}).annotate(Flow.Placement, Placement.client())

/** `flow/save/admit`: the draft's file, checked again, saved through ChatApi. */
export const AdmitSave = Action.make("flow/save/admit", {
  payload: FlowSaveReference.payloadSchema.fields,
  success: SavedFlow,
  error: Schema.Union([FlowsUnavailable, FlowsRefused, NameTaken, DraftNotReady]),
  tier: "sealed",
  retryPolicy: ROUTE_RETRY,
})

/** `flow/save`: a ready draft becomes your flow. */
export const FlowSave = Flow.make(FlowSaveReference._tag, {
  description: FlowSaveReference.description!,
  modelInvocable: true,
  payload: FlowSaveReference.payloadSchema,
  success: FlowSaveReference.successSchema,
  error: FlowSaveReference.errorSchema,
  body: Node.capture({ admit: AdmitSave.name }, ({ draftId }) => AdmitSave.call({ draftId })),
}).annotate(Flow.Placement, Placement.client())

/**
 * `flow/run/load`: the revision's flow.ts, checked, pinned with what it may call. Code that isn't a drafted flow as
 * drafted fails `FlowNeedsSandbox`.
 */
export const LoadFlow = Action.make("flow/run/load", {
  payload: FlowRunReference.payloadSchema.fields,
  success: Schema.Struct(Pinned),
  error: Schema.Union([FlowsUnavailable, FlowsRefused, FlowNotFound, FlowInvalid, FlowNeedsSandbox]),
  tier: "sealed",
  retryPolicy: ROUTE_RETRY,
})

/**
 * `flow/run/agent`: the agent follows the pinned instructions, calling only what they list: the one step of a drafted
 * flow, asked what that flow's own step asks (`renderPrompt`).
 */
export const PromptAgent = AgentAction.make("flow/run/agent", {
  payload: { name: Schema.String, instructions: Schema.String, allowed: Schema.Array(Schema.String), input: Schema.String },
  output: Schema.String,
  seat: FLOW_MODEL_ROLE,
  system: FLOW_SYSTEM,
  profile: "conversation",
  prompt: flowPrompt,
  maxFrames: MAX_FLOW_FRAMES,
})

/** `flow/run/prompt`: one pinned revision, followed by the agent; its payload is what its calls are checked against. */
export const FlowPrompt = Flow.make(FlowPromptReference._tag, {
  description: FlowPromptReference.description!,
  modelInvocable: false,
  payload: FlowPromptReference.payloadSchema,
  success: FlowPromptReference.successSchema,
  error: FlowPromptReference.errorSchema,
  body: Node.capture(
    { agent: PromptAgent.name },
    ({ name, instructions, allowed, input }) =>
      PromptAgent.call({ name, instructions, allowed, input }).pipe(
        // Why the agent failed stays on its step (the run page shows it); the run fails with a closed code.
        Node.catch({
          onFailure: Node.capture({ failed: "agent" }, () => Node.fail({ _tag: FLOW_AGENT_FAILED })),
        }),
      ),
  ),
}).annotate(Flow.Placement, Placement.client())

/** `flow/run`: runs your flow. */
export const FlowRun = Flow.make(FlowRunReference._tag, {
  description: FlowRunReference.description!,
  modelInvocable: true,
  payload: FlowRunReference.payloadSchema,
  success: FlowRunReference.successSchema,
  error: FlowRunReference.errorSchema,
  body: Node.capture(
    { load: LoadFlow.name, prompt: FlowPromptReference._tag },
    ({ name, input, revision, flowId }) =>
      LoadFlow.call({ name, input, revision, flowId }).pipe(
        Node.bindPlanned(Node.capture({ prompt: FlowPromptReference._tag }, (pinned) =>
          FlowPrompt.child({
            flowId: pinned.flowId,
            name: pinned.name,
            revision: pinned.revision,
            digest: pinned.digest,
            instructions: pinned.instructions,
            allowed: pinned.allowed,
            input: pinned.input,
          }))),
      ),
  ),
}).annotate(Flow.Placement, Placement.client())

/** `flow/delete/remove`: deletes the flow through ChatApi. */
export const RemoveFlow = Action.make("flow/delete/remove", {
  payload: FlowDeleteReference.payloadSchema.fields,
  success: FlowDeleteReference.successSchema,
  error: RouteFailure,
  tier: "sealed",
  retryPolicy: ROUTE_RETRY,
})

/** `flow/delete`: deletes your flow. */
export const FlowDelete = Flow.make(FlowDeleteReference._tag, {
  description: FlowDeleteReference.description!,
  modelInvocable: true,
  payload: FlowDeleteReference.payloadSchema,
  success: FlowDeleteReference.successSchema,
  error: FlowDeleteReference.errorSchema,
  body: Node.capture({ remove: RemoveFlow.name }, ({ flowId }) => RemoveFlow.call({ flowId })),
}).annotate(Flow.Placement, Placement.client())

/** `flow/draft/delete/remove`: stops the draft's round if this engine runs it, then deletes the draft through ChatApi. */
export const RemoveDraft = Action.make("flow/draft/delete/remove", {
  payload: FlowDraftDeleteReference.payloadSchema.fields,
  success: FlowDraftDeleteReference.successSchema,
  error: RouteFailure,
  tier: "sealed",
  retryPolicy: ROUTE_RETRY,
})

/** `flow/draft/delete`: deletes a draft of yours. */
export const FlowDraftDelete = Flow.make(FlowDraftDeleteReference._tag, {
  description: FlowDraftDeleteReference.description!,
  modelInvocable: true,
  payload: FlowDraftDeleteReference.payloadSchema,
  success: FlowDraftDeleteReference.successSchema,
  error: FlowDraftDeleteReference.errorSchema,
  body: Node.capture({ remove: RemoveDraft.name }, ({ draftId }) => RemoveDraft.call({ draftId })),
}).annotate(Flow.Placement, Placement.client())

/** `flow/read/source`: one revision's code, and where it runs. */
export const ReadCode = Action.make("flow/read/source", {
  payload: FlowReadReference.payloadSchema.fields,
  success: FlowReadReference.successSchema,
  error: FlowReadReference.errorSchema,
  retryPolicy: ROUTE_RETRY,
})

/** `flow/read`: your flow's code. */
export const FlowRead = Flow.make(FlowReadReference._tag, {
  description: FlowReadReference.description!,
  modelInvocable: true,
  payload: FlowReadReference.payloadSchema,
  success: FlowReadReference.successSchema,
  error: FlowReadReference.errorSchema,
  body: Node.capture({ read: ReadCode.name }, ({ name, revision }) => ReadCode.call({ name, revision })),
}).annotate(Flow.Placement, Placement.client())

/** `flow/write/admit`: the code, checked here, saved through ChatApi as the next revision. */
export const AdmitWrite = Action.make("flow/write/admit", {
  payload: FlowWriteReference.payloadSchema.fields,
  success: FlowWriteReference.successSchema,
  error: FlowWriteReference.errorSchema,
  tier: "sealed",
  retryPolicy: ROUTE_RETRY,
})

/** `flow/write`: code you wrote becomes your flow's next revision. */
export const FlowWrite = Flow.make(FlowWriteReference._tag, {
  description: FlowWriteReference.description!,
  modelInvocable: true,
  payload: FlowWriteReference.payloadSchema,
  success: FlowWriteReference.successSchema,
  error: FlowWriteReference.errorSchema,
  body: Node.capture({ admit: AdmitWrite.name }, ({ name, revision, source }) => AdmitWrite.call({ name, revision, source })),
}).annotate(Flow.Placement, Placement.client())

/** `flow/drafts/read`: your drafts not saved yet. */
export const ReadDrafts = Action.make("flow/drafts/read", {
  payload: {},
  success: FlowDraftsReference.successSchema,
  error: RouteFailure,
  retryPolicy: ROUTE_RETRY,
})

/** `flow/drafts`: your drafts not saved yet, so a draft can be named to delete or save it. */
export const FlowDrafts = Flow.make(FlowDraftsReference._tag, {
  description: FlowDraftsReference.description!,
  modelInvocable: true,
  payload: FlowDraftsReference.payloadSchema,
  success: FlowDraftsReference.successSchema,
  error: FlowDraftsReference.errorSchema,
  body: Node.capture({ read: ReadDrafts.name }, () => ReadDrafts.call({})),
}).annotate(Flow.Placement, Placement.client())

/** `flow/list/read`: your flows. */
export const ReadFlows = Action.make("flow/list/read", {
  payload: {},
  success: FlowListReference.successSchema,
  error: RouteFailure,
  retryPolicy: ROUTE_RETRY,
})

/** `flow/list`: your flows. */
export const FlowList = Flow.make(FlowListReference._tag, {
  description: FlowListReference.description!,
  modelInvocable: true,
  payload: FlowListReference.payloadSchema,
  success: FlowListReference.successSchema,
  error: FlowListReference.errorSchema,
  body: Node.capture({ read: ReadFlows.name }, () => ReadFlows.call({})),
}).annotate(Flow.Placement, Placement.client())
