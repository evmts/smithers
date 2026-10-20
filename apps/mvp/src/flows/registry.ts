import type { BrowserEngine } from "@smthrs/platform-browser"
import { BranchTrack } from "../features/branch/flows"
import { TerminalOpenRequest } from "../features/terminal/flows"
import { Close } from "../features/agent/close"
import { ChatCopy, ChatEdit } from "../features/chat/flows"
import { AnswerReference } from "../features/agent/reference"
import { Navigate } from "../features/navigation/flows"
import { RepoCloneRequest, RepoCopy, RepoRead, RepoRefs, RepoTree } from "../features/repo/flows"
import type { Role } from "../features/auth/contract"
import {
  FlowAnswerReference,
  FlowDeleteReference,
  FlowListReference,
  FlowNewReference,
  FlowPromptReference,
  FlowRunReference,
  FlowSaveReference,
} from "../features/flows-ui/reference"
import { IssueComment, IssueCreate } from "../features/issues/flows"
import { Classify, Evaluate } from "../features/jev/flows"
import { Cancel, Inspect, List, Resume, Retry } from "../features/runs/flows"
import { AnswerRun, Ask, Deliver } from "../features/status/flows"
import { SetTheme } from "../features/theme/flows"
import { OpenWebPage } from "../features/web/flows"

// The app's flows (docs/features/flows.md#the-registry): every action a person or the agent takes is one `Flow.make`
// declaration, listed here once. The UI dispatches only a name from this list (`FlowDispatch`), and the agent's catalog
// is this list's model-invocable flows. Anything a person can do, the agent can do: an entry the agent may not run says
// why (`userOnlyReason`), and src/flows/registry.test.ts enforces both. Every flow here runs on this device's engine. A
// flow that needs something the device lacks runs remotely, and the route that admits it starts it
// (docs/features/remote-flows.md); no route starts one by its name alone.
//
// The tab loads this list, so it holds each flow's reference (its tag and schemas), never what its steps run on. The
// declarations themselves, the agent's included, are src/flows/declarations.ts, which only an engine's host imports.

/** The least a person must be to run a flow from the composer: anyone, signed out included, or a role (decision 0007). */
export type Minimum = "anyone" | Role

/**
 * A flow's slash command (docs/features/slash-commands.md): `/<command>` in the composer runs it, for a person who is at
 * least `minimum`. Its row shows the first sentence of the flow's description, and its arguments are the flow's payload.
 */
export interface SlashDoor {
  readonly command: string
  readonly minimum: Minimum
  /**
   * How its arguments read, as `@smthrs/ui`'s `FormHints`: `hidden` keeps an optional field a person never types out of
   * the command's arguments.
   */
  readonly hints?: { readonly fields?: Readonly<Record<string, { readonly hidden?: boolean }>> }
  /**
   * The payload fields a line fills, in order, when not all of them: the rest keep their defaults. The last one takes
   * the rest of the line.
   */
  readonly fields?: ReadonlyArray<string>
}

/** One registered flow: its reference, why only a person runs it, and its slash command. */
export interface Entry {
  /**
   * The flow's tag and schemas: the declaration itself, or a reference to one only an engine's host imports. A
   * declaration carries its description too.
   */
  readonly flow: BrowserEngine.FlowReference & { readonly description?: string }
  /** Why the agent may not run it; absent when it may. */
  readonly userOnlyReason?: string
  /** Its slash command; absent when the composer doesn't offer it. */
  readonly slash?: SlashDoor
}

/** Every flow the app declares, by name. */
export const registry = {
  "app/theme/set": { flow: SetTheme, slash: { command: "theme", minimum: "anyone" } },
  "app/navigate": { flow: Navigate, slash: { command: "navigate", minimum: "anyone" } },
  // Adding a view writes the shared conversation, which only a Member or above may (decision 0007).
  // The tab pins the conversation it shows into the payload (src/features/web/actions.ts); a person never types it.
  "app/web/open": {
    flow: OpenWebPage,
    slash: { command: "web", minimum: "member", hints: { fields: { conversationId: { hidden: true } } } },
  },
  "chat/Answer": {
    flow: AnswerReference,
    userOnlyReason: "Asking starts it, and the agent is the one answering; it never asks itself.",
  },
  "chat/Close": {
    flow: Close,
    userOnlyReason: "The tab that asked settles an answer whose run can no longer finish; the agent never settles one.",
  },
  // Message controls (docs/features/chat.md#message-controls): Copy on a message and `/copy`, which the agent runs to
  // copy its last answer; Edit on a question Smithers doesn't have yet and `/edit`, the person's only.
  "chat/copy": { flow: ChatCopy, slash: { command: "copy", minimum: "anyone", hints: { fields: { messageId: { hidden: true } } } } },
  "chat/edit": {
    flow: ChatEdit,
    userOnlyReason: "Only the person changes what they asked; the agent never edits a question.",
    slash: { command: "edit", minimum: "member", hints: { fields: { questionId: { hidden: true } } } },
  },
  "repo/tree": { flow: RepoTree },
  "repo/read": { flow: RepoRead },
  "repo/refs": { flow: RepoRefs },
  // Cloning spends the deployment's Code Storage budget, which only a Member or above may (decision 0007).
  "repo/clone": { flow: RepoCloneRequest, slash: { command: "clone", minimum: "member" } },
  "repo/copy": { flow: RepoCopy },
  // No slash command: a person's run would have nowhere to show its verdicts. A person asks Smithers instead.
  "app/jev/classify": { flow: Classify },
  "app/jev/evaluate": { flow: Evaluate },
  // Agent status (decision 0015): the agent asks the person; the person answers; the device delivers the answer.
  "app/agent/ask": { flow: Ask },
  "run/answer": { flow: AnswerRun, userOnlyReason: "Only the person answers what the agent asks them." },
  "run/deliver": {
    flow: Deliver,
    userOnlyReason: "The device that holds a run delivers an answer already recorded; nobody runs it by hand.",
  },
  // Your own flows (decision 0014 §2): drafting one costs model calls, so only a Member or above drafts or runs one.
  "flow/new": { flow: FlowNewReference, slash: { command: "flow.new", minimum: "member" } },
  "flow/answer": { flow: FlowAnswerReference, userOnlyReason: "Only the person answers what the drafting agent asked." },
  "flow/save": { flow: FlowSaveReference },
  "flow/run": {
    flow: FlowRunReference,
    // `/flow.run <name> <input>`: the revision a person never types; the latest runs.
    slash: { command: "flow.run", minimum: "member", fields: ["name", "input"] },
  },
  "flow/run/prompt": {
    flow: FlowPromptReference,
    userOnlyReason: "flow/run starts it with the revision it pinned; nobody starts it by hand.",
  },
  "flow/delete": { flow: FlowDeleteReference },
  "flow/list": { flow: FlowListReference },
  // Runs (decision 0014 §2): the acts on a run this device holds, and the reads. Their results show on the run page.
  "run/cancel": { flow: Cancel },
  "run/retry": { flow: Retry },
  "run/resume": { flow: Resume },
  "run/list": { flow: List },
  "run/inspect": { flow: Inspect },
  // The branch workspace (decision 0013): a page opening a branch runs branch/track, and the agent can too.
  "branch/track": { flow: BranchTrack },
  "terminal/open": {
    flow: TerminalOpenRequest,
    userOnlyReason: "A terminal is the person's own shell; the agent runs commands as jobs instead (decision 0013).",
  },
  // Git writes (decision 0012 §3): opening an issue and commenting are Guest acts. `/issue owner/repo <title>` fills
  // the title with the rest of the line; the body is the form's.
  "issue/create": { flow: IssueCreate, slash: { command: "issue", minimum: "guest", fields: ["repo", "title"] } },
  "issue/comment": { flow: IssueComment, slash: { command: "comment", minimum: "guest" } },
} as const satisfies Record<string, Entry>

/** A registered flow's name: the only thing the UI dispatches. */
export type FlowName = keyof typeof registry

/** The reference registered under `N`. */
export type FlowOf<N extends FlowName> = (typeof registry)[N]["flow"]

/** The names in the registry, in order. */
export const names = Object.keys(registry) as ReadonlyArray<FlowName>

/** The entry registered under `name`. */
export const entryOf = (name: FlowName): Entry => registry[name]
