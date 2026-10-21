import { Agent } from "@smthrs/agent"

// The cell sandbox the `todo` run's agent runs its cells in on the server (worker/flows/TodoAgent.ts): `@smthrs/agent`'s
// defaults, the QuickJS build and no steering.
export const layer = Agent.layerDefaults
