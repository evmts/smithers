/*
 * What went INTO a run (UX pass 2026-09-28, the drawer's In tab): the memory
 * it was handed and what Jev withheld, the box it ran on, and the names of
 * the secrets that box can reach. Pure reads of the journal the card holds
 * and of the controller's recorded metadata; nothing here fetches.
 *
 * - Memory: `runMemoryOf` (@smthrs/gateway/RunTrace), the fold `smthrs status`
 *   shares, over the `control.agent.relevance-settled` rows.
 * - Where: the run's box (`workspaceId`), by name when a workspace card for it
 *   is open.
 * - Secrets: the names and egress hosts the box can reach today, from the
 *   repository's agent-environment metadata. They are the
 *   box's, listed under it; no run journals which secret a call used. Values
 *   never reach the client (EnvironmentSeam).
 */
import type { Card } from "../state/AppState"
import { runMemoryOf, type RunMemory } from "./RunTrace"

type RunCard = Extract<Card, { kind: "run-trace" }>

export interface RunInputs {
  readonly memory?: RunMemory
  /** The box the run ran on: its name when known, else its id. */
  readonly runsOn?: string
  readonly secrets: ReadonlyArray<{ readonly name: string; readonly hosts: ReadonlyArray<string> }>
  readonly secretsError?: string
}

/** The memory row's words: `memory · 7 in · 4 withheld`. */
export const memoryWords = (memory: RunMemory): string =>
  memory.withheld.length === 0 ? `memory · ${memory.kept.length} in`
    : `memory · ${memory.kept.length} in · ${memory.withheld.length} withheld`

export const runInputsOf = (card: RunCard, cards: ReadonlyArray<Card>): RunInputs => {
  const memory = runMemoryOf(card.payload.events ?? [])
  const { workspaceId, repo } = card.payload
  const box = workspaceId === undefined ? undefined
    : cards.find((held): held is Extract<Card, { kind: "workspace" }> => held.kind === "workspace" && held.payload.workspaceId === workspaceId)
  const held = card.payload.agentSecretBindings
  const bindings = held?.repo === repo && held.workspaceId === workspaceId ? held : undefined
  return {
    ...(memory === undefined ? {} : { memory }),
    ...(workspaceId === undefined ? {} : { runsOn: box?.payload.name ?? workspaceId.slice(0, 8) }),
    secrets: bindings?.state === "complete" ? bindings.secrets : [],
    ...(bindings?.state === "failed" && bindings.error !== undefined ? { secretsError: bindings.error } : {})
  }
}
