// What the person already refused in one answer (./approvals.ts), read from the answer run's `app/agent/ask` children
// as an engine's inspection records them.
import { FlowRuntime } from "@smthrs/flow"
import type { EngineStore } from "@smthrs/flows"
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { asksApproval, denied, deniedHere } from "./approvals"

const value = (json: unknown) => ({ text: typeof json === "string" ? json : JSON.stringify(json), bytes: 0, clipped: false })

/** A child of the answer's run: its flow, id, input and result. */
const child = (flowName: string, runId: string, input: unknown, result: unknown) =>
  ({ flowName, runId, input: value(input), result: result === null ? null : value(result) })

/** An inspection whose runs hold `children`, recording the runs it was asked for; `undefined` fails every read. */
const inspecting = (children: ReadonlyArray<ReturnType<typeof child>> | undefined) => {
  const asked: Array<string> = []
  const inspection = {
    inspect: (runId: string) => {
      asked.push(runId)
      return children === undefined ? Effect.fail(new Error("gone")) : Effect.succeed({ children })
    },
  } as unknown as EngineStore.RunInspection.RunInspection["Service"]
  return { inspection, asked }
}

const no = { answered: true, approved: false }

describe("denied", () => {
  test("counts a no to any approval, and names the confirm flow whose own question it was", async () => {
    const { inspection } = inspecting([
      child("flow/list", "a/call/0.0", {}, { flows: [] }),
      child("app/agent/ask", "a/call/0.1", { kind: "question", prompt: "Which?" }, { answered: true, answer: "x" }),
      child("app/agent/ask", "a/call/0.2", { kind: "approval", prompt: "Go?" }, { answered: true, approved: true }),
      child("app/agent/ask", "a/call/0.3/confirm", { kind: "approval", prompt: "Delete this flow?" }, no),
      child("app/agent/ask", "a/call/0.4/confirm", { kind: "approval", prompt: "Something else?" }, no),
      child("app/agent/ask", "a/call/0.5", { kind: "approval", prompt: "Delete this draft?" }, no),
      child("app/agent/ask", "a/call/0.6", { kind: "approval", prompt: "Waiting?" }, null),
      child("app/agent/ask", "a/call/0.7", "not json", "not json"),
    ])
    const refused = await Effect.runPromise(denied(inspection, "a"))
    expect(refused.any).toBe(true)
    // Only a confirm question names its flow; the agent's own ask with the same words doesn't.
    expect([...refused.flows]).toEqual(["flow/delete"])
  })

  test("a call's own ask is never an earlier refusal of itself: it is left out, and the others still count", async () => {
    const { inspection } = inspecting([
      child("app/agent/ask", "a/call/0.0", { kind: "approval", prompt: "Go?" }, { answered: true, approved: false, note: "Keep the logs." }),
      child("app/agent/ask", "a/call/0.1/confirm", { kind: "approval", prompt: "Delete this flow?" }, no),
    ])
    expect(await Effect.runPromise(denied(inspection, "a", ["a/call/0.0", "a/call/0.0/confirm"]))).toEqual({
      any: true,
      flows: new Set(["flow/delete"]),
    })
    expect(await Effect.runPromise(denied(inspection, "a", ["a/call/0.0", "a/call/0.1/confirm"]))).toEqual({
      any: false,
      flows: new Set(),
    })
  })

  test("a run with no no, or one it can't read, has refused nothing", async () => {
    const yes = inspecting([child("app/agent/ask", "a/call/0.0", { kind: "approval", prompt: "Go?" }, { answered: true, approved: true })])
    expect(await Effect.runPromise(denied(yes.inspection, "a"))).toEqual({ any: false, flows: new Set() })
    expect(await Effect.runPromise(denied(inspecting(undefined).inspection, "a"))).toEqual({ any: false, flows: new Set() })
  })
})

describe("deniedHere", () => {
  test("reads the run the call belongs to; outside a run, nothing", async () => {
    const { inspection, asked } = inspecting([child("app/agent/ask", "r/call/0.0", { kind: "approval", prompt: "Go?" }, no)])
    expect(await Effect.runPromise(deniedHere(inspection))).toEqual({ any: false, flows: new Set() })
    expect(asked).toEqual([])
    const inRun = deniedHere(inspection).pipe(
      Effect.provideService(FlowRuntime.FlowInstance, { executionId: "r" } as unknown as FlowRuntime.FlowInstance["Service"]),
    )
    expect((await Effect.runPromise(inRun)).any).toBe(true)
    expect(asked).toEqual(["r"])
    const own = deniedHere(inspection, ["r/call/0.0"]).pipe(
      Effect.provideService(FlowRuntime.FlowInstance, { executionId: "r" } as unknown as FlowRuntime.FlowInstance["Service"]),
    )
    expect((await Effect.runPromise(own)).any).toBe(false)
  })
})

describe("asksApproval", () => {
  test("is the agent's own app/agent/ask for an approval, nothing else", () => {
    expect(asksApproval("app/agent/ask", { kind: "approval", prompt: "Go?" })).toBe(true)
    expect(asksApproval("app/agent/ask", { kind: "question", prompt: "Which?" })).toBe(false)
    expect(asksApproval("app/agent/ask", null)).toBe(false)
    expect(asksApproval("app/agent/ask", "approval")).toBe(false)
    expect(asksApproval("flow/delete", { kind: "approval" })).toBe(false)
  })
})
