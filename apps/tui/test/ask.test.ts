import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import type * as Host from "../src/host.ts"

// Entrypoint units in owned children. Public Host.make and Models.detect are
// doubled only inside each child, preventing provider calls/account discovery.
// The actual ask module, configuration parsers, JSON output and file IO run.
interface Probe {
  readonly args: ReadonlyArray<string>
  readonly outcome?: Host.Outcome
  readonly detectedSeat?: string
  readonly events?: ReadonlyArray<"delta" | "resolved">
  readonly answer?: string
  readonly record?: boolean
  readonly environment?: Readonly<Record<string, string | undefined>>
}
async function bounded<A>(promise: Promise<A>, ms: number): Promise<A> {
  const controller = new AbortController()
  try {
    return await Promise.race([
      promise,
      setTimeout(ms, undefined, { signal: controller.signal }).then(() => {
        throw new Error("Owned ask child did not close")
      })
    ])
  } finally {
    controller.abort()
  }
}
const probe = async (options: Probe) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tui-ask-unit-")))
  const peer = join(root, "peer.ts")
  const callsFile = join(root, "calls.jsonl")
  const recordFile = join(root, "record.jsonl")
  if (options.record) writeFileSync(recordFile, "old recording\n")
  writeFileSync(
    peer,
    `
import { mock } from "bun:test"
import { appendFileSync } from "node:fs"
import { setImmediate } from "node:timers/promises"
import * as AgentEvent from ${JSON.stringify(import.meta.resolve("@smthrs/harness/AgentEvent"))}
import * as ModelRequest from ${JSON.stringify(import.meta.resolve("@smthrs/model/ModelRequest"))}
const log = (value) => appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(value) + "\\n")
mock.module(${JSON.stringify(import.meta.resolve("../src/models.ts"))}, () => ({
  detect: () => ({ models: [], defaultSeat: ${
      JSON.stringify(options.detectedSeat)
    }, workerSeat: undefined, environment: { FIXTURE: "isolated" } })
}))
mock.module(${JSON.stringify(import.meta.resolve("../src/host.ts"))}, () => ({
  make: (options) => {
    log({ kind: "make", options })
    return {
      run: (input) => {
        log({ kind: "run", prompt: input.prompt, seat: input.seat, history: input.history })
        for (const kind of ${JSON.stringify(options.events ?? [])}) {
          input.onEvent(kind === "delta"
            ? new AgentEvent.ModelDelta({ eventType: "flows.harness.model-delta.v1", delta: { type: "text-delta", id: "delta-1", text: "Hidden preview" } })
            : new AgentEvent.Resolved({ eventType: "flows.harness.resolved.v1", message: ModelRequest.Message.assistant(${
      JSON.stringify(options.answer ?? "Answer")
    }) }))
        }
        return { done: Promise.resolve(${
      JSON.stringify(options.outcome ?? { _tag: "done", answer: "Answer" })
    }), cancel: () => log({ kind: "cancel" }) }
      },
      dispose: async () => { await setImmediate(); log({ kind: "dispose" }) }
    }
  }
}))
process.argv = [process.execPath, ${JSON.stringify(import.meta.resolve("../src/ask.ts"))}, ...${
      JSON.stringify(options.args)
    }]
await import(${JSON.stringify(import.meta.resolve("../src/ask.ts"))})
`
  )
  const child = spawn(process.execPath, [peer], {
    cwd: root,
    detached: process.platform !== "win32",
    env: {
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR,
      NO_COLOR: "1",
      SMITHERS_TUI_APPROVE: "all",
      ...options.environment,
      ...(options.record ? { SMITHERS_TUI_RECORD: recordFile } : {})
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = "", stderr = ""
  child.stdout!.on("data", (chunk) => {
    stdout += String(chunk)
  })
  child.stderr!.on("data", (chunk) => {
    stderr += String(chunk)
  })
  const closed = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>()
  child.once("close", (code, signal) => closed.resolve({ code, signal }))
  child.once("error", (error) => closed.reject(error))
  try {
    const result = await bounded(closed.promise, 10000)
    return {
      ...result,
      stdout,
      stderr,
      cwd: root,
      calls: existsSync(callsFile)
        ? readFileSync(callsFile, "utf8").trim().split("\n").map((line) => JSON.parse(line))
        : [],
      recording: existsSync(recordFile) ? readFileSync(recordFile, "utf8") : undefined
    }
  } finally {
    try {
      if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL")
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") throw error
        }
        await bounded(closed.promise, 5000)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

test("missing prompt refuses with usage before constructing a host", async () => {
  const result = await probe({ args: [] })
  expect(result.code).toBe(2)
  expect(result.stderr).toBe("usage: bun src/ask.ts \"<prompt>\" [seat]\n")
  expect(result.stdout).toBe("")
  expect(result.calls).toEqual([])
})

test.each([
  { environment: { SMITHERS_TUI_APPROVE: "ask" }, error: "SMITHERS_TUI_APPROVE=ask needs the interactive TUI" },
  { environment: { SMITHERS_TUI_APPROVE: "invalid" }, error: "SMITHERS_TUI_APPROVE must be ask, all or deny" },
  {
    environment: { SMITHERS_TUI_BUDGET_TOKENS: "0" },
    error: "SMITHERS_TUI_BUDGET_TOKENS must be a positive whole number"
  },
  {
    environment: { SMITHERS_TUI_BUDGET_TOKENS: "1.5" },
    error: "SMITHERS_TUI_BUDGET_TOKENS must be a positive whole number"
  },
  {
    environment: { SMITHERS_TUI_BUDGET_TOKENS: "9007199254740992" },
    error: "SMITHERS_TUI_BUDGET_TOKENS must be a positive whole number"
  }
])("invalid headless configuration $environment refuses before constructing a host", async ({ environment, error }) => {
  const result = await probe({ args: ["Check"], environment })
  expect(result.code).toBe(2)
  expect(result.stderr).toBe(`${error}\n`)
  expect(result.stdout).toBe("")
  expect(result.calls).toEqual([])
})

test.each([
  { args: ["Check", "replay:explicit"], detectedSeat: "replay:detected", expectedSeat: "replay:explicit" },
  { args: ["Check"], detectedSeat: "replay:detected", expectedSeat: "replay:detected" },
  { args: ["Check"], expectedSeat: "openai:gpt-6-sol" }
])(
  "seat $expectedSeat follows explicit, detected, then fallback precedence",
  async ({ args, detectedSeat, expectedSeat }) => {
    const result = await probe({ args, ...(detectedSeat === undefined ? {} : { detectedSeat }) })
    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.calls).toEqual([
      { kind: "make", options: { cwd: result.cwd, environment: { FIXTURE: "isolated" }, approvals: "all" } },
      { kind: "run", prompt: "Check", seat: expectedSeat, history: [] },
      { kind: "dispose" }
    ])
    expect(result.stdout).toBe("{\"_tag\":\"done\",\"answer\":\"Answer\"}\n")
  }
)

test.each([
  { outcome: { _tag: "failed", message: "Checks failed", detail: "Fixture refusal" } satisfies Host.Outcome, code: 1 },
  { outcome: { _tag: "cancelled" } satisfies Host.Outcome, code: 1 }
])("$outcome._tag prints the exact terminal outcome and disposes the host before exit", async ({ outcome, code }) => {
  const result = await probe({ args: ["Check"], outcome })
  expect(result.code).toBe(code)
  expect(result.stdout).toBe(`${JSON.stringify(outcome)}\n`)
  expect(result.calls.map((call) => call.kind)).toEqual(["make", "run", "dispose"])
})

test("deny mode and a valid token ceiling are passed as concrete host options", async () => {
  const result = await probe({
    args: ["Check"],
    environment: { SMITHERS_TUI_APPROVE: "deny", SMITHERS_TUI_BUDGET_TOKENS: "500" }
  })
  expect(result.code).toBe(0)
  expect(result.calls[0]).toEqual({
    kind: "make",
    options: {
      cwd: result.cwd,
      environment: { FIXTURE: "isolated" },
      approvals: "deny",
      budget: { tokens: { max: 500, onExceeded: "fail" } }
    }
  })
})

test("recording retains model deltas while stdout emits only complete non-delta events and outcome", async () => {
  const result = await probe({ args: ["Check"], events: ["delta", "resolved"], record: true })
  const lines = result.stdout.trim().split("\n").map((line) => JSON.parse(line))
  expect(lines).toEqual([
    {
      _tag: "resolved",
      eventType: "flows.harness.resolved.v1",
      message: { role: "assistant", content: [{ type: "text", text: "Answer" }], stopReason: "unknown" }
    },
    { _tag: "done", answer: "Answer" }
  ])
  const recorded = result.recording!.trim().split("\n").map((line) => JSON.parse(line))
  expect(recorded.map((row) => row.event)).toEqual([
    {
      _tag: "model-delta",
      eventType: "flows.harness.model-delta.v1",
      delta: { type: "text-delta", id: "delta-1", text: "Hidden preview" }
    },
    lines[0]
  ])
  expect(recorded.every((row) => Number.isSafeInteger(row.at) && row.at > 0)).toBe(true)
  expect(result.recording).not.toContain("old recording")
})

const longAnswer = `Unicode 😀 and a newline\n${"界".repeat(500)}\nEnd`
test("a valid long Unicode event remains one parseable JSON line with the complete payload", async () => {
  const result = await probe({
    args: ["Check"],
    events: ["resolved"],
    answer: longAnswer,
    outcome: { _tag: "done", answer: longAnswer },
    record: true
  })
  expect(result.code).toBe(0)
  const recording = result.recording!.trim().split("\n").map((line) => JSON.parse(line))
  const expectedEvent = {
    _tag: "resolved",
    eventType: "flows.harness.resolved.v1",
    message: { role: "assistant", content: [{ type: "text", text: longAnswer }], stopReason: "unknown" }
  }
  expect(recording).toEqual([{ at: expect.any(Number), event: expectedEvent }])
  expect(Number.isSafeInteger(recording[0].at) && recording[0].at > 0).toBe(true)
  const lines = result.stdout.trim().split("\n")
  expect(lines).toHaveLength(2)
  const emitted = lines.map((line) => JSON.parse(line))
  expect(emitted).toEqual([expectedEvent, { _tag: "done", answer: longAnswer }])
})

test.each([399, 400, 401])("a valid event of %i serialized characters remains a complete JSON line", async (length) => {
  const empty = {
    _tag: "resolved",
    eventType: "flows.harness.resolved.v1",
    message: { role: "assistant", content: [{ type: "text", text: "" }], stopReason: "unknown" }
  }
  const answer = "a".repeat(length - JSON.stringify(empty).length)
  const expected = { ...empty, message: { ...empty.message, content: [{ type: "text", text: answer }] } }
  expect(JSON.stringify(expected).length).toBe(length)
  const result = await probe({ args: ["Check"], events: ["resolved"], answer })
  expect(result.code).toBe(0)
  const lines = result.stdout.trim().split("\n")
  expect(lines).toHaveLength(2)
  expect(lines.map((line) => JSON.parse(line))).toEqual([expected, { _tag: "done", answer: "Answer" }])
})
