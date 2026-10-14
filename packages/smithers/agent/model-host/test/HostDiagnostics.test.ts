import * as Model from "@smthrs/model/Model"
import type * as ModelEvent from "@smthrs/model/ModelEvent"
import type { AgentTurnCursor } from "@smthrs/rpc/AgentTurnJournal"
import type { StartAgentTurnRequest } from "@smthrs/rpc/NativeAgent"
import { Effect, Fiber, Stream } from "effect"
import { describe, expect, test, vi } from "vitest"
import { DurableChatProducer } from "../src/DurableChatProducer.ts"
import { createHostDiagnostics, HOST_DIAGNOSTIC_MARKER } from "../src/HostDiagnostics.ts"
import { runModelTurn } from "../src/ModelTurnHost.ts"

/** Collects the record lines one recorder writes. */
const collector = () => {
  const lines: Array<Record<string, unknown>> = []
  return {
    lines,
    write: (line: string) => {
      expect(line.endsWith("\n")).toBe(true)
      lines.push(JSON.parse(line) as Record<string, unknown>)
    },
    phase: (event: string, phase: string) => lines.filter((line) => line.event === event && line.phase === phase)
  }
}

/** Waits, on real timers, for the recorder to write a matching record. */
const waitFor = async (
  find: () => ReadonlyArray<Record<string, unknown>>,
  count = 1
): Promise<ReadonlyArray<Record<string, unknown>>> => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const found = find()
    if (found.length >= count) return found
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("the recorder wrote no such record")
}

describe("createHostDiagnostics", () => {
  test("names the turn and keeps only bounded, non-textual fields", () => {
    const sink = collector()
    const diagnostics = createHostDiagnostics({ turnId: "7e5fc00f-8f6b-47ca", write: sink.write, clock: () => 25 })
    diagnostics.record("model_stream", "first_event", {
      kind: "text-delta",
      events: 3,
      settled: false,
      // Every one of these must be refused: a recorder is not a channel for
      // prompt text, a destination, a header or a credential.
      prompt: "the user asked about their invoice",
      destination: "https://api.cerebras.ai/v1/chat/completions",
      authorization: "Bearer sk-secret-value",
      ratio: Number.NaN,
      "bad key": 1
    })
    expect(sink.lines).toHaveLength(1)
    expect(sink.lines[0]).toEqual({
      diagnostic: HOST_DIAGNOSTIC_MARKER,
      turnId: "7e5fc00f-8f6b-47ca",
      event: "model_stream",
      phase: "first_event",
      atMillis: 0,
      kind: "text-delta",
      events: 3,
      settled: false,
      droppedFields: 5
    })
  })

  test("reports an unfinished operation while it is still unfinished", () => {
    const sink = collector()
    let now = 0
    const diagnostics = createHostDiagnostics({ write: sink.write, clock: () => now, pendingMillis: 1_000 })
    vi.useFakeTimers()
    try {
      const settle = diagnostics.begin("chat_callback", { step: "commit", batch: 1 })
      now = 1_000
      vi.advanceTimersByTime(1_000)
      now = 2_000
      vi.advanceTimersByTime(1_000)
      expect(sink.phase("chat_callback", "pending").map((line) => line.pendingMillis)).toEqual([1_000, 2_000])
      now = 2_500
      settle({ status: 200 })
      vi.advanceTimersByTime(5_000)
      expect(sink.phase("chat_callback", "pending")).toHaveLength(2)
      expect(sink.phase("chat_callback", "end")[0]).toMatchObject({
        step: "commit",
        batch: 1,
        status: 200,
        elapsedMillis: 2_500
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test("past the detail limit only a slow or pending operation is recorded", () => {
    const sink = collector()
    let now = 0
    const diagnostics = createHostDiagnostics({
      write: sink.write,
      clock: () => now,
      detailLimit: 1,
      slowMillis: 100
    })
    diagnostics.begin("chat_callback", { batch: 1 })()
    const quiet = diagnostics.begin("chat_callback", { batch: 2 })
    now = 10
    quiet()
    const slow = diagnostics.begin("chat_callback", { batch: 3 })
    now = 500
    slow()
    expect(sink.lines.map((line) => [line.phase, line.batch])).toEqual([
      ["begin", 1],
      ["end", 1],
      ["end", 3]
    ])
  })

  test("stops at its own bound and says that it stopped", () => {
    const sink = collector()
    const diagnostics = createHostDiagnostics({ write: sink.write, clock: () => 0, limit: 3 })
    for (let index = 0; index < 10; index += 1) diagnostics.record("model_stream", "pending", { index })
    expect(sink.lines).toHaveLength(3)
    expect(sink.lines[2]).toEqual({
      diagnostic: HOST_DIAGNOSTIC_MARKER,
      event: "diagnostics",
      phase: "capped"
    })
  })

  test("writes to the guest's own standard error by default", () => {
    const written: Array<string> = []
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })
    try {
      createHostDiagnostics().record("model_stream", "first_event", { kind: "text-delta" })
    } finally {
      stderr.mockRestore()
    }
    expect(written).toHaveLength(1)
    const record = JSON.parse(String(written[0])) as Record<string, unknown>
    expect(record.diagnostic).toBe(HOST_DIAGNOSTIC_MARKER)
    expect(record.atMillis).toBeTypeOf("number")
    expect(record.turnId).toBeUndefined()
  })
})

const turn: StartAgentTurnRequest = {
  runId: "run",
  instructions: "answer",
  messages: [{ role: "user", content: "hi" }]
}

describe("stream consumption diagnostics", () => {
  test("counts what the host took off the provider stream", async () => {
    const sink = collector()
    const events: Array<ModelEvent.ModelEvent> = [
      { type: "text-delta", id: "a", text: "four" },
      { type: "thinking-delta", id: "a", text: "think" },
      { type: "settle", stopReason: "stop" }
    ]
    await Effect.runPromise(runModelTurn(
      Model.make({ stream: () => Stream.fromIterable(events) }),
      turn,
      { modelId: "model" },
      () => Effect.void,
      undefined,
      createHostDiagnostics({ write: sink.write })
    ))
    expect(sink.phase("model_stream", "first_event")[0]).toMatchObject({ kind: "text-delta" })
    expect(sink.phase("model_stream", "end")[0]).toMatchObject({ events: 3, characters: 9, settled: true })
  })

  // The production boundary this investigation could not read: the model proxy
  // completed its upstream response, and the guest consumed no event from it.
  // The record must show that while the turn is still stuck, naming zero
  // events, rather than leaving the turn silent until somebody cancels it.
  test("reports a provider stream the host consumed nothing from", async () => {
    const sink = collector()
    const fiber = Effect.runFork(runModelTurn(
      Model.make({ stream: () => Stream.never }),
      turn,
      { modelId: "model" },
      () => Effect.void,
      undefined,
      createHostDiagnostics({ write: sink.write, pendingMillis: 20 })
    ))
    const pending = await waitFor(() => sink.phase("model_stream", "pending"), 2)
    expect(sink.phase("model_stream", "first_event")).toHaveLength(0)
    expect(pending[0]?.pendingMillis).toBeTypeOf("number")
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(sink.phase("model_stream", "end")[0]).toMatchObject({ events: 0, characters: 0, settled: false })
  })
})

const cursor: AgentTurnCursor = { version: 1, runId: "run", legId: "leg", batch: 0, position: 0, hash: "a".repeat(64) }
const grant = {
  turnId: "turn",
  ownerId: 1,
  runId: "run",
  legId: "leg",
  generation: 3,
  token: "capability_capability_capability_1234",
  cursor,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  request: turn,
  producerBaseUrl: "http://host.test/"
}

describe("callback attempt diagnostics", () => {
  // A worker sees a CONNECT; only the guest knows whether it asked the journal
  // for anything. A commit the guest attempted and a tunnel somebody observed
  // are different facts, and the hung turn needs them told apart.
  test("records the commit this host attempted, by batch, before it settles", async () => {
    const sink = collector()
    const producer = new DurableChatProducer(
      "http://host.test/",
      grant,
      () => new Promise<Response>(() => {}),
      createHostDiagnostics({ turnId: grant.turnId, write: sink.write, pendingMillis: 20 })
    )
    const fiber = Effect.runFork(producer.write({ runId: "run", type: "delta", kind: "text", text: "hi" }))
    const begun = await waitFor(() => sink.phase("chat_callback", "begin"))
    expect(begun[0]).toMatchObject({ turnId: "turn", step: "commit", batch: 1 })
    const pending = await waitFor(() => sink.phase("chat_callback", "pending"))
    expect(pending[0]).toMatchObject({ step: "commit", batch: 1 })
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(sink.phase("chat_callback", "end")[0]).toMatchObject({ step: "commit", status: 0 })
  })

  test("records the provider start this host attempted and its answer", async () => {
    const sink = collector()
    const producer = new DurableChatProducer(
      "http://host.test/",
      grant,
      () => Promise.resolve(new Response(null, { status: 204 })),
      createHostDiagnostics({ turnId: grant.turnId, write: sink.write })
    )
    await Effect.runPromise(producer.providerStarted())
    expect(sink.phase("chat_callback", "begin")[0]).toMatchObject({ step: "provider_started" })
    expect(sink.phase("chat_callback", "end")[0]).toMatchObject({ step: "provider_started", status: 204 })
  })
})
