import { Cause, Effect, Option } from "effect"
import { describe, expect, it } from "vitest"
import { fetchCommand, flowsRoot, runAgentCommand } from "../examples/agent-command.ts"

describe("examples/agent-command", () => {
  it("lists the scanned command and decodes the command-line number before invoking", async () => {
    const result = await Effect.runPromise(runAgentCommand(flowsRoot, "review --number 42"))
    expect(result).toEqual({
      listed: [{ name: "review", description: "Review a pull request." }],
      output: { accepted: true, number: 42 }
    })
  })

  it("refuses a command string the flow schema rejects", async () => {
    const exit = await Effect.runPromiseExit(runAgentCommand(flowsRoot, "review --number forty-two"))
    if (exit._tag !== "Failure") throw new Error("expected the command to fail")
    expect(Option.getOrThrow(Cause.findErrorOption(exit.cause))).toMatchObject({ code: "decode_failed" })
  })

  it("serves the same route over HTTP", async () => {
    const body = await fetchCommand(flowsRoot, new Request("http://localhost/review?number=7"))
    expect(body).toMatchObject({ ok: true, data: { accepted: true, number: 7 } })
  })
})
