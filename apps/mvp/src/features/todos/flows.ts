import { Action, Flow, RetryPolicy } from "@smthrs/flow"
import { Node, Placement } from "@smthrs/plan"
import { Schema } from "effect"
import { RepoName } from "../repo/flows"
import { isAcceptance, isPrompt, isTitle, MAX_TODO_NUMBER } from "./contract"

// The TODO flows of slice 1 (decision 0016 §2, docs/features/todos.md#flows). The agent drafts and a person commits:
// `todo/draft` keeps a private draft on the person's device and shows its card, whose Commit runs `todo/commit`; Drop
// runs `todo/drop`. Each is one step that asks the tab that started the request (src/features/todos/steps.ts) to keep
// the draft, or to put the change in the device's outbox, which sends it to the stack's one route. Neither change waits
// for the stack: the result is Requested, and the stack page shows it until the stack has it.

/** A TODO's title: 1 to `MAX_TITLE_LENGTH` characters, not blank. */
export const Title = Schema.String.check(Schema.makeFilter(isTitle))

/** A TODO's prompt: Markdown, not blank, at most `MAX_PROMPT_BYTES`. */
export const Prompt = Schema.String.check(Schema.makeFilter(isPrompt))

/** Acceptance criteria: at most `MAX_ACCEPTANCE` lines, each not blank. */
export const Acceptance = Schema.Array(Schema.String).check(Schema.makeFilter(isAcceptance))

/** A TODO's number on its stack: the `n` of `Tn`. */
export const TodoNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_TODO_NUMBER }))

/** What `todo/draft` takes. */
export const draftPayload = {
  repo: RepoName,
  prompt: Prompt,
  title: Schema.optional(Title),
  acceptance: Schema.optional(Acceptance),
}

/** What `todo/commit` takes. */
export const commitPayload = { repo: RepoName, title: Title, prompt: Prompt, acceptance: Schema.optional(Acceptance) }

/** What `todo/drop` takes. */
export const dropPayload = { repo: RepoName, number: TodoNumber }

/** What `todo/draft` answers: the draft's id, and where its card shows. */
export const Drafted = Schema.Struct({ draftId: Schema.String, status: Schema.Literal("drafted"), path: Schema.String })
export type Drafted = typeof Drafted.Type

/** What a change answers: its op id, and that it is requested, never done. */
export const ChangeRequested = Schema.Struct({ opId: Schema.String, status: Schema.Literal("requested") })
export type ChangeRequested = typeof ChangeRequested.Type

/**
 * The step didn't reach the device: the tab that asked is gone (`tab_gone`), it couldn't keep the draft or its outbox
 * wouldn't take the change (`not_kept`), or the change is the agent's call (`agent`): only a person commits or drops.
 */
export class TodoStepRefused extends Schema.TaggedError<TodoStepRefused>()("@smthrs/mvp/todos/TodoStepRefused", {
  reason: Schema.Literals(["tab_gone", "not_kept", "agent"]),
}) {}

/** How long a step keeps asking its tab: 1 s doubling to 8 s, for at most 30 s. */
export const ASK_RETRY = RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 8_000, expirationMs: 30_000 })

/** The step: keep the draft on the asking tab's device. */
export const KeepDraft = Action.make("todo/draft/keep", {
  payload: draftPayload,
  success: Drafted,
  error: TodoStepRefused,
  retryPolicy: ASK_RETRY,
})

/** The step: put the commit in the asking tab's outbox. */
export const QueueCommit = Action.make("todo/commit/queue", {
  payload: commitPayload,
  success: ChangeRequested,
  error: TodoStepRefused,
  retryPolicy: ASK_RETRY,
})

/** The step: put the drop in the asking tab's outbox. */
export const QueueDrop = Action.make("todo/drop/queue", {
  payload: dropPayload,
  success: ChangeRequested,
  error: TodoStepRefused,
  retryPolicy: ASK_RETRY,
})

/** `todo/draft { repo, prompt, title?, acceptance? }`: drafts a TODO for the person to commit. */
export const TodoDraft = Flow.make("todo/draft", {
  description: "Draft a TODO for the person to commit to a repository's stack. In repo (owner/name), with a Markdown " +
    "prompt saying what to change, an optional short title (the prompt's first line otherwise) and optional " +
    "acceptance criteria. The draft is private to the person: its card shows under your answer, where they edit it " +
    "and press Commit. You never commit it. Answers { draftId, status: \"drafted\", path }, path being the stack's " +
    "page. TodoStepRefused when the person's tab is gone (tab_gone) or couldn't keep the draft (not_kept).",
  modelInvocable: true,
  payload: draftPayload,
  success: Drafted,
  error: TodoStepRefused,
  body: Node.capture({ action: KeepDraft.name }, (payload) => KeepDraft.call(payload)),
}).annotate(Flow.Placement, Placement.client())

/** `todo/commit { repo, title, prompt, acceptance? }`: a person commits a TODO to the end of the stack. */
export const TodoCommit = Flow.make("todo/commit", {
  description: "Commit a TODO to the end of a repository's stack. Answers { opId, status: \"requested\" }: the stack " +
    "numbers it once it has it.",
  modelInvocable: false,
  payload: commitPayload,
  success: ChangeRequested,
  error: TodoStepRefused,
  body: Node.capture({ action: QueueCommit.name }, (payload) => QueueCommit.call(payload)),
}).annotate(Flow.Placement, Placement.client())

/** `todo/drop { repo, number }`: a person drops TODO `Tn` from the stack. */
export const TodoDrop = Flow.make("todo/drop", {
  description: "Drop a TODO from a repository's stack, by its number. Answers { opId, status: \"requested\" }.",
  modelInvocable: false,
  payload: dropPayload,
  success: ChangeRequested,
  error: TodoStepRefused,
  body: Node.capture({ action: QueueDrop.name }, (payload) => QueueDrop.call(payload)),
}).annotate(Flow.Placement, Placement.client())
