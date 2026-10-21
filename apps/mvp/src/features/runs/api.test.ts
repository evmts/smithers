import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { afterEach, expect, test } from "vitest"
import { RemoteRunsClient } from "./api"
import type { Inspection } from "./schema"

// The real remote runs client from the browser's side, against a local HTTP server that plays a gateway: real sockets,
// so a stalled body, a body cut short and nothing listening are what a browser would meet. Every answer ChatApi itself
// gives is tested through its real handler in remote.test.ts and worker/RemoteRuns.test.ts.

const RUN = "todo:6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f"

const value = (text: string) => ({ text, bytes: text.length, clipped: false })

const READ: Inspection = {
  run: {
    runId: RUN,
    flowName: "todo",
    status: "running",
    createdAtMs: 1,
    startedAtMs: 2,
    finishedAtMs: null,
    parentRunId: null,
    cancelRequestedAtMs: null,
    waiting: null,
    lastSeq: 0,
    input: value("{}"),
    result: null,
  },
  steps: [],
  children: [],
  journal: {
    events: [{ seq: 0, eventType: "flows.engine.plan-recorded", emittedAtMs: 3, payload: value("{}") }],
    afterSeq: -1,
    nextSeq: 0,
    hasMore: false,
  },
}

const servers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of servers.splice(0)) await close()
})

/** A server that answers every request with `respond`, keeping what each asked for. */
const serve = async (respond: (request: IncomingMessage, response: ServerResponse) => void) => {
  const asked: Array<string> = []
  const server = createServer((request, response) => {
    asked.push(`${request.method} ${request.url}`)
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
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, asked }
}

const read = (origin: string, options?: { readonly afterSeq?: number; readonly limit?: number }) =>
  Effect.runPromise(
    Effect.result(Effect.flatMap(RemoteRunsClient, (client) => client.inspect(RUN, options))).pipe(
      Effect.provide(RemoteRunsClient.layer({ origin, within: "300 millis" })),
      Effect.provide(FetchHttpClient.layer),
    ),
  )

const json = (status: number, body: unknown) => (_: IncomingMessage, response: ServerResponse) => {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

test("reads the run from its route, a page at a time, and decodes it as the engine's own read", async () => {
  const server = await serve(json(200, READ))
  const answered = await read(server.origin)
  expect(answered._tag === "Success" && answered.success).toEqual(READ)
  await read(server.origin, { afterSeq: 4, limit: 2 })
  await read(server.origin, { limit: 500 })
  expect(server.asked).toEqual([
    `GET /api/remote-runs/${encodeURIComponent(RUN)}`,
    `GET /api/remote-runs/${encodeURIComponent(RUN)}?afterSeq=4&limit=2`,
    `GET /api/remote-runs/${encodeURIComponent(RUN)}?limit=500`,
  ])
})

test("a refusal fails with its status and the code its body names", async () => {
  const named = await serve(json(404, { code: "not_started" }))
  expect(await read(named.origin)).toMatchObject({ _tag: "Failure", failure: { status: 404, code: "not_started" } })
  const bare = await serve((_, response) => {
    response.writeHead(502, { "content-type": "text/html" })
    response.end("<html>bad gateway</html>")
  })
  const result = await read(bare.origin)
  expect(result).toMatchObject({ _tag: "Failure", failure: { status: 502 } })
  expect(result._tag === "Failure" && result.failure.code).toBe(undefined)
})

test("a 200 whose body isn't a run fails with its status", async () => {
  const { origin } = await serve(json(200, { run: { runId: RUN } }))
  const result = await read(origin)
  expect(result).toMatchObject({ _tag: "Failure", failure: { status: 200 } })
  expect(result._tag === "Failure" && result.failure.code).toBe(undefined)
})

test("a body that stalls fails at the deadline with no status, as the network does", async () => {
  const { origin } = await serve((_, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    response.write('{"run":')
  })
  const result = await read(origin)
  expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "RemoteReadFailed" } })
  expect(result._tag === "Failure" && result.failure.status).toBe(undefined)
})

test("nothing listening fails at once with no status", async () => {
  const { origin } = await serve(() => {})
  await servers.splice(0)[0]!()
  const result = await read(origin)
  expect(result._tag === "Failure" && result.failure.status).toBe(undefined)
})
