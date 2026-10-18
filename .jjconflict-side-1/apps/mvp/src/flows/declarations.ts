import { Flow } from "@smthrs/flow"
import { Context } from "effect"
import { Answer } from "../features/agent/flows"
import { RepoRead, RepoTree } from "../features/repo/flows"
import { SetTheme } from "../features/theme/flows"
import type { Where } from "./placement"
import { type FlowName, type FlowOf, names, whereOf } from "./registry"

// Every registered flow's declaration, its body and steps included (docs/features/flows.md#the-registry): what an engine
// runs and the agent's catalog binds. Only what runs flows imports this module (the engine worker, the Node host and
// ChatApi's remote door), because the agent's declaration imports @smthrs/agent. The tab dispatches by the registry's
// references (src/flows/registry.ts) and never loads it. src/flows/registry.test.ts proves the two lists match one to
// one: the same names, and the very same schema objects.

/** Each registered flow's declaration, by name: one per registry entry, with that entry's tag and schemas. */
export const declarations = {
  "app/theme/set": SetTheme,
  "chat/Answer": Answer,
  "repo/tree": RepoTree,
  "repo/read": RepoRead,
} as const satisfies { readonly [N in FlowName]: Flow.Any & FlowOf<N> }

/** The declaration registered under `name`. */
export const declarationOf = (name: FlowName): Flow.Any => declarations[name]

/**
 * Whether a model may call the flow registered under `name`: its own `modelInvocable`, which defaults to yes. An entry
 * with a `userOnlyReason` declares `modelInvocable: false`; the registry test holds the two together.
 */
export const modelInvocable = (name: FlowName): boolean =>
  Context.get(declarationOf(name).annotations, Flow.ModelInvocable)

/** The declarations of the registered flows that run `where`, in the registry's order. */
export const flowsWhere = (where: Where): ReadonlyArray<Flow.Any> =>
  names.filter((name) => whereOf(name) === where).map(declarationOf)

/** The flows this device's engine runs: every flow whose placement is `client`. */
export const clientFlows = flowsWhere("client")

/**
 * The flows the remote door (`POST /api/flows/<name>`) may start: every registered remote flow, since the registry
 * holds only what a person or the agent starts. A remote flow only the server starts, such as `auth/RecheckRole`, is
 * never registered here.
 */
export const remoteFlows = flowsWhere("remote")
