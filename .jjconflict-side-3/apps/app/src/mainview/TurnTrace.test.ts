import { expect, test } from "bun:test"
import type { AgentTurnFrame } from "@smthrs/rpc/NativeAgent"
import { activityCode, activityLabel, elapsed, scriptFence, turnSegments } from "./TurnTrace"

const runId = "run"
test("segments keep commentary, reasoning, activity and answer in arrival order", () => {
  const frames: AgentTurnFrame[] = [
    { runId, type: "delta", kind: "reasoning", text: "Read the " },
    { runId, type: "delta", kind: "reasoning", text: "tests" },
    { runId, type: "delta", kind: "text", text: "Checking." },
    { runId, type: "link.authored", link: 0, scriptDigest: "d0", script: "```flow\nawait commands({ argv: ['ls'] })\n```" },
    { runId, type: "call.started", link: 0, ordinal: 0, name: "commands" },
    { runId, type: "call.settled", link: 0, ordinal: 0, name: "commands", verdict: "run" },
    { runId, type: "call.started", link: 0, ordinal: 1, name: "commands" },
    { runId, type: "link.ended", link: 0, outcome: "to" },
    { runId, type: "link.authored", link: 1, scriptDigest: "d1", script: "return done({ message: 'Two tests' })" },
    { runId, type: "delta", kind: "text", text: "Two tests" },
    { runId, type: "done", reason: "stop" }
  ]
  const segments = turnSegments(frames)
  expect(segments).toEqual([
    { kind: "reasoning", text: "Read the tests" },
    { kind: "text", text: "Checking." },
    { kind: "activity", link: 0, script: "```flow\nawait commands({ argv: ['ls'] })\n```", calls: [
      { name: "commands", ordinal: 0, settled: true }, { name: "commands", ordinal: 1, settled: false }
    ] },
    { kind: "text", text: "Two tests" }
  ])
  expect(activityLabel(segments[2] as Extract<typeof segments[number], { kind: "activity" }>)).toBe("Ran commands, Running commands")
})

test("host commands expose their recorded invocation and rejected work stays visibly failed", () => {
  const segments = turnSegments([
    { runId, type: "call.started", link: 0, ordinal: 0, name: "file", arguments: "JOURNEY.md", description: "Open a file" },
    { runId, type: "gate.rejected", link: 1, kind: "shape", message: "bad shape" }
  ])
  const command = segments[0] as Extract<typeof segments[number], { kind: "activity" }>
  const failed = segments[1] as Extract<typeof segments[number], { kind: "activity" }>
  expect(activityLabel(command)).toBe("Read files")
  expect(JSON.parse(activityCode(command)!)).toEqual({ name: "file", arguments: "JOURNEY.md" })
  expect(activityLabel(failed)).toBe("Action failed")
  expect(failed.rejected).toBe("bad shape")
  expect(activityCode(failed)).toBeUndefined()
})

test("message-only calls leave only the message and old invocation frames remain readable", () => {
  expect(turnSegments([
    { runId, type: "link.authored", link: 0, scriptDigest: "d", script: "await ctx.call('message', {text:'Hello'})" },
    { runId, type: "call.started", link: 0, ordinal: 0, name: "message" },
    { runId, type: "delta", kind: "text", text: "Hello" }
  ])).toEqual([{ kind: "text", text: "Hello" }])
  const [old] = turnSegments([{ runId, type: "call.started", link: 0, ordinal: 0, name: "file" }])
  expect(activityCode(old as Extract<typeof old, { kind: "activity" }>)).toBe('{\n  "name": "file"\n}')
})

test("commentary stays on each side of an embedded card", () => {
  expect(turnSegments([
    { runId, type: "delta", kind: "text", text: "Before" },
    { runId, type: "card", card: { id: "file", kind: "file" } } as unknown as AgentTurnFrame,
    { runId, type: "delta", kind: "text", text: "After" }
  ])).toEqual([{ kind: "text", text: "Before" }, { kind: "card", id: "file" }, { kind: "text", text: "After" }])
})

test("invocation arguments remain verbatim, including deeply nested JSON", () => {
  const argumentsText = "[".repeat(10000) + "0" + "]".repeat(10000)
  const [segment] = turnSegments([{ runId, type: "call.started", link: 0, ordinal: 0, name: "docs", arguments: argumentsText }])
  const shown = JSON.parse(activityCode(segment as Extract<typeof segment, { kind: "activity" }>)!)
  expect(shown).toEqual({ name: "docs", arguments: argumentsText })
})

test("the authored script is fenced verbatim, even when it holds a fence", () => {
  expect(scriptFence("```flow\nx\n```")).toBe("````\n```flow\nx\n```\n````")
  expect(scriptFence("x")).toBe("```\nx\n```")
})

test("durations are whole elapsed seconds", () => {
  expect(elapsed(41_999)).toBe("41s")
  expect(elapsed(125_000)).toBe("2m 5s")
  expect(elapsed(3_780_000)).toBe("1h 3m")
  expect(elapsed(-5)).toBe("0s")
})
