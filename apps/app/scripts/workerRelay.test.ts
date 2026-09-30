import { expect, test } from "bun:test"
import { relayRpc, writeResponse } from "./workerRelay"
import { createServer } from "node:http"

const request = (body: unknown) => new Request("http://relay.test/api/workflow/rpc", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) })
const valid = { repo: "ada/repo", procedure: "List", payload: { _tag: "flows" }, workspaceId: "5b0c4f7e-2d1a-4c3b-9e8f-1a2b3c4d5e6f" }
const { workspaceId: _box, ...boxless } = valid
const fixture = () => {
  const seen: { authorization: string | null; body: string; path: string; cookie: string | null }[] = []
  const server = Bun.serve({ port: 0, async fetch(req) {
    seen.push({ authorization: req.headers.get("authorization"), body: await req.text(), path: new URL(req.url).pathname, cookie: req.headers.get("cookie") })
    return new Response(JSON.stringify({ _tag: "Exit", requestId: "0", exit: { _tag: "Success", value: ["flow"] } }) + "\n")
  } })
  return { seen, server, url: `http://localhost:${server.port}` }
}

test.each([
  [{ ...valid, procedure: "constructor" }, "procedure_not_relayed"],
  [{ ...valid, procedure: "absent" }, "procedure_not_relayed"],
  [{ ...valid, repo: "bad" }, "request_invalid"],
  [{ ...valid, workspaceId: "bad" }, "request_invalid"],
  [boxless, "request_invalid"],
  ["{not json", "request_body_not_json"]
] as const)("the harness uses the relay refusal for %j", async (body, code) => {
  const f = fixture()
  try {
    const response = await relayRpc(request(body), f.url, "fixture-credential")
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ status: "error", code })
    expect(f.seen).toHaveLength(0)
  } finally { f.server.stop(true) }
})

test("an admitted call crosses the real HTTP seam with its credential and gateway frame", async () => {
  const f = fixture(), forwarded: string[] = []
  try {
    const response = await relayRpc(request(valid), f.url, "fixture-credential", name => forwarded.push(name))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, payload: ["flow"] })
    expect(forwarded).toEqual(["List"])
    expect(f.seen).toHaveLength(1)
    expect(f.seen[0]!.authorization).toBe("Bearer fixture-credential")
    expect(f.seen[0]!.cookie).toBeNull()
    expect(f.seen[0]!.path).toBe("/rpc")
    expect(JSON.parse(f.seen[0]!.body)).toEqual({ _tag: "Request", id: 1, tag: "List", payload: valid.payload, headers: [] })
  } finally { f.server.stop(true) }
})

test("an unframed upstream refusal keeps the relay envelope", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response("private upstream debug", { status: 503 }) })
  try {
    const response = await relayRpc(request(valid), `http://localhost:${server.port}`, "fixture-credential")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: false, error: { message: "The workspace answered HTTP 503." } })
  } finally { server.stop(true) }
})

test("the harness enforces the relay's request and upstream body limits", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response("x".repeat(4 * 1024 * 1024 + 1)) })
  try {
    const base = `http://localhost:${server.port}`
    const requestRefusal = await relayRpc(request({ ...valid, payload: "x".repeat(1024 * 1024) }), base, "fixture-credential")
    expect(requestRefusal.status).toBe(413)
    expect(await requestRefusal.json()).toMatchObject({ code: "request_body_too_large" })
    const response = await relayRpc(request(valid), base, "fixture-credential")
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ code: "upstream_malformed" })
  } finally { server.stop(true) }
})


test("a redirect never sends the fixture bearer or request to its destination", async () => {
  let targetCalls = 0
  const target = Bun.serve({ port: 0, fetch: () => { targetCalls++; return new Response("private redirect output") } })
  const redirect = Bun.serve({ port: 0, fetch: () => Response.redirect(`http://localhost:${target.port}`, 302) })
  try {
    const response = await relayRpc(request(valid), `http://localhost:${redirect.port}`, "fixture-credential")
    expect(await response.json()).toEqual({ ok: false, error: { message: "The workspace answered HTTP 302." } })
    expect(targetCalls).toBe(0)
  } finally { redirect.stop(true); target.stop(true) }
})

test("an already-cancelled caller never starts an upstream request", async () => {
  const f = fixture()
  const controller = new AbortController()
  controller.abort(new Error("private cancellation cause"))
  try {
    const incoming = new Request(request(valid), { signal: controller.signal })
    const response = await relayRpc(incoming, f.url, "fixture-credential")
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ status: "error", code: "upstream_unreachable", message: "The workspace could not be reached." })
    expect(f.seen).toEqual([])
  } finally { f.server.stop(true) }
})

test("the headers deadline aborts unresolved upstream work and returns a safe timeout", async () => {
  let calls = 0
  const server = Bun.serve({ port: 0, fetch: () => { calls++; return new Promise<Response>(() => {}) } })
  try {
    const response = await relayRpc(request(valid), `http://localhost:${server.port}`, "fixture-credential", undefined, 50)
    expect(calls).toBe(1)
    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({ status: "error", code: "upstream_timeout", message: "The workspace could not be reached." })
  } finally { server.stop(true) }
})

test("chunked multibyte input is bounded by actual bytes before any upstream call", async () => {
  const f = fixture()
  const bytes = new TextEncoder().encode(JSON.stringify({ ...valid, payload: "é".repeat(600_000) }))
  const incoming = new Request("http://relay.test/api/workflow/rpc", { method: "POST", body: new ReadableStream({ start(controller) {
    controller.enqueue(bytes.subarray(0, 700_000))
    controller.enqueue(bytes.subarray(700_000))
    controller.close()
  } }) })
  try {
    const response = await relayRpc(incoming, f.url, "fixture-credential")
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: "request_body_too_large" })
    expect(f.seen).toEqual([])
  } finally { f.server.stop(true) }
})


test("a response stream that breaks keeps upstream diagnostics out of the refusal", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response(new ReadableStream({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode('{"private":"upstream diagnostic"}'))
      await Promise.resolve()
      controller.error(new Error("private broken-stream cause"))
    }
  })) })
  try {
    const response = await relayRpc(request(valid), `http://localhost:${server.port}`, "fixture-credential")
    expect(response.status).toBe(502)
    const body = await response.text()
    expect(body).not.toContain("private")
    expect(JSON.parse(body)).toMatchObject({ code: "upstream_unreachable" })
  } finally { server.stop(true) }
})

test("the Node relay writer preserves status, headers and actual response bytes", async () => {
  const bytes = new Uint8Array([0, 255, 7, 128])
  const server = createServer((_request, outgoing) => {
    void writeResponse(new Response(bytes, { status: 201, headers: { "x-fixture-receipt": "owned" } }), outgoing)
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Missing owned relay address")
    const response = await fetch(`http://127.0.0.1:${address.port}`)
    expect(response.status).toBe(201)
    expect(response.headers.get("x-fixture-receipt")).toBe("owned")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})

test("a request stream failure is refused before gateway delivery", async () => {
  const f = fixture()
  const incoming = new Request("http://relay.test/api/workflow/rpc", { method: "POST", body: new ReadableStream({ start(controller) {
    controller.error(new Error("private request body failure"))
  } }) })
  try {
    const response = await relayRpc(incoming, f.url, "fixture-credential")
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ status: "error", code: "request_body_unreadable", message: "The relay could not read that request." })
    expect(f.seen).toEqual([])
  } finally { f.server.stop(true) }
})

test("a gateway connection cut after headers returns a safe incomplete-answer refusal", async () => {
  const server = createServer((_request, outgoing) => {
    outgoing.writeHead(200, { "content-type": "application/x-ndjson" })
    outgoing.write('not a complete gateway frame\n')
    // Inject failure after flushed headers; this is transport fault timing, not a readiness wait.
    setTimeout(() => outgoing.destroy(), 20)
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Missing owned gateway address")
    const response = await relayRpc(request(valid), `http://127.0.0.1:${address.port}`, "fixture-credential")
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ status: "error", code: "upstream_unreachable", message: "The workspace answer broke off before it ended." })
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})
