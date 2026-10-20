import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { afterEach, expect, test } from "vitest"
import { postQuestion } from "./api"

// The real ChatApi client from the browser's side, against a local HTTP server that plays a gateway: real sockets, so
// a stalled body, a body cut short and an aborted request are what a browser would meet. Every answer ChatApi itself
// gives is tested through its real handler in chat.test.ts.

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

const post = (url: string) =>
  Effect.runPromise(Effect.result(postQuestion(url, question, "300 millis")).pipe(Effect.provide(FetchHttpClient.layer)))

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

test("a 202 whose body a gateway cuts short is an invalid response", async () => {
  const { url } = await serve((_, response) => {
    response.writeHead(202, { "content-type": "application/json" })
    response.end('{"txid":')
  })
  expect(await post(url)).toMatchObject({ _tag: "Failure", failure: { reason: "invalid_response", status: 202 } })
})

test("nothing listening is unreachable at once", async () => {
  const { url } = await serve(() => {})
  await servers.splice(0)[0]!()
  expect(await post(url)).toMatchObject({ _tag: "Failure", failure: { reason: "unreachable" } })
})
