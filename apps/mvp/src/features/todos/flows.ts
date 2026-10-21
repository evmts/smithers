import { Action, Flow, RetryPolicy } from "@smthrs/flow"
import { Node, Placement } from "@smthrs/plan"
import { Schema } from "effect"
import { MAX_ISSUE_NUMBER } from "../issues/contract"
import { RepoName } from "../repo/flows"
import { isAcceptance, isPrompt, isTitle, MAX_TODO_NUMBER } from "./contract"

// The TODO flows of slice 1 (decision 0016 §2, docs/features/todos.md#flows). The agent drafts and a person commits:
// `todo/draft` keeps a private draft on the person's device and shows its card, whose Commit runs `todo/commit`; Drop
// runs `todo/drop`. Each is one step that asks the tab that started the request (src/features/todos/steps.ts) to keep
// the draft, or to put the change in the device's outbox, which sends it to the stack's one route. Neither change waits
// for the stack: the result is Requested, and the stack page shows it until the stack has it. `todo/issue` drafts one
// from an issue, linked to it: Make TODO on the issue's row or page, its key, `/todo.issue`, and the agent all run it.

/** A TODO's title: 1 to `MAX_TITLE_LENGTH` characters, not blank. */
export const Title = Schema.String.check(Schema.makeFilter(isTitle))

/** A TODO's prompt: Markdown, not blank, at most `MAX_PROMPT_BYTES`. */
export const Prompt = Schema.String.check(Schema.makeFilter(isPrompt))

/** Acceptance criteria: at most `MAX_ACCEPTANCE` lines, each not blank. */
export const Acceptance = Schema.Array(Schema.String).check(Schema.makeFilter(isAcceptance))

/** A TODO's number on its stack: the `n` of `Tn`. */
export const TodoNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_TODO_NUMBER }))

/** A GitHub issue's number in the repository. */
export const IssueNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_ISSUE_NUMBER }))

/** What `todo/draft` takes. */
export const draftPayload = {
  repo: RepoName,
  prompt: Prompt,
  title: Schema.optional(Title),
  acceptance: Schema.optional(Acceptance),
}

/** What `todo/issue` takes: the issue, and what may replace its title and body. */
export const issuePayload = {
  repo: RepoName,
  issue: IssueNumber,
  title: Schema.optional(Title),
  prompt: Schema.optional(Prompt),
  acceptance: Schema.optional(Acceptance),
}

/** What `todo/commit` takes: the issue a draft was made from goes with it. */
export const commitPayload = {
  repo: RepoName,
  title: Title,
  prompt: Prompt,
  acceptance: Schema.optional(Acceptance),
  issue: Schema.optional(IssueNumber),
}

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
 * wouldn't take the change (`not_kept`), the device doesn't have the issue a draft is made from (`issue_not_found`), or
 * the change is the agent's call (`agent`): only a person commits or drops.
 */
export class TodoStepRefused extends Schema.TaggedError<TodoStepRefused>()("@smthrs/mvp/todos/TodoStepRefused", {
  reason: Schema.Literals(["tab_gone", "not_kept", "issue_not_found", "agent"]),
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

/** The step: keep a draft made from an issue on the asking tab's device. */
export const KeepIssueDraft = Action.make("todo/issue/keep", {
  payload: issuePayload,
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

/** `todo/issue { repo, issue, title?, prompt?, acceptance? }`: drafts a TODO from an issue, linked to it. */
export const TodoIssue = Flow.make("todo/issue", {
  description: "Draft a TODO from a GitHub issue, linked to it, for the person to commit to the repository's stack. In " +
    "repo (owner/name), for issue number issue. The title and Markdown prompt are the issue's title and body unless " +
    "you pass better ones; acceptance criteria are optional. The draft is private to the person: its card shows on " +
    "the stack's page, where they edit it and press Commit. You never commit it. Answers { draftId, status: " +
    "\"drafted\", path }, path being the stack's page. TodoStepRefused when the person's tab is gone (tab_gone), " +
    "couldn't keep the draft (not_kept), or this device doesn't have the issue (issue_not_found).",
  modelInvocable: true,
  payload: issuePayload,
  success: Drafted,
  error: TodoStepRefused,
  body: Node.capture({ action: KeepIssueDraft.name }, (payload) => KeepIssueDraft.call(payload)),
}).annotate(Flow.Placement, Placement.client())

/** `todo/commit { repo, title, prompt, acceptance?, issue? }`: a person commits a TODO to the end of the stack. */
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
