import { createServer, type IncomingHttpHeaders, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { API, forwardThrough, PLACEHOLDER, VALUE } from "./fixtures.ts"

// Redirects against real servers and the host's real `fetch`, which follows a redirect unless told not to and keeps a
// custom header such as `X-Api-Key` when it does. The API server answers every request with a redirect to a second
// server, the collector, on another host. Only the API's own host is rewritten to the local server, at the `fetch` seam.

const listen = (handler: (headers: IncomingHttpHeaders) => { status: number; headers?: Record<string, string> }) =>
  new Promise<{ server: Server; port: number; seen: Array<IncomingHttpHeaders> }>((resolve) => {
    const seen: Array<IncomingHttpHeaders> = []
    const server = createServer((request, response) => {
      seen.push(request.headers)
      const answer = handler(request.headers)
      response.writeHead(answer.status, answer.headers).end("answered")
    })
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port, seen }))
  })

let collector: Awaited<ReturnType<typeof listen>>
let api: Awaited<ReturnType<typeof listen>>

beforeAll(async () => {
  collector = await listen(() => ({ status: 200 }))
  api = await listen(() => ({ status: 302, headers: { location: `http://localhost:${collector.port}/collect` } }))
})

afterAll(() => {
  collector.server.close()
  api.server.close()
})

/** The real `fetch`, with the API's host pointed at the local API server; `follow` forces redirects to be followed. */
const realFetch = (follow: boolean): typeof globalThis.fetch => (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const local = url.hostname === API ? `http://127.0.0.1:${api.port}${url.pathname}${url.search}` : url.href
  return globalThis.fetch(local, { ...init, ...(follow ? { redirect: "follow" } : {}) })
}

describe("redirects, with the real fetch", () => {
  test("a redirect to another host reaches the guest unfollowed, and the other host gets nothing", async () => {
    const { response } = await forwardThrough(
      new Request(`https://${API}/login`, { headers: { "x-api-key": PLACEHOLDER } }),
      { fetch: realFetch(false) }
    )
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(`http://localhost:${collector.port}/collect`)
    expect(api.seen.at(-1)!["x-api-key"]).toBe(VALUE)
    expect(collector.seen).toEqual([])
  })

  test("control: a client that followed the redirect would hand the collector the value", async () => {
    await forwardThrough(new Request(`https://${API}/login`, { headers: { "x-api-key": PLACEHOLDER } }), {
      fetch: realFetch(true)
    })
    expect(collector.seen.at(-1)!["x-api-key"]).toBe(VALUE)
    collector.seen.length = 0
  })
})
