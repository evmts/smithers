import { flows as auth } from "./flows/auth"
import { flows as repositories } from "./flows/repositories"
import { flows as ask_pr } from "./flows/ask-pr"
import { flows as issues_prs } from "./flows/issues-prs"
import { flows as todos } from "./flows/todos"
import { flows as flowDomain } from "./flows/flows"
import { flows as settings } from "./flows/settings"
import { flows as wiki_memory } from "./flows/wiki-memory"
import { flows as multiplayer } from "./flows/multiplayer"
import { flows as agents } from "./flows/agents"
import { flows as install } from "./flows/install"
import { flows as cli_tui } from "./flows/cli-tui"
import type { Domain, FlowEntry } from "./types"

export type { Domain, FlowEntry, Layer } from "./types"

export const domains: Readonly<Record<Domain, readonly FlowEntry[]>> = {
  "auth": auth,
  "repositories": repositories,
  "ask-pr": ask_pr,
  "issues-prs": issues_prs,
  "todos": todos,
  "flows": flowDomain,
  "settings": settings,
  "wiki-memory": wiki_memory,
  "multiplayer": multiplayer,
  "agents": agents,
  "install": install,
  "cli-tui": cli_tui
}

export const flows: readonly FlowEntry[] = Object.values(domains).flat()
export const flowById: ReadonlyMap<string, FlowEntry> = new Map(flows.map((flow) => [flow.id, flow]))

/** Exact journey match: J1 must not accidentally include J10 or J11. */
export const journeyFlows = (journey: string): readonly FlowEntry[] =>
  flows.filter((flow) => flow.spec.includes(journey))
