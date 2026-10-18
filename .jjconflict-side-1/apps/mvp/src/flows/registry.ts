import type { BrowserEngine } from "@smthrs/platform-browser"
import { AnswerReference } from "../features/agent/reference"
import { RepoRead, RepoTree } from "../features/repo/flows"
import { SetTheme } from "../features/theme/flows"
import { type Need, type Where, whereFor } from "./placement"

// The app's flows (docs/features/flows.md#the-registry): every action a person or the agent takes is one `Flow.make`
// declaration, listed here once. The UI dispatches only a name from this list (`FlowDispatch`), and the agent's catalog
// is this list's model-invocable flows that run on this device. Anything a person can do, the agent can do: an entry
// the agent may not run says why (`userOnlyReason`), and src/flows/registry.test.ts enforces both.
//
// The tab loads this list, so it holds each flow's reference (its tag and schemas), never what its steps run on. The
// declarations themselves, the agent's included, are src/flows/declarations.ts, which only an engine's host imports.

/** One registered flow: its reference, what it needs that this device lacks, and why only a person runs it. */
export interface Entry {
  /** The flow's tag and schemas: the declaration itself, or a reference to one only an engine's host imports. */
  readonly flow: BrowserEngine.FlowReference
  /** What the flow needs that this device doesn't have; none runs it on this device. */
  readonly needs: ReadonlyArray<Need>
  /** Why the agent may not run it; absent when it may. */
  readonly userOnlyReason?: string
}

/** Every flow the app declares, by name. */
export const registry = {
  "app/theme/set": { flow: SetTheme, needs: [] },
  "chat/Answer": {
    flow: AnswerReference,
    needs: [],
    userOnlyReason: "Asking starts it, and the agent is the one answering; it never asks itself.",
  },
  "repo/tree": { flow: RepoTree, needs: [] },
  "repo/read": { flow: RepoRead, needs: [] },
} as const satisfies Record<string, Entry>

/** A registered flow's name: the only thing the UI dispatches. */
export type FlowName = keyof typeof registry

/** The reference registered under `N`. */
export type FlowOf<N extends FlowName> = (typeof registry)[N]["flow"]

/** The names in the registry, in order. */
export const names = Object.keys(registry) as ReadonlyArray<FlowName>

/** The entry registered under `name`. */
export const entryOf = (name: FlowName): Entry => registry[name]

/** Where the flow registered under `name` runs, by what it needs. */
export const whereOf = (name: FlowName): Where => whereFor(entryOf(name).needs)
