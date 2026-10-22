import { Data } from "effect"
import { createServer } from "node:http"
import { PassThrough } from "node:stream"
import { describe, expect, it } from "vitest"
import { Client } from "../src/internal/backend/Client.ts"
import * as Failure from "../src/internal/Failure.ts"

const protectedValue = "private-session-value-462605"
const clientOutput = () => {
  const stdout = Object.assign(new PassThrough(), { isTTY: false, columns: 80 }),
    stderr = Object.assign(new PassThrough(), { isTTY: false, columns: 80 })
  let out = "", err = ""
  stdout.on("data", (chunk) => out += chunk.toString())
  stderr.on("data", (chunk) => err += chunk.toString())
  const client = new Client({ stdout, stderr }, true)
  client.protect(protectedValue)
  return { client, out: () => out, err: () => err }
}

class EmptyFailure extends Data.TaggedError("/test/EmptyFailure")<{
  readonly message: string
  readonly code: string
  readonly resource: string
}> {}

describe("session-safe backend reporting", () => {
  it("redacts scalar fallback fields on a frozen designed error with no message", () => {
    const { client } = clientOutput()
    const error = Object.freeze(new EmptyFailure({ message: "", code: "missing", resource: protectedValue }))
    const reported = client.failure(error)
    expect(Failure.operatorReport(reported, false)).toContain("missing")
    expect(Failure.operatorLine(reported, true)).toContain("EmptyFailure")
    expect(Failure.operatorReport(reported, true)).not.toContain(protectedValue)
    expect(Failure.operatorLine(reported, true)).not.toContain(protectedValue)
    expect(error.resource).toBe(protectedValue)
  })

  it("redacts a scalar secret before the diagnostic field bound truncates it", () => {
    const { client } = clientOutput()
    const secret = "z".repeat(Failure.fieldValueLimit + 100)
    client.protect(secret)
    const error = new EmptyFailure({ message: "", code: "missing", resource: secret })
    expect(Failure.operatorReport(client.failure(error), false)).not.toContain("z".repeat(Failure.fieldValueLimit))
  })

  it("redacts an undesigned error's message, stack and nested causes under verbose reporting", () => {
    const { client } = clientOutput()
    const cause = new Error(`inner ${protectedValue}`)
    const error = new TypeError(`outer ${protectedValue}`, { cause })
    error.stack = `TypeError: outer ${protectedValue}\n    at ${protectedValue}:1:2`
    const reported = client.failure(error)
    expect(Failure.operatorReport(reported, false)).toBe(Failure.unknownSentence)
    for (const text of [Failure.operatorLine(reported, true), Failure.operatorReport(reported, true)]) {
      expect(text).toContain("TypeError")
      expect(text).toContain("inner")
      expect(text).not.toContain(protectedValue)
    }
    expect(error.message).toContain(protectedValue)
  })

  it("redacts a protected error display name without changing its generic classification", () => {
    const { client } = clientOutput()
    const error = new Error("A designed failure")
    error.name = protectedValue
    expect(Failure.operatorLine(client.failure(error), true)).not.toContain(protectedValue)
  })

  it("redacts protected values reconstructed by terminal normalization", () => {
    const f = clientOutput()
    const decorated = "private-session-\u001b[31mvalue-462605"
    const error = new Error(decorated)
    expect(Failure.operatorReport(f.client.failure(error), true)).not.toContain(protectedValue)
    const named = new Error("Designed")
    named.name = decorated
    expect(Failure.operatorLine(f.client.failure(named), true)).not.toContain(protectedValue)
    const tagged = new EmptyFailure({ message: "Designed", code: "test", resource: "safe" })
    Object.defineProperty(tagged, "_tag", { value: `/test/${decorated}` })
    expect(Failure.operatorLine(f.client.failure(tagged), true)).not.toContain(protectedValue)
    f.client.output(Buffer.from(`${decorated}\n${decorated}`), Buffer.from(`${decorated}\n${decorated}`))
    f.client.flushOutput()
    expect(f.out()).not.toContain(protectedValue)
    expect(f.err()).not.toContain(protectedValue)
  })

  it("redacts normalized thrown strings and decoded refusal records", () => {
    const { client } = clientOutput()
    const decorated = "private-session-\u001b[31mvalue-462605"
    for (const error of [decorated, { _tag: "/test/Decoded", message: decorated }]) {
      expect(Failure.operatorReport(client.failure(error), true)).not.toContain(protectedValue)
    }
  })

  it("makes complete and flushed live output inert on both terminal channels", () => {
    const f = clientOutput()
    const raw = `\u001b[2Jbad\u001b]0;title\u0007\ttext\u202e\r\n${protectedValue}`
    const bytes = Buffer.from(raw)
    const split = Math.floor(bytes.length / 2)
    f.client.output(bytes.subarray(0, split), bytes.subarray(0, split))
    f.client.output(bytes.subarray(split), bytes.subarray(split))
    f.client.flushOutput()
    for (const text of [f.out(), f.err()]) {
      expect(text).toBe(Failure.terminalSafeLines(text))
      expect(text).toContain("bad\ttext\n")
      expect(text).not.toContain(protectedValue)
    }
  })
})

it.each([
  { limit: "count", count: 10_001, data: "1" },
  { limit: "bytes", count: 100, data: JSON.stringify("x".repeat(65_536)) }
])("bounds retained event $limit and cancels the real HTTP stream", async ({ count, data }) => {
  let closed!: () => void
  const disconnected = new Promise<void>((resolve) => closed = resolve)
  const server = createServer((_request, response) => {
    response.on("close", closed)
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.write(`data: ${data}\n\n`.repeat(count))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const { port } = server.address() as { port: number }
    const stderr = Object.assign(new PassThrough(), { isTTY: false, columns: 80 })
    stderr.resume()
    const client = new Client({
      stderr,
      environment: {
        SMITHERS_API_ORIGIN: `http://127.0.0.1:${port}`,
        SMITHERS_TOKEN: "synthetic-test-token"
      }
    })
    const outcome = await client.events("/events").then(
      (events) => ({ code: "unbounded", retained: events.length }),
      (error: { code: string }) => ({ code: error.code })
    )
    expect(outcome.code).toBe("backend_protocol")
    await disconnected
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
