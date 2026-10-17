import { describe, expect, it } from "vitest"
import { diagnose, events } from "../examples/diagnose.ts"

describe("runnable examples", () => {
  it("diagnoses a completed run from its control events", () => {
    const result = diagnose()
    expect(result.verdict).toBe("completed — shipped")
    expect(result.facts).toMatchObject({
      status: "completed",
      seat: "anthropic:claude-sonnet-4-5",
      turns: 1,
      calls: 1,
      editsAttempted: 1,
      inputTokens: 1_200,
      outputTokens: 300,
      finalOutput: "shipped"
    })
    expect(result.span).toBe("5s")
    expect(result.card).toContain("run-1 · hello · anthropic:claude-sonnet-4-5 · 5s")
    expect(result.card).toContain("Output    shipped")
  })

  it("reads a failed run's cause in the verdict", () => {
    const failed = diagnose([
      ...events.slice(0, 2),
      { sequence: 3, kind: "control.run.failed", runId: "run-1", occurredAt: 2_000, payload: { cause: "stalled" } }
    ])
    expect(failed.verdict).toBe("failed — stalled")
    expect(failed.facts.finalOutput).toBeUndefined()
  })
})
