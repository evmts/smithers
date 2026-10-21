import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { afterEach, expect, test } from "vitest"
import { type ChangeRequest, StackClient } from "./api"

// The real stack client from the browser's side, against a local HTTP server that plays a gateway: real sockets, so a
// stalled body, a body cut short and nothing listening are what a browser would meet. Every answer ChatApi itself gives
// is tested through its real handler in todos.test.ts and worker/stack/Api.test.ts.

const change: ChangeRequest = { opId: crypto.randomUUID(), op: "drop", number: 3 }

const servers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of servers.splice(0)) await close()
})

/** A server that answers every request with `respond`, keeping what each asked for. */
const serve = async (respond: (request: IncomingMessage, response: ServerResponse) => void) => {
  const asked: Array<{ readonly method: string; readonly url: string; readonly body: string }> = []
  const server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => {
      asked.push({ method: request.method!, url: request.url!, body })
      respond(request, response)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  )
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, asked }
}

const send = (origin: string) =>
  Effect.runPromise(
    Effect.result(Effect.flatMap(StackClient, (client) => client.change("octo", "hello", change))).pipe(
      Effect.provide(StackClient.layer({ origin, within: "300 millis" })),
      Effect.provide(FetchHttpClient.layer),
    ),
  )

const json = (status: number, body: unknown) => (_: IncomingMessage, response: ServerResponse) => {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

test("posts the change to its repository's stack route and reads what ChatApi took", async () => {
  const taken = await serve(json(202, { txid: 41, opId: change.opId, outcome: "dropped", number: 3 }))
  const took = await send(taken.origin)
  expect(took._tag === "Success" && took.success).toEqual({ txid: 41, opId: change.opId, outcome: "dropped", number: 3 })
  expect(taken.asked).toEqual([{ method: "POST", url: "/api/repos/octo/hello/stack", body: JSON.stringify(change) }])
})

test("a refusal is not taken, with its status and the code its body names", async () => {
  const named = await serve(json(409, { code: "stack_full" }))
  expect(await send(named.origin)).toMatchObject({ _tag: "Failure", failure: { status: 409, code: "stack_full" } })
  const bare = await serve((_, response) => {
    response.writeHead(502, { "content-type": "text/html" })
    response.end("<html>bad gateway</html>")
  })
  const result = await send(bare.origin)
  expect(result).toMatchObject({ _tag: "Failure", failure: { status: 502 } })
  expect(result._tag === "Failure" && result.failure.code).toBe(undefined)
  const other = await serve(json(400, { reason: "x" }))
  const unnamed = await send(other.origin)
  expect(unnamed._tag === "Failure" && unnamed.failure.code).toBe(undefined)
})

test("a 202 whose body isn't the contract's is not taken, with its status", async () => {
  const { origin } = await serve(json(202, { txid: "41" }))
  expect(await send(origin)).toMatchObject({ _tag: "Failure", failure: { status: 202 } })
})

test("a body that stalls fails at the deadline with no status, as the network does", async () => {
  const { origin } = await serve((_, response) => {
    response.writeHead(202, { "content-type": "application/json" })
    response.write('{"txid":')
  })
  const result = await send(origin)
  expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "ChangeNotTaken" } })
  expect(result._tag === "Failure" && result.failure.status).toBe(undefined)
})

test("nothing listening fails at once with no status", async () => {
  const { origin } = await serve(() => {})
  await servers.splice(0)[0]!()
  const result = await send(origin)
  expect(result._tag === "Failure" && result.failure.status).toBe(undefined)
})
