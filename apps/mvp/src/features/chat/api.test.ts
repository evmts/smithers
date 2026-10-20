import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { type Duration, Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { afterEach, expect, test } from "vitest"
import { makeRuntime } from "../../lib/runtime"
import { postQuestion } from "./api"

// `POST /api/questions` from the browser's side, against a local HTTP server that plays ChatApi's network: real
// sockets, so a stalled body and an aborted request are what a browser would meet.

const question = { id: crypto.randomUUID(), answerId: crypto.randomUUID(), text: "hello" }

const servers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of servers.splice(0)) await close()
})

/** A server that answers every request with `respond`, and says when the client closed each connection. */
const serve = async (respond: (request: IncomingMessage, response: ServerResponse) => void) => {
  const closed: Array<Promise<void>> = []
  const server = createServer((request, response) => {
    closed.push(new Promise((resolve) => response.on("close", () => resolve())))
    respond(request, response)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  )
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/questions`, closed }
}

const post = async (url: string, within: Duration.Input = "300 millis") => {
  const runtime = makeRuntime(FetchHttpClient.layer)
  try {
    return await runtime.runPromise(Effect.result(postQuestion(url, question, within)))
  } finally {
    await runtime.dispose()
  }
}

test("202 headers and a body that stalls fail as unreachable at the deadline, and the request is aborted", async () => {
  const { url, closed } = await serve((_, response) => {
    response.writeHead(202, { "content-type": "application/json" })
    response.write('{"txid":')
  })
  const started = Date.now()
  const result = await post(url)
  expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "QuestionNotTaken", reason: "unreachable" } })
  expect(Date.now() - started).toBeLessThan(2_000)
  // The server sees the browser close the connection.
  await closed[0]
})

test("no answer at all fails as unreachable at the deadline, and the request is aborted", async () => {
  const { url, closed } = await serve(() => {})
  const result = await post(url)
  expect(result).toMatchObject({ _tag: "Failure", failure: { reason: "unreachable" } })
  await closed[0]
})

test("a whole answer inside the deadline is taken: 202 with its txid, or 200 for a question already there", async () => {
  const inserted = await serve((_, response) => {
    response.writeHead(202, { "content-type": "application/json" })
    response.end(JSON.stringify({ txid: 42 }))
  })
  expect(await post(inserted.url)).toMatchObject({ _tag: "Success", success: { _tag: "inserted", txid: 42 } })
  const existing = await serve((_, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ txid: null, existing: true }))
  })
  expect(await post(existing.url)).toMatchObject({ _tag: "Success", success: { _tag: "existing" } })
})

test("409 is refused with its status, and a 202 body outside the contract is an invalid response", async () => {
  const conflict = await serve((_, response) => {
    response.writeHead(409, { "content-type": "application/json" })
    response.end(JSON.stringify({ message: "id belongs to another message." }))
  })
  expect(await post(conflict.url)).toMatchObject({ _tag: "Failure", failure: { reason: "refused", status: 409 } })
  const invalid = await serve((_, response) => {
    response.writeHead(202, { "content-type": "application/json" })
    response.end(JSON.stringify({ txid: "soon" }))
  })
  expect(await post(invalid.url)).toMatchObject({ _tag: "Failure", failure: { reason: "invalid_response", status: 202 } })
})
