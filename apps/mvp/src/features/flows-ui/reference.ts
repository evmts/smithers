import type { BrowserEngine } from "@smthrs/platform-browser"
import { Schema } from "effect"
import { MAX_ANSWER_CHARS, MAX_INPUT_CHARS, MAX_QUESTIONS, RESERVED_NAMES } from "./contract"
import { DraftStatus, FlowName, Request } from "./schema"

// Your own flows as the tab knows them (decision 0014 §2, docs/features/flows.md#your-own-flows): each flow's name and
// schemas, all the tab needs to start one and read how it ended. Their declarations (./flows.ts) are made from these
// very objects, with the steps as their bodies; `flow/new` and `flow/run` run an agent, so only an engine's host imports
// that, and the tab never loads @smthrs/agent.

/**
 * A reference with its description, read as a declaration's: a string, or none. The flow's declaration (./flows.ts)
 * carries the same text, so the slash menu, the agent and the drafting catalog read one description.
 */
const described = <const R extends BrowserEngine.FlowReference>(
  reference: R,
  description: string,
): R & { readonly description?: string } => ({ ...reference, description })

/** A name a person's flow may take: the Agent Skills pattern, outside the app's own names. */
export const OwnName = FlowName.check(
  Schema.makeFilter((name: string) => !(RESERVED_NAMES as ReadonlyArray<string>).includes(name)),
)

/** ChatApi couldn't be reached, or failed: the step tries again. */
export class FlowsUnavailable extends Schema.TaggedError<FlowsUnavailable>()("@smthrs/mvp/flows/FlowsUnavailable", {
  status: Schema.optional(Schema.Number),
}) {}

/** ChatApi refused the request, by its code (`forbidden`, `stale_round`, `settled`, ...): final. */
export class FlowsRefused extends Schema.TaggedError<FlowsRefused>()("@smthrs/mvp/flows/FlowsRefused", {
  status: Schema.Number,
  code: Schema.String,
}) {}

/** The person has no flow by that name, or no such revision of it. */
export class FlowNotFound extends Schema.TaggedError<FlowNotFound>()("@smthrs/mvp/flows/FlowNotFound", {}) {}

/** The flow's `SKILL.md` fails a check the engine runs before it runs it, named by `check`. */
export class FlowInvalid extends Schema.TaggedError<FlowInvalid>()("@smthrs/mvp/flows/FlowInvalid", {
  check: Schema.String,
}) {}

/**
 * The agent following a person's flow couldn't finish: the model failed, or the run ran out of frames. A plain tagged
 * value, because the flow's plan fails with it as a constant (`Node.fail`), which carries only its JSON.
 */
export const FlowAgentFailed = Schema.Struct({ _tag: Schema.Literal("@smthrs/mvp/flows/FlowAgentFailed") })

/** Another of the person's flows holds the name. */
export class NameTaken extends Schema.TaggedError<NameTaken>()("@smthrs/mvp/flows/NameTaken", {}) {}

/** The draft can't be saved yet: `code` says why (`not_ready`, `checks`, `needs_you`). */
export class DraftNotReady extends Schema.TaggedError<DraftNotReady>()("@smthrs/mvp/flows/DraftNotReady", {
  code: Schema.String,
}) {}

/** What a flow's request to ChatApi can fail with. */
export const RouteFailure = Schema.Union([FlowsUnavailable, FlowsRefused])
export type RouteFailure = typeof RouteFailure.Type

/** How a draft round ended: its draft, its round and its status, and the name it drafts. */
export const RoundEnded = Schema.Struct({
  draftId: Schema.String,
  round: Schema.Number,
  status: DraftStatus,
  name: Schema.String,
})
export type RoundEnded = typeof RoundEnded.Type

/**
 * `flow/new { name, request }`: drafts a flow of yours, one round. Its execution id `<draftId>:<round>` names the
 * draft and the round; any other id starts round 0 of a new draft. The name of a flow you have edits it.
 */
export const FlowNewReference = described(
  {
    _tag: "flow/new",
    payloadSchema: Schema.Struct({
      name: OwnName.annotate({ description: "The flow's name: lowercase letters, digits and hyphens" }),
      request: Request.annotate({ description: "What the flow should do" }),
    }),
    successSchema: RoundEnded,
    errorSchema: RouteFailure,
  },
  "Draft a flow of your own from what it should do, under name. Answers with the draft's id and status; " +
    "the person sees the draft and saves it. A name you already have edits that flow.",
)

/** One answer to a round's question. */
export const Answer = Schema.Struct({
  id: Schema.String.check(Schema.isBetweenLength(1, 64)),
  value: Schema.Trim.check(Schema.isBetweenLength(1, MAX_ANSWER_CHARS)),
})

/** `flow/answer { draftId, round, answers }`: the person's answers, which start the draft's next round. */
export const FlowAnswerReference = described(
  {
    _tag: "flow/answer",
    payloadSchema: Schema.Struct({
      draftId: Schema.String.check(Schema.isUUID()),
      round: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      answers: Schema.Array(Answer).check(Schema.isBetweenLength(1, MAX_QUESTIONS)),
    }),
    successSchema: Schema.Struct({ draftId: Schema.String, round: Schema.Number }),
    errorSchema: RouteFailure,
  },
  "Answer a draft round's questions; the next round drafts with them.",
)

/** What `flow/save` answers: the flow and the revision the draft became. */
export const SavedFlow = Schema.Struct({ flowId: Schema.String, name: Schema.String, revision: Schema.Number })

/** `flow/save { draftId }`: a ready draft becomes your flow. */
export const FlowSaveReference = described(
  {
    _tag: "flow/save",
    payloadSchema: Schema.Struct({ draftId: Schema.String.check(Schema.isUUID()) }),
    successSchema: SavedFlow,
    errorSchema: Schema.Union([FlowsUnavailable, FlowsRefused, NameTaken, DraftNotReady]),
  },
  "Save a ready draft as your flow, or as the next revision of the flow it edits.",
)

/** `flow/run { name, input?, revision? }`: runs your flow; `revision` pins one, the latest unless set. */
export const FlowRunReference = described(
  {
    _tag: "flow/run",
    payloadSchema: Schema.Struct({
      name: FlowName.annotate({ description: "The flow's name" }),
      input: Schema.optional(Schema.String.check(Schema.isMaxLength(MAX_INPUT_CHARS)).annotate({
        description: "What the flow works on",
      })),
      revision: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
    }),
    successSchema: Schema.String,
    errorSchema: Schema.Union([FlowsUnavailable, FlowsRefused, FlowNotFound, FlowInvalid, FlowAgentFailed]),
  },
  "Run your flow by name with input, its text to work on. Answers with the flow's answer.",
)

/** A loaded flow, pinned: what `flow/run/prompt` runs. */
export const Pinned = {
  flowId: Schema.String,
  name: Schema.String,
  revision: Schema.Number,
  digest: Schema.String,
  instructions: Schema.String,
  allowed: Schema.Array(Schema.String),
  input: Schema.String,
}

/** `flow/run/prompt`: the agent following one pinned revision's instructions, its calls limited to its list. */
export const FlowPromptReference = described(
  {
    _tag: "flow/run/prompt",
    payloadSchema: Schema.Struct(Pinned),
    successSchema: Schema.String,
    errorSchema: FlowAgentFailed,
  },
  "Follow one pinned revision of a person's flow.",
)

/** `flow/delete { flowId }`: deletes your flow. Runs that pinned a revision keep it. */
export const FlowDeleteReference = described(
  {
    _tag: "flow/delete",
    payloadSchema: Schema.Struct({ flowId: Schema.String.check(Schema.isUUID()) }),
    successSchema: Schema.Struct({ deleted: Schema.Boolean }),
    errorSchema: RouteFailure,
  },
  "Delete one of your flows.",
)

/** `flow/list`: your flows. */
export const FlowListReference = described(
  {
    _tag: "flow/list",
    payloadSchema: Schema.Struct({}),
    successSchema: Schema.Struct({
      flows: Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String, revision: Schema.Number })),
    }),
    errorSchema: RouteFailure,
  },
  "List your own flows: each one's name, description and latest revision.",
)
