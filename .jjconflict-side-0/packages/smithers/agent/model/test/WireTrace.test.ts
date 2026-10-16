/**
 * The opt-in wire trace: what one prepared request reports, the common input
 * prefix it measures against the previous request on the same key, and the
 * environment switch that turns it on.
 */
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import * as WireTrace from "../src/internal/WireTrace.ts"

const prepared = (body: Record<string, unknown>, key?: string) => ({
  routeId: "openai-chatgpt",
  protocolId: "openai-responses-chatgpt",
  publicHeaders: key === undefined ? {} : { "session-id": key },
  bodyText: JSON.stringify({ ...body, ...(key === undefined ? {} : { prompt_cache_key: key }) })
})

const user = (text: string) => ({ role: "user", content: [{ type: "input_text", text }] })

describe("WireTrace.line", () => {
  it("reports the cache identity and the input prefix shared with the previous request", () => {
    const history = new Map<string, ReadonlyArray<string>>()
    const first = WireTrace.line(
      prepared({ instructions: "teach", input: [user("begin"), user("panel 0")] }, "k"),
      history
    )
    const second = WireTrace.line(
      prepared({
        instructions: "teach",
        input: [user("begin"), { type: "reasoning", encrypted_content: "secret-state" }, user("panel 1")]
      }, "k"),
      history
    )
    expect(first).toMatchObject({ cacheKey: "k", sessionIdHeader: "k", affinity: false, commonPrefixItems: 0 })
    expect(WireTrace.line({ ...prepared({}, "other"), affinity: true }, history)).toMatchObject({ affinity: true })
    expect(second).toMatchObject({ commonPrefixItems: 1, previousItems: 2, kinds: ["user", "reasoning", "user"] })
    expect(JSON.stringify(second)).not.toContain("secret-state")
  })

  it("reads a Chat Completions body's messages and keys a request with no cache key by its route", () => {
    const history = new Map<string, ReadonlyArray<string>>()
    WireTrace.line(prepared({ messages: [user("a")] }), history)
    const line = WireTrace.line(prepared({ messages: [user("a"), null] }), history)
    expect(line).toMatchObject({
      cacheKey: null,
      sessionIdHeader: null,
      instructions: null,
      kinds: ["user", "undefined"],
      commonPrefixItems: 1
    })
    expect(WireTrace.line(prepared({}), history)).toMatchObject({ items: [], commonPrefixItems: 0 })
  })
})

describe("WireTrace.record", () => {
  it("appends one request line to the file SMITHERS_WIRE_TRACE names, and numbers the call", () => {
    const file = join(mkdtempSync(join(tmpdir(), "wire-trace-")), "trace.jsonl")
    const node = { env: { SMITHERS_WIRE_TRACE: file }, getBuiltinModule: process.getBuiltinModule } as never
    const first = WireTrace.record(prepared({ input: [user("a")] }, "record-k"), node)
    const second = WireTrace.record(prepared({ input: [user("a"), user("b")] }, "record-k"), node)
    const lines = readFileSync(file, "utf8").trim().split("\n").map((text) => JSON.parse(text))
    expect(lines.map((line) => line.commonPrefixItems)).toEqual([0, 1])
    expect(lines.map((line) => line.kind)).toEqual(["request", "request"])
    // The number is what pairs a call's request line with its response line.
    expect(lines.map((line) => line.call)).toEqual([first, second])
    expect(second).toBe(first! + 1)
  })

  it("records nothing when the variable is unset or empty, or when there is no process", () => {
    let writes = 0
    const counting = { appendFileSync: () => void writes++ }
    expect(WireTrace.record(prepared({}), { env: {}, getBuiltinModule: () => counting })).toBeUndefined()
    WireTrace.record(prepared({}), { env: { SMITHERS_WIRE_TRACE: "" }, getBuiltinModule: () => counting })
    WireTrace.record(prepared({}), undefined)
    expect(writes).toBe(0)
    expect(() => WireTrace.record(prepared({}))).not.toThrow()
  })

  it("never fails the call when the trace file cannot be written", () => {
    const failing = {
      appendFileSync: () => {
        throw new Error("read-only")
      }
    }
    expect(() =>
      WireTrace.record(prepared({}), { env: { SMITHERS_WIRE_TRACE: "/x" }, getBuiltinModule: () => failing })
    )
      .not.toThrow()
  })
})

const answered = (fields: Partial<WireTrace.Answered> = {}): WireTrace.Answered => ({
  routeId: "openai-chatgpt",
  protocolId: "openai-responses-chatgpt",
  outcome: "settled",
  timing: { startedAt: 1_000, attempts: 1, headersMs: 900, firstOutputMs: 7_400 },
  usage: { inputTokens: 12, outputTokens: 3 },
  ...fields
})

describe("WireTrace.responseLine", () => {
  it("reports how the call ended, its status, timing, usage, id and tier", () => {
    const line = WireTrace.responseLine(
      4,
      answered({
        stopReason: "tool-calls",
        status: 200,
        responseId: "resp_1",
        servedTier: "priority",
        headers: {
          "x-request-id": "req_1",
          "openai-processing-ms": "812",
          "cf-ray": "ray-1",
          authorization: "Bearer echoed-by-a-broken-proxy",
          "set-cookie": "session=opaque",
          "x-codex-turn-state": "routing-token"
        }
      }),
      9_400
    )

    expect(line).toEqual({
      at: "1970-01-01T00:00:09.400Z",
      kind: "response",
      call: 4,
      routeId: "openai-chatgpt",
      protocolId: "openai-responses-chatgpt",
      outcome: "settled",
      stopReason: "tool-calls",
      status: 200,
      responseId: "resp_1",
      servedTier: "priority",
      timing: { startedAt: 1_000, attempts: 1, headersMs: 900, firstOutputMs: 7_400 },
      usage: { inputTokens: 12, outputTokens: 3 },
      // Copied by name from a fixed list: nothing else in the response is read.
      headers: { "x-request-id": "req_1", "cf-ray": "ray-1", "openai-processing-ms": "812" }
    })
    expect(JSON.stringify(line)).not.toContain("echoed-by-a-broken-proxy")
    expect(JSON.stringify(line)).not.toContain("routing-token")
  })

  it("states what a call that never answered lacks as null, not as a guess", () => {
    expect(WireTrace.responseLine(1, answered({ outcome: "transport" }), 0)).toMatchObject({
      outcome: "transport",
      stopReason: null,
      status: null,
      responseId: null,
      servedTier: null,
      headers: {}
    })
  })
})

describe("WireTrace.recordResponse", () => {
  it("appends the response line after the call's request line", () => {
    const file = join(mkdtempSync(join(tmpdir(), "wire-trace-")), "trace.jsonl")
    const node = { env: { SMITHERS_WIRE_TRACE: file }, getBuiltinModule: process.getBuiltinModule } as never
    const call = WireTrace.record(prepared({ input: [user("a")] }, "response-k"), node)
    WireTrace.recordResponse(call, () => answered({ status: 200 }), 9_400, node)
    const lines = readFileSync(file, "utf8").trim().split("\n").map((text) => JSON.parse(text))
    expect(lines.map((line) => [line.kind, line.call])).toEqual([["request", call], ["response", call]])
  })

  it("records nothing, and reads nothing, for a call that was not traced", () => {
    let writes = 0
    let read = 0
    const counting = { appendFileSync: () => void writes++ }
    const reading = () => {
      read++
      return answered()
    }
    WireTrace.recordResponse(undefined, reading, 0, {
      env: { SMITHERS_WIRE_TRACE: "/x" },
      getBuiltinModule: () => counting
    })
    WireTrace.recordResponse(1, reading, 0, { env: {}, getBuiltinModule: () => counting })
    WireTrace.recordResponse(1, reading, 0, undefined)
    expect([writes, read]).toEqual([0, 0])
    expect(() => WireTrace.recordResponse(1, reading, 0)).not.toThrow()
  })

  it("never fails the call when the trace file cannot be written", () => {
    const failing = {
      appendFileSync: () => {
        throw new Error("read-only")
      }
    }
    expect(() =>
      WireTrace.recordResponse(1, answered, 0, { env: { SMITHERS_WIRE_TRACE: "/x" }, getBuiltinModule: () => failing })
    ).not.toThrow()
  })
})
