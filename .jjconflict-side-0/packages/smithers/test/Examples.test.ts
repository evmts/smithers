import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { renderRefusal, renderReport, retentionWindow } from "../examples/render-output.ts"

describe("examples/render-output", () => {
  it("renders one report as compact JSON and as indented text", () => {
    const rendered = Effect.runSync(renderReport())
    expect(JSON.parse(rendered.json)).toEqual({ dryRun: true, olderThan: "30d", runs: ["run-1", "run-2"] })
    expect(rendered.json).not.toContain("\n  ")
    expect(rendered.human).toContain("\n  ")
    expect(rendered.exitCode).toBe(0)
  })

  it("refuses an executable member with its code and path", () => {
    expect(Effect.runSync(renderRefusal())).toEqual({ code: "callable", path: "$[\"onDone\"]" })
  })

  it("reads the retention windows gc accepts and refuses", () => {
    expect(retentionWindow("12h")).toBe(12 * 60 * 60 * 1000)
    expect(retentionWindow("0s")).toBeUndefined()
    expect(retentionWindow("forever")).toBeUndefined()
  })
})
