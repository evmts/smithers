import assert from "node:assert/strict"
import { createServer, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { test } from "node:test"
import { Context, Effect } from "effect"
import { Follower, type FollowerHttp } from "./chatapi.ts"

const response = (status: number, messages: unknown[], offset = "1_0") => new Response(JSON.stringify(messages), {
  status, headers: { "electric-handle": "h1", "electric-offset": offset },
})

test("follower startup has a request deadline even when HTTP never answers", { timeout: 1000 }, async () => {
  const http: FollowerHttp["Service"] = { request: () => Effect.never }
  const follower = new Follower("http://fault.invalid", { http, timeoutMs: 20 })
  try {
    await assert.rejects(follower.start())
  } finally {
    await follower.stop()
  }
})

test("follower refetch applies recovery messages before adopting its validated cursor", async () => {
  let calls = 0
  const http: FollowerHttp["Service"] = { request: () => Effect.suspend(() => {
    calls++
    if (calls === 1) return Effect.succeed(response(200, []))
    if (calls === 2) return Effect.succeed(response(409, []))
    if (calls === 3) return Effect.succeed(response(200, [{ key: "answer", value: { id: "answer", text: "recovered", status: "done" }, headers: { operation: "insert" } }], "2_0"))
    return Effect.never
  }) }
  const follower = new Follower("http://fault.invalid", { http })
  try {
    await follower.start()
    const answer = await follower.until(() => follower.rows.get("answer"), 150, "recovery row")
    assert.equal(answer.text, "recovered")
    assert.ok(follower.timelines.get("answer")!.settledAt > 0)
    assert.equal(follower.refetches, 1)
  } finally {
    await follower.stop()
  }
})

test("follower refuses an invalid recovery response instead of polling with undefined cursors", async () => {
  let calls = 0
  const http: FollowerHttp["Service"] = { request: () => Effect.suspend(() => {
    calls++
    if (calls === 1) return Effect.succeed(response(200, []))
    if (calls === 2) return Effect.succeed(response(409, []))
    if (calls === 3) return Effect.succeed(new Response("[]", { status: 502 }))
    return Effect.never
  }) }
  const follower = new Follower("http://fault.invalid", { http })
  try {
    await follower.start()
    await assert.rejects(follower.until(() => undefined, 150, "nothing"), /502|cursor/)
    assert.equal(calls, 3)
  } finally {
    await follower.stop()
  }
})

test("follower request failure terminates observation rather than retrying in a timer loop", async () => {
  let calls = 0
  const http: FollowerHttp["Service"] = { request: () => Effect.suspend(() => {
    calls++
    return calls === 1 ? Effect.succeed(response(200, [])) : Effect.fail(new Error("injected transport failure"))
  }) }
  const follower = new Follower("http://fault.invalid", { http })
  try {
    await follower.start()
    await assert.rejects(follower.until(() => undefined, 150, "nothing"), /injected transport failure/)
    assert.equal(calls, 2)
    assert.equal(follower.errors, 1)
  } finally {
    await follower.stop()
  }
})

test("follower accepts a bodyless 204 long poll and continues from the last cursor", async () => {
  let calls = 0
  const http: FollowerHttp["Service"] = { request: () => Effect.suspend(() => {
    calls++
    if (calls === 1) return Effect.succeed(response(200, []))
    if (calls === 2) return Effect.succeed(new Response(null, { status: 204 }))
    if (calls === 3) return Effect.succeed(response(200, [{ key: "a", value: { id: "a", status: "done" }, headers: { operation: "insert" } }]))
    return Effect.never
  }) }
  const follower = new Follower("http://fault.invalid", { http })
  try {
    await follower.start()
    assert.equal((await follower.until(() => follower.rows.get("a"), 150, "post-204 row")).status, "done")
  } finally {
    await follower.stop()
  }
})

test("startup deadline aborts the real HTTP body after headers arrive", { timeout: 2000 }, async () => {
  let closed!: () => void
  const disconnected = new Promise<void>((resolve) => { closed = resolve })
  class HttpFault extends Context.Service<HttpFault, { readonly respond: (response: ServerResponse) => Effect.Effect<void> }>()("bench-test/HttpFault") {}
  const stalled = { respond: (response: ServerResponse) => Effect.sync(() => {
    response.writeHead(200, { "content-type": "application/json", "electric-handle": "h1", "electric-offset": "1_0" })
    response.flushHeaders()
    response.write("[")
    response.once("close", closed)
  }) }
  const server = createServer((_request, response) => {
    // The real HTTP server boundary, with its stalled-body failure injected as an Effect service.
    Effect.runSync(Effect.flatMap(Effect.service(HttpFault), (service) => service.respond(response)).pipe(Effect.provideService(HttpFault, stalled)))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const follower = new Follower(endpoint, { timeoutMs: 200 })
  try {
    await assert.rejects(follower.start())
    await disconnected
  } finally {
    await follower.stop()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
