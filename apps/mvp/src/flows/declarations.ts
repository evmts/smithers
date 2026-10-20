import { Flow } from "@smthrs/flow"
import { Context } from "effect"
import { BranchTrack } from "../features/branch/flows"
import { TerminalOpenRequest } from "../features/terminal/flows"
import { Close } from "../features/agent/close"
import { ChatCopy, ChatEdit } from "../features/chat/flows"
import { Answer } from "../features/agent/flows"
import {
  FlowAnswer,
  FlowDelete,
  FlowList,
  FlowNew,
  FlowPrompt,
  FlowRun,
  FlowSave,
} from "../features/flows-ui/flows"
import { IssueComment, IssueCreate } from "../features/issues/flows"
import { Classify, Evaluate } from "../features/jev/flows"
import { Cancel, Inspect, List, Resume, Retry } from "../features/runs/flows"
import { Navigate } from "../features/navigation/flows"
import { RepoCloneRequest, RepoCopy, RepoRead, RepoRefs, RepoTree } from "../features/repo/flows"
import { AnswerRun, Ask, Deliver } from "../features/status/flows"
import { SetTheme } from "../features/theme/flows"
import { OpenWebPage } from "../features/web/flows"
import { type FlowName, type FlowOf, names } from "./registry"

// Every registered flow's declaration, its body and steps included (docs/features/flows.md#the-registry): what an engine
// runs and the agent's catalog binds. Only what runs flows imports this module (the engine worker and the Node host),
// because the agent's declaration imports @smthrs/agent. The tab dispatches by the registry's references
// (src/flows/registry.ts) and never loads it. src/flows/registry.test.ts proves the two lists match one to one: the
// same names, and the very same schema objects.

/** Each registered flow's declaration, by name: one per registry entry, with that entry's tag and schemas. */
export const declarations = {
  "app/theme/set": SetTheme,
  "app/navigate": Navigate,
  "app/web/open": OpenWebPage,
  "chat/Answer": Answer,
  "chat/Close": Close,
  "chat/copy": ChatCopy,
  "chat/edit": ChatEdit,
  "repo/tree": RepoTree,
  "repo/read": RepoRead,
  "repo/refs": RepoRefs,
  "repo/clone": RepoCloneRequest,
  "repo/copy": RepoCopy,
  "app/jev/classify": Classify,
  "app/jev/evaluate": Evaluate,
  "app/agent/ask": Ask,
  "run/answer": AnswerRun,
  "run/deliver": Deliver,
  "flow/new": FlowNew,
  "flow/answer": FlowAnswer,
  "flow/save": FlowSave,
  "flow/run": FlowRun,
  "flow/run/prompt": FlowPrompt,
  "flow/delete": FlowDelete,
  "flow/list": FlowList,
  "run/cancel": Cancel,
  "run/retry": Retry,
  "run/resume": Resume,
  "run/list": List,
  "run/inspect": Inspect,
  "branch/track": BranchTrack,
  "terminal/open": TerminalOpenRequest,
  "issue/create": IssueCreate,
  "issue/comment": IssueComment,
} as const satisfies { readonly [N in FlowName]: Flow.Any & FlowOf<N> }

/** The declaration registered under `name`. */
export const declarationOf = (name: FlowName): Flow.Any => declarations[name]

/**
 * Whether a model may call the flow registered under `name`: its own `modelInvocable`, which defaults to yes. An entry
 * with a `userOnlyReason` declares `modelInvocable: false`; the registry test holds the two together.
 */
export const modelInvocable = (name: FlowName): boolean =>
  Context.get(declarationOf(name).annotations, Flow.ModelInvocable)

/** The flows this device's engine runs: every registered flow, in the registry's order. */
export const clientFlows: ReadonlyArray<Flow.Any> = names.map(declarationOf)
