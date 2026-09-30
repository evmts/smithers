import { describe, expect, test } from "bun:test"
import type { Card } from "../state/AppState"
import { memoryWords, runInputsOf } from "./RunInputs"

type RunCard = Extract<Card, { kind: "run-trace" }>

const reading = (sequence: number, kept: ReadonlyArray<[string, number]>, withheld: ReadonlyArray<[string, number]>) => ({
  sequence, kind: "control.agent.relevance-settled", occurredAt: sequence,
  payload: { scope: "s", frame: sequence, source: "supervisor", withholdAt: 0.9, latencyMs: 3,
    kept: kept.map(([id, p]) => ({ kind: "memory", id, digest: `d-${id}`, p })),
    withheld: withheld.map(([id, p]) => ({ kind: "memory", id, digest: `d-${id}`, p })) }
})

const run = (payload: Partial<RunCard["payload"]>): RunCard => ({
  id: "flow-run-run-1", kind: "run-trace", title: "implement", status: "active", createdAt: 0, ordinal: 0,
  payload: { repo: "smithersai/smithers", runId: "run-1", workflow: "implement", phase: "running", steps: [], result: null, lastSeq: 1, ...payload }
})

describe("run inputs", () => {
  test("a run Jev never read has no memory row at all", () => {
    expect(runInputsOf(run({}), [])).toEqual({ secrets: [] })
  })

  test("an item any reading kept is in; one only ever withheld is withheld; both by relevance", () => {
    const memory = runInputsOf(run({ events: [
      reading(1, [["wiki/auth/sessions", 0.18], ["rpc/Session.ts", 0.23]], [["wiki/billing", 0.95], ["wiki/auth/legacy", 0.97]]),
      reading(2, [["wiki/billing", 0.4]], [["app/Login.tsx", 0.92]])
    ] } as Partial<RunCard["payload"]>), []).memory!
    expect(memory.kept.map((item) => [item.id, Number(item.relevance.toFixed(2))]))
      .toEqual([["wiki/auth/sessions", 0.82], ["rpc/Session.ts", 0.77], ["wiki/billing", 0.6]])
    expect(memory.withheld.map((item) => item.id)).toEqual(["app/Login.tsx", "wiki/auth/legacy"])
    expect(memoryWords(memory)).toBe("memory · 3 in · 2 withheld")
    expect(memoryWords({ kept: memory.kept, withheld: [] })).toBe("memory · 3 in")
  })

  test("the box by name and current agent bindings, never the CI secrets card", () => {
    const box: Card = { id: "w", kind: "workspace", title: "", status: "active", createdAt: 0, ordinal: 0,
      payload: { workspaceId: "ws-1", repo: "smithersai/smithers", name: "box-2", targetBookmark: null, status: "running", provisioningStage: null, bookmarkHead: null, sessions: [] } }
    const secrets: Card = { id: "s", kind: "secrets", title: "", status: "active", createdAt: 0, ordinal: 0,
      payload: { repo: "smithersai/smithers", scope: "repository", secrets: [
        { name: "DEPLOY_TOKEN", mainOnly: true, hosts: ["api.vercel.com"], matchHeaders: [], updatedAt: null },
        { name: "OLD_CLAUDE", mainOnly: false, hosts: [], matchHeaders: [], updatedAt: null, reconnect: true }
      ] } }
    const other: Card = { ...secrets, id: "s2", payload: { ...secrets.payload, repo: "else/where" } }
    expect(runInputsOf(run({ workspaceId: "ws-1", agentSecretBindings: { id: "read-1", owner: "ada", repo: "smithersai/smithers", workspaceId: "ws-1", state: "complete", secrets: [{ name: "AGENT_TOKEN", hosts: ["api.agent.test"] }] } }), [other, box, secrets])).toEqual({
      runsOn: "box-2", secrets: [{ name: "AGENT_TOKEN", hosts: ["api.agent.test"] }]
    })
    expect(runInputsOf(run({ workspaceId: "ws-1" }), [box, secrets])).toEqual({ runsOn: "box-2", secrets: [] })
    expect(runInputsOf(run({ workspaceId: "ws-9" }), []).runsOn).toBe("ws-9")
  })
})

for (const state of ["pending", "failed", "complete"] as const) {
  test(`${state} binding metadata only belongs to its exact repository and box`, () => {
    const held = { id: "read", owner: "ada", repo: "smithersai/smithers", workspaceId: "ws-1", state,
      secrets: [{ name: "AGENT_TOKEN", hosts: ["api.agent.test"] }], error: "Agent bindings could not be read. Try again." }
    const current = runInputsOf(run({ workspaceId: "ws-1", agentSecretBindings: held }), [])
    expect(current).toEqual({ runsOn: "ws-1", secrets: state === "complete" ? held.secrets : [],
      ...(state === "failed" ? { secretsError: held.error } : {}) })
    for (const patch of [{ repo: "another/repository" }, { workspaceId: "ws-2" }, { workspaceId: undefined }]) {
      const card = run({ workspaceId: "ws-1", ...patch, agentSecretBindings: held })
      const projected = runInputsOf(card, [])
      expect(projected.secrets).toEqual([])
      expect(projected.secretsError).toBeUndefined()
    }
  })
}
