import * as Model from "@smthrs/model/Model"
import { ModelError } from "@smthrs/model/ModelError"
import type * as ModelEvent from "@smthrs/model/ModelEvent"
import type { AgentTurnFrame, StartAgentTurnRequest } from "@smthrs/rpc/NativeAgent"
import { Effect, Fiber, Stream } from "effect"
import { describe, expect, test } from "vitest"
import { providerRequest, runModelTurn, StreamingCredentialCutter } from "../src/ModelTurnHost.ts"

const turn: StartAgentTurnRequest = {
  runId: "run-1",
  instructions: "help",
  messages: [
    { role: "user", content: "inspect" },
    { type: "function_call", call_id: "old", name: "read", arguments: "{}" },
    { type: "function_call_output", call_id: "old", output: "ok" }
  ],
  tools: [{ type: "function", name: "write", description: "write a file", parameters: { type: "object" } }]
}

describe("ModelTurnHost", () => {
  test("projects the established wire into the canonical model request", () => {
    const request = providerRequest(turn, { modelId: "model-a", maxTokens: 99 })
    expect(request.modelId).toBe("model-a")
    expect(request.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"])
    expect(request.tools[0]?.name).toBe("write")
    expect(request.params.maxTokens).toBe(99)
  })

  test("streams deterministic text and tool invocation before a real terminal", async () => {
    const events: ReadonlyArray<ModelEvent.ModelEvent> = [
      { type: "text-delta", id: "text", text: "hello " },
      { type: "text-delta", id: "text", text: "world" },
      { type: "tool-call-start", id: "call-1", name: "write" },
      { type: "tool-call-delta", id: "call-1", arguments: "{\"path\":" },
      { type: "tool-call-end", id: "call-1", arguments: "{\"path\":\"a\"}" },
      { type: "settle", stopReason: "tool-calls" }
    ]
    const model = Model.make({ stream: () => Stream.fromIterable(events) })
    const frames: Array<AgentTurnFrame> = []
    await Effect.runPromise(
      runModelTurn(model, turn, { modelId: "model-a" }, (frame) => Effect.sync(() => frames.push(frame)))
    )
    expect(frames).toEqual([
      { runId: "run-1", type: "delta", kind: "text", text: "hello " },
      { runId: "run-1", type: "delta", kind: "text", text: "world" },
      { runId: "run-1", type: "tool_call", call_id: "call-1", name: "write", arguments: "{\"path\":\"a\"}" },
      { runId: "run-1", type: "done", reason: "tool_call" }
    ])
  })

  test("cuts a credential split across provider chunks and tool arguments", async () => {
    const events: ReadonlyArray<ModelEvent.ModelEvent> = [
      { type: "text-delta", id: "text", text: "key=sk-se" },
      { type: "text-delta", id: "text", text: "cret safe" },
      { type: "tool-call-start", id: "call", name: "write" },
      { type: "tool-call-end", id: "call", arguments: "{\"key\":\"sk-secret\"}" },
      { type: "settle", stopReason: "tool-calls" }
    ]
    const frames: Array<AgentTurnFrame> = []
    await Effect.runPromise(
      runModelTurn(Model.make({ stream: () => Stream.fromIterable(events) }), turn, {
        modelId: "m",
        credential: "sk-secret"
      }, (frame) => Effect.sync(() => frames.push(frame)))
    )
    expect(JSON.stringify(frames)).not.toContain("sk-secret")
    expect(frames.some((frame) => frame.type === "delta" && frame.text.includes("safe"))).toBe(true)
  })

  test("fiber interruption emits no invented completion", async () => {
    const frames: Array<AgentTurnFrame> = []
    const model = Model.make({ stream: () => Stream.never })
    const fiber = Effect.runFork(
      runModelTurn(model, turn, { modelId: "m" }, (frame) => Effect.sync(() => frames.push(frame)))
    )
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(frames).toEqual([])
  })

  test("credential cutter holds only a possible secret prefix", () => {
    const cutter = new StreamingCredentialCutter("abcdef")
    expect(cutter.push("safe abc")).toBe("safe ")
    expect(cutter.push("xyz")).toBe("abcxyz")
    expect(cutter.finish()).toBe("")
  })
})

const collect = async (events: ReadonlyArray<ModelEvent.ModelEvent>, credential?: string) => {
  const frames: AgentTurnFrame[] = []
  await Effect.runPromise(runModelTurn(
    Model.make({ stream: () => Stream.fromIterable(events) }),
    turn,
    { modelId: "fixture", ...(credential === undefined ? {} : { credential }) },
    (frame) =>
      Effect.sync(() => {
        frames.push(frame)
      })
  ))
  return frames
}

test("groups consecutive calls and results without merging ordinary assistant messages", () => {
  const call = { type: "function_call", call_id: "first", name: "read", arguments: "{}" } as const
  const result = { type: "function_call_output", call_id: "first", output: "ok" } as const
  const request = providerRequest({
    ...turn,
    messages: [call, { ...call, call_id: "second" }, result, { ...result, call_id: "second" }, {
      role: "assistant",
      content: "done"
    }, call]
  }, { modelId: "fixture" })
  expect(request.messages.map((message) => [message.role, message.content.length])).toEqual([
    ["assistant", 2],
    ["tool", 2],
    ["assistant", 1],
    ["assistant", 1]
  ])
  expect(
    providerRequest({ runId: turn.runId, instructions: turn.instructions, messages: [result] }, { modelId: "fixture" })
      .tools
  ).toEqual([])
})

test.each(["aborted", "error", "content-filter", "unknown", "stop", "length"] as const)(
  "preserves the terminal meaning of %s",
  async (stopReason) => {
    const frames = await collect([{ type: "settle", stopReason }])
    expect(frames).toEqual([{
      runId: turn.runId,
      type: "done",
      reason: stopReason === "aborted" ? "cancelled" : "stop",
      ...(["error", "content-filter", "unknown", "length"].includes(stopReason)
        ? { error: `model stopped: ${stopReason}` }
        : {})
    }])
  }
)

test("reports the call's merged usage on every done frame, tool calls included", async () => {
  expect(
    await collect([
      { type: "usage", inputTokens: 1_000, cachedInputTokens: 900 },
      { type: "usage", outputTokens: 40, reasoningTokens: 7 },
      { type: "settle", stopReason: "tool-calls" }
    ])
  ).toEqual([{
    runId: turn.runId,
    type: "done",
    reason: "tool_call",
    usage: { inputTokens: 1_000, cachedInputTokens: 900, outputTokens: 40 }
  }])
  expect(
    await collect([
      { type: "usage", inputTokens: 5, outputTokens: 1 },
      { type: "retry", attempt: 1, code: "overloaded", delayMillis: 0 },
      { type: "usage", outputTokens: 2 },
      { type: "settle", stopReason: "stop" }
    ])
  ).toEqual([{ runId: turn.runId, type: "done", reason: "stop", usage: { outputTokens: 2 } }])
})

test("omits usage when the provider reports none or only invalid counts", async () => {
  expect(
    await collect([{ type: "usage", inputTokens: -1, outputTokens: Number.NaN }, {
      type: "settle",
      stopReason: "stop"
    }])
  ).toEqual([{ runId: turn.runId, type: "done", reason: "stop" }])
})

test("flushes held text and reasoning at settlement and uses accumulated tool arguments", async () => {
  expect(
    await collect([
      { type: "text-start", id: "text" },
      { type: "text-delta", id: "text", text: "abc" },
      { type: "thinking-delta", id: "thought", text: "abc" },
      { type: "tool-call-start", id: "call", name: "abcdefinspect" },
      { type: "tool-call-delta", id: "call", arguments: "{\"value\":\"abcdef\"}" },
      { type: "tool-call-end", id: "call" },
      { type: "settle", stopReason: "tool-calls" }
    ], "abcdef")
  ).toEqual([
    { runId: turn.runId, type: "tool_call", call_id: "call", name: "inspect", arguments: "{\"value\":\"\"}" },
    { runId: turn.runId, type: "delta", kind: "reasoning", text: "abc" },
    { runId: turn.runId, type: "delta", kind: "text", text: "abc" },
    { runId: turn.runId, type: "done", reason: "tool_call" }
  ])
  const cutter = new StreamingCredentialCutter("")
  expect(cutter.push("unchanged")).toBe("unchanged")
})

test.each(
  [
    [[{ type: "tool-call-delta", id: "missing", arguments: "{}" }], "tool delta preceded its start"],
    [[{ type: "tool-call-end", id: "missing" }], "tool end preceded its start"],
    [[{ type: "settle", stopReason: "stop" }, { type: "settle", stopReason: "stop" }], "model settled twice"],
    [[], "model stream ended without settlement"]
  ] satisfies Array<[ModelEvent.ModelEvent[], string]>
)("rejects malformed event sequences %j", async (events, message) => {
  await expect(collect(events)).rejects.toThrow(message)
})

// The provider can nest a credential around another copy. Removing the inner
// copy joins the outer fragments; chunking must never make those fragments leak.
test.each([1, 2, 3, 5, 8, 13, 21, 100])(
  "nested credential removal is invariant under %i-character provider chunks",
  (width) => {
    const secret = "sk-nested-credential"
    const middle = Math.floor(secret.length / 2)
    const prefix = secret.slice(0, middle), suffix = secret.slice(middle)
    const input = `safe before ${prefix}${prefix}${suffix}${suffix} safe after`
    const cutter = new StreamingCredentialCutter(secret)
    let output = ""
    for (let offset = 0; offset < input.length; offset += width) {
      output += cutter.push(
        input.slice(offset, offset + width)
      )
    }
    output += cutter.finish()
    expect(output).not.toContain(secret)
    expect(output).toBe("safe before  safe after")
  }
)

test("nested credential fragments never enter text, reasoning, or tool frames while safe words and usage survive", async () => {
  const credential = "sk-frame-secret"
  const split = 7, prefix = credential.slice(0, split), suffix = credential.slice(split)
  const nested = prefix + prefix + suffix + suffix
  const fragments = [...`before ${nested} after`]
  const events: Array<ModelEvent.ModelEvent> = [
    ...fragments.map((text) => ({ type: "text-delta" as const, id: "text", text })),
    ...fragments.map((text) => ({ type: "thinking-delta" as const, id: "reasoning", text })),
    { type: "tool-call-start", id: "call", name: "write" },
    { type: "tool-call-end", id: "call", arguments: JSON.stringify({ note: `before ${nested} after`, count: 2 }) },
    { type: "usage", inputTokens: 12, outputTokens: 3 },
    { type: "settle", stopReason: "tool-calls" }
  ]
  const frames: Array<AgentTurnFrame> = []
  await Effect.runPromise(
    runModelTurn(
      Model.make({ stream: () => Stream.fromIterable(events) }),
      turn,
      { modelId: "nested", credential },
      (frame) => Effect.sync(() => frames.push(frame))
    )
  )
  for (const kind of ["text", "reasoning"] as const) {
    const output = frames.filter((frame) => frame.type === "delta" && frame.kind === kind).map((frame) =>
      frame.type === "delta" ? frame.text : ""
    ).join("")
    expect(output).not.toContain(credential)
    expect(output).toBe("before  after")
  }
  const tool = frames.find((frame) => frame.type === "tool_call")
  expect(tool?.type === "tool_call" && JSON.parse(tool.arguments)).toEqual({ note: "before  after", count: 2 })
  expect(frames.at(-1)).toEqual({
    runId: "run-1",
    type: "done",
    reason: "tool_call",
    usage: { inputTokens: 12, outputTokens: 3 }
  })
})

test("independent credentials get separate cutters and ordinary partial matches remain readable", () => {
  for (const secret of ["old-secret", "new-secret"]) {
    const cutter = new StreamingCredentialCutter(secret)
    const unrelated = `safe ${secret.slice(0, 3)}-ordinary tail`
    const output = cutter.push(unrelated) + cutter.finish()
    expect(output).toBe(unrelated)
    const refreshed = new StreamingCredentialCutter(secret)
    expect(refreshed.push(`before ${secret}`) + refreshed.finish()).toBe("before ")
  }
})

test("interrupting a provider holding a credential prefix emits no secret or invented completion", async () => {
  const credential = "sk-interrupted-secret"
  const observed = Promise.withResolvers<void>()
  const frames: Array<AgentTurnFrame> = []
  const pending: ModelEvent.ModelEvent = {
    type: "text-delta",
    id: "text",
    text: "visible safe words ".repeat(8) + credential.slice(0, 7)
  }
  const model = Model.make({ stream: () => Stream.concat(Stream.succeed(pending), Stream.never) })
  const fiber = Effect.runFork(runModelTurn(model, turn, { modelId: "held", credential }, (frame) =>
    Effect.sync(() => {
      frames.push(frame)
      observed.resolve()
    })))
  await observed.promise
  await Effect.runPromise(Fiber.interrupt(fiber))
  expect(frames.some((frame) => frame.type === "delta" && frame.text.includes("visible safe words"))).toBe(true)
  expect(frames.some((frame) => frame.type === "done")).toBe(false)
  expect(
    frames.filter((frame) => frame.type === "delta").map((frame) => frame.type === "delta" ? frame.text : "").join("")
  ).not.toContain(credential)
})

test("deep nested prefixes preserve ordinary text at finish and cut every completed credential", () => {
  const depth = 32_768
  const cutter = new StreamingCredentialCutter("ab")
  const first = cutter.push("ordinary " + "a".repeat(depth))
  const last = cutter.push("b".repeat(depth)) + cutter.finish()
  expect(first + last).toBe("ordinary ")
  const unfinished = new StreamingCredentialCutter("ab")
  expect(unfinished.push("safe " + "a".repeat(depth)) + unfinished.finish()).toBe("safe " + "a".repeat(depth))
})

test.each([1, 2, 3, 7, 31])("Unicode credential cuts preserve safe text with %i-code-unit chunks", (width) => {
  const secret = "🔐密钥"
  const input = "前文 " + secret.slice(0, 2) + secret + secret.slice(2) + " 後文"
  const cutter = new StreamingCredentialCutter(secret)
  let output = ""
  for (let offset = 0; offset < input.length; offset += width) {
    output += cutter.push(input.slice(offset, offset + width))
  }
  output += cutter.finish()
  expect(output).toBe("前文  後文")
  expect(output).not.toContain(secret)
})

test("retained text, reasoning, and unfinished tool arguments share the real output byte bound", async () => {
  const events: ReadonlyArray<ModelEvent.ModelEvent> = [
    { type: "text-delta", id: "text", text: "a".repeat(6 * 1024 * 1024) },
    { type: "thinking-delta", id: "reason", text: "a".repeat(6 * 1024 * 1024) },
    { type: "tool-call-start", id: "pending", name: "write" },
    { type: "tool-call-delta", id: "pending", arguments: "x".repeat(5 * 1024 * 1024) },
    { type: "settle", stopReason: "stop" }
  ]
  const frames: AgentTurnFrame[] = []
  const outcome = await Effect.runPromise(
    runModelTurn(
      Model.make({ stream: () => Stream.fromIterable(events) }),
      turn,
      { modelId: "bounded", credential: "ab" },
      (frame) =>
        Effect.sync(() => {
          frames.push(frame)
        })
    ).pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }))
  )
  expect(outcome).toMatchObject({ _tag: "StreamTooLarge", limitBytes: 16 * 1024 * 1024 })
  expect(frames.some((frame) => frame.type === "done" || frame.type === "tool_call")).toBe(false)
  expect(JSON.stringify(frames)).not.toContain("ab")
})

test.each([undefined, "", "x", "aaa", "abab"])("ordinary output survives credential boundary %s", (secret) => {
  const cutter = new StreamingCredentialCutter(secret)
  const ordinary = "前文 🌍 safe words "
  expect(cutter.push(ordinary) + cutter.finish()).toBe(ordinary)
})

test("the exact output byte boundary remains readable and its next Unicode bytes refuse safely", () => {
  const limit = 16 * 1024 * 1024
  const ordinary = "z".repeat(limit)
  const exact = new StreamingCredentialCutter("ab")
  expect(exact.push(ordinary) + exact.finish()).toBe(ordinary)
  const multibyte = new StreamingCredentialCutter("ab")
  expect(multibyte.push("z".repeat(limit - 3))).toHaveLength(limit - 3)
  expect(() => multibyte.push("🌍")).toThrowError(
    expect.objectContaining({ _tag: "StreamTooLarge", limitBytes: limit })
  )
})

test("a rejected retained-output budget cannot flush its previously held prefix", () => {
  const cutter = new StreamingCredentialCutter("ab")
  expect(cutter.push("a".repeat(1024))).toBe("")
  expect(() => cutter.push("a".repeat(16 * 1024 * 1024))).toThrowError(
    expect.objectContaining({ _tag: "StreamTooLarge" })
  )
  expect(() => cutter.finish()).toThrowError(expect.objectContaining({ _tag: "StreamTooLarge" }))
})

test("an oversized configured credential refuses before provider output can be processed", () => {
  expect(() => new StreamingCredentialCutter("k".repeat(16 * 1024 * 1024 + 1))).toThrowError(
    expect.objectContaining({ _tag: "StreamTooLarge", limitBytes: 16 * 1024 * 1024 })
  )
})

test("a synchronous frame writer defect finalizes the provider without inventing completion", async () => {
  let finalized = false
  const events: ReadonlyArray<ModelEvent.ModelEvent> = [
    { type: "text-delta", id: "text", text: "safe visible output" },
    { type: "settle", stopReason: "stop" }
  ]
  const defect = new Error("fixture-writer-defect")
  const emitted: AgentTurnFrame[] = []
  const model = Model.make({
    stream: () =>
      Stream.fromIterable(events).pipe(Stream.ensuring(Effect.sync(() => {
        finalized = true
      })))
  })
  await expect(Effect.runPromise(runModelTurn(model, turn, { modelId: "fixture" }, (frame) => {
    emitted.push(frame)
    throw defect
  }))).rejects.toThrow("fixture-writer-defect")
  expect(finalized).toBe(true)
  expect(emitted.some((frame) => frame.type === "done")).toBe(false)
})

test("repeated ordinary-prefix flushes preserve bytes before a later nested private echo on the same cutter", () => {
  const cutter = new StreamingCredentialCutter("ab")
  let ordinary = ""
  for (let at = 0; at < 256; at++) ordinary += cutter.push("az".repeat(128))
  expect(ordinary).toBe("az".repeat(128 * 256))
  let privateOutput = cutter.push(" before a")
  privateOutput += cutter.push("abb after")
  privateOutput += cutter.finish()
  expect(privateOutput).toBe(" before  after")
  expect(privateOutput).not.toContain("ab")
})

test.each([["plain", "sk-private-id"], ["nested", "sk-sk-private-idprivate-id"]] as const)(
  "%s credential-bearing provider tool id refuses without rewriting its correlation",
  async (_kind, id) => {
    const events: ReadonlyArray<ModelEvent.ModelEvent> = [
      { type: "tool-call-start", id, name: "read" },
      { type: "tool-call-end", id, arguments: "{}" },
      { type: "settle", stopReason: "tool-calls" }
    ]
    const frames: AgentTurnFrame[] = []
    const failure = await Effect.runPromise(
      runModelTurn(Model.make({ stream: () => Stream.fromIterable(events) }), turn, {
        modelId: "fixture",
        credential: "sk-private-id"
      }, (frame) =>
        Effect.sync(() => {
          frames.push(frame)
        })).pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }))
    )
    expect(failure).toBeInstanceOf(ModelError)
    expect(failure).toMatchObject({ code: "invalid_provider_output" })
    expect(frames.some((frame) => frame.type === "tool_call" || frame.type === "done")).toBe(false)
    expect(JSON.stringify(frames)).not.toContain("sk-private-id")
  }
)

test.each(
  [
    ["escaped value", String.raw`{"note":"\u0073k-private-id"}`],
    ["escaped nested array", String.raw`{"nested":[{"note":"sk-\u0073k-private-idprivate-id"}]}`],
    ["plain object key", "{\"sk-private-id\":1}"],
    ["escaped object key", String.raw`{"\u0073k-private-id":1}`]
  ] as const
)("%s cannot disclose a decoded credential or change a tool key", async (_kind, argumentsJson) => {
  const events: ReadonlyArray<ModelEvent.ModelEvent> = [
    { type: "tool-call-start", id: "safe-call", name: "read" },
    { type: "tool-call-end", id: "safe-call", arguments: argumentsJson },
    { type: "settle", stopReason: "tool-calls" }
  ]
  const frames: AgentTurnFrame[] = []
  const failure = await Effect.runPromise(
    runModelTurn(Model.make({ stream: () => Stream.fromIterable(events) }), turn, {
      modelId: "fixture",
      credential: "sk-private-id"
    }, (frame) =>
      Effect.sync(() => {
        frames.push(frame)
      })).pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }))
  )
  expect(failure).toBeInstanceOf(ModelError)
  expect(failure).toMatchObject({ code: "invalid_provider_output" })
  expect(frames.some((frame) => frame.type === "tool_call" || frame.type === "done")).toBe(false)
})

test.each([
  " { \"large\": 9007199254740993123456789, \"values\": [true, null, \"ordinary\"] } \n",
  " { \"unfinished\": "
])("ordinary tool arguments retain their exact bytes and safe correlation", async (argumentsJson) => {
  const frames = await collect([
    { type: "tool-call-start", id: "safe-call", name: "read" },
    { type: "tool-call-end", id: "safe-call", arguments: argumentsJson },
    { type: "settle", stopReason: "tool-calls" }
  ], "sk-private-id")
  expect(frames).toEqual([
    { runId: turn.runId, type: "tool_call", call_id: "safe-call", name: "read", arguments: argumentsJson },
    { runId: turn.runId, type: "done", reason: "tool_call" }
  ])
})

test("structural array indices are not tool keys, while matching object keys refuse", async () => {
  expect(
    await collect([
      { type: "tool-call-start", id: "safe-call", name: "read" },
      { type: "tool-call-end", id: "safe-call", arguments: "[true, \"safe\"]" },
      { type: "settle", stopReason: "tool-calls" }
    ], "0")
  ).toContainEqual({
    runId: turn.runId,
    type: "tool_call",
    call_id: "safe-call",
    name: "read",
    arguments: "[true, \"safe\"]"
  })
  await expect(collect([
    { type: "tool-call-start", id: "safe-call", name: "read" },
    { type: "tool-call-end", id: "safe-call", arguments: "{\"0\":true}" },
    { type: "settle", stopReason: "tool-calls" }
  ], "0")).rejects.toThrow()
})

test("credential cutting that corrupts originally valid tool JSON refuses instead of dispatching changed arguments", async () => {
  const events: ReadonlyArray<ModelEvent.ModelEvent> = [
    { type: "tool-call-start", id: "safe-call", name: "read" },
    { type: "tool-call-end", id: "safe-call", arguments: "{\"value\":7}" },
    { type: "settle", stopReason: "tool-calls" }
  ]
  const frames: AgentTurnFrame[] = []
  const failure = await Effect.runPromise(
    runModelTurn(
      Model.make({ stream: () => Stream.fromIterable(events) }),
      turn,
      { modelId: "fixture", credential: "7" },
      (frame) =>
        Effect.sync(() => {
          frames.push(frame)
        })
    ).pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }))
  )
  expect(failure).toBeInstanceOf(ModelError)
  expect(failure).toMatchObject({ code: "invalid_provider_output" })
  expect(frames.some((frame) => frame.type === "tool_call" || frame.type === "done")).toBe(false)
})
