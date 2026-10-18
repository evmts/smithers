// GET /api/shapes/messages (`ShapeProxy` from @smthrs/effect-electric, mounted in worker/Chat.ts) through ChatApi's
// handler, against the compose Electric (`pnpm db:up`) replicating this file's own schema of the compose Postgres.
// ChatApi asks Electric for `messages`;
// the fetch it calls Electric with names this file's schema in `table`, the one place the schema shows.
import { Effect } from "effect"
import { beforeAll, describe, expect, test } from "vitest"
import * as TestDatabase from "../db/TestDatabase.ts"
import { LOCAL_ELECTRIC_URL } from "../src/features/chat/contract.ts"
import * as ChatMetrics from "./ChatMetrics.ts"
import { answers, eventually, harness, testFile } from "./test/harness.ts"

const runtime = testFile("shapes")

beforeAll(async () => {
  const health = `${LOCAL_ELECTRIC_URL}/v1/health`
  const response = await fetch(health).catch((error: unknown) => {
    throw TestDatabase.explain("Electric", new URL(health).host)(error)
  })
  if (!response.ok) throw new Error(`Electric answered ${response.status} to ${health}`)
})

/**
 * ChatApi's handler with Electric reached through this file's schema: `upstream` holds each URL ChatApi asked for, and
 * `hold` keeps Electric's responses back until the function it returns is called.
 */
const proxy = async (config: Record<string, string> = {}) => {
  const { name } = await runtime.runPromise(Effect.gen(function* () {
    return yield* TestDatabase.Scratch
  }))
  const upstream: Array<URL> = []
  let held: Promise<void> | undefined
  const h = await harness(runtime, answers("never"), {
    config,
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      upstream.push(new URL(url))
      if (url.searchParams.get("table") === "messages") url.searchParams.set("table", `${name}.messages`)
      if (held !== undefined) await held
      return fetch(url, init)
    },
  })
  return {
    ...h,
    upstream,
    hold: () => {
      let release = () => {}
      held = new Promise<void>((resolve) => (release = resolve))
      return () => {
        held = undefined
        release()
      }
    },
  }
}

describe("GET /api/shapes/messages", () => {
  test("passes Electric's response through, sending Electric's protocol parameters and table=messages", async () => {
    const h = await proxy()
    const response = await h.fetch(
      "/api/shapes/messages?offset=-1&table=users&where=true&columns=text&params%5B1%5D=x&secret=stolen&replica=full",
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("electric-handle")).toEqual(expect.any(String))
    expect(response.headers.get("electric-offset")).toEqual(expect.any(String))
    expect(response.headers.get("content-type")).toContain("application/json")
    for (const name of ["content-encoding", "content-length", "access-control-allow-origin"]) {
      expect(response.headers.get(name)).toBeNull()
    }
    const body = await response.text()
    expect(JSON.parse(body)).toEqual(expect.any(Array))
    const [sent] = h.upstream
    expect(`${sent!.origin}${sent!.pathname}`).toBe("http://localhost:30001/v1/shape")
    expect([...sent!.searchParams]).toEqual([["offset", "-1"], ["table", "messages"]])
    // One line per request, once its body has ended, with the bytes it sent.
    await eventually(() => h.line("chat.shape").length === 1)
    expect(h.only("chat.shape")).toMatchObject({
      level: "INFO",
      annotations: {
        status: 200,
        live: false,
        durationMs: expect.any(Number),
        bytes: new TextEncoder().encode(body).byteLength,
        outcome: "complete",
      },
    })
    expect(h.count(ChatMetrics.shapes, { status: "200", live: "false" })).toBe(1)
  })

  test("a request the browser abandons while Electric holds it records one line, aborted", async () => {
    const h = await proxy()
    const release = h.hold()
    const abort = new AbortController()
    const pending = h.fetch("/api/shapes/messages?offset=-1&live=true", { signal: abort.signal }).catch(() => null)
    await eventually(() => h.upstream.length === 1)
    abort.abort()
    // Effect's HttpClient sees the abort once Electric's fetch settles: 499 if before its response, else mid-body.
    release()
    await pending
    await eventually(() => h.line("chat.shape").length === 1)
    expect(h.only("chat.shape")).toMatchObject({
      level: "INFO",
      annotations: { live: true, bytes: 0, durationMs: expect.any(Number), outcome: "aborted" },
    })
  })

  test("forwards every Electric protocol parameter it gets, and drops a subset request's", async () => {
    const h = await proxy()
    await h.fetch(
      "/api/shapes/messages?offset=0_0&handle=h-1&live=true&cursor=7&live_sse=false&log=full&expired_handle=h-0" +
        "&subset__limit=50&subset__order_by=%22position%22%20DESC&subset__where=%22position%22%20%3C%20%241" +
        "&subset__params=%7B%221%22%3A%2210%22%7D&subset__offset=5",
    )
    expect(Object.fromEntries(h.upstream[0]!.searchParams)).toEqual({
      offset: "0_0",
      handle: "h-1",
      live: "true",
      cursor: "7",
      live_sse: "false",
      log: "full",
      expired_handle: "h-0",
      table: "messages",
    })
  })

  test("adds ELECTRIC_SECRET as secret and ELECTRIC_SOURCE_ID as source_id, and never records the secret", async () => {
    const secret = "electric-secret-4b2d"
    const h = await proxy({ ELECTRIC_SECRET: secret, ELECTRIC_SOURCE_ID: "source-1" })
    await h.fetch("/api/shapes/messages?offset=-1&source_id=browser-choice")
    expect(h.upstream[0]!.searchParams.get("secret")).toBe(secret)
    expect(h.upstream[0]!.searchParams.getAll("source_id")).toEqual(["source-1"])
    await eventually(() => h.line("chat.shape").length === 1)
    expect(JSON.stringify(h.logs)).not.toContain(secret)
    for (const span of h.spans) expect(JSON.stringify([...span.attributes])).not.toContain(secret)
  })

  test("502 when Electric can't be reached", async () => {
    const h = await proxy({ ELECTRIC_URL: "http://127.0.0.1:9" })
    const response = await h.fetch("/api/shapes/messages?offset=-1")
    expect(response.status).toBe(502)
    expect(h.only("chat.shape")).toMatchObject({
      level: "ERROR",
      annotations: { status: 502, live: false, bytes: 0, durationMs: expect.any(Number), outcome: "complete" },
    })
  })

  test("405 for another method", async () => {
    const h = await proxy()
    const response = await h.fetch("/api/shapes/messages?offset=-1", { method: "POST" })
    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("GET")
    expect(h.upstream).toHaveLength(0)
    expect(h.only("chat.shape")).toMatchObject({ level: "WARN", annotations: { status: 405, bytes: 0 } })
  })
})
