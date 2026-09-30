import { afterEach, describe, expect, test } from "bun:test"
import edge from "smithers-server/edge"
import { CLIENT_ERRORS_PATH, CLIENT_ERROR_REPORT_LIMIT, createClientErrorReporter } from "./ClientErrors"

// The edge is a transparent transport. The backend owns storage, admission and
// metric labels; its real route/middleware contracts live in packages/backend.
const servers: Array<ReturnType<typeof Bun.serve>> = []
afterEach(async () => { for (const server of servers.splice(0)) await server.stop(true) })
const fixture = (handler: (request: Request) => Response | Promise<Response> = () => new Response(null, { status: 204 })) => {
  const requests: Request[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async request => {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text()
    const received = new Request(request.url, { method: request.method, headers: request.headers, body })
    requests.push(received.clone())
    return handler(received)
  } })
  servers.push(server)
  const call = (request: Request) => edge.fetch(request, {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) }, SMITHERS_BACKEND_ORIGIN: server.url.origin
  })
  const accepted: Promise<Response>[] = []
  const reporter = createClientErrorReporter({
    pathname: () => "/private/repository", now: () => new Date("2026-09-21T12:00:00Z"),
    fetchImpl: (input, init) => {
      const pending = call(new Request(new URL(input, "https://app.test"), init))
      accepted.push(pending)
      return pending
    }
  })
  return { call, requests, accepted, reporter }
}

describe("browser reporter → transparent edge → backend HTTP boundary", () => {
  test("reports both failure kinds with bounded diagnostics and no invented service credential", async () => {
    const f = fixture()
    f.reporter.report("error", new TypeError("private stack content"))
    f.reporter.report("unhandledrejection", "private rejection content")
    expect(f.reporter.reported()).toBe(2)
    expect((await Promise.all(f.accepted)).map(response => response.status)).toEqual([204, 204])
    expect(f.requests).toHaveLength(2)
    const reports = await Promise.all(f.requests.map(request => request.json()))
    expect(reports).toMatchObject([
      { client: "web", kind: "error", error: { type: "TypeError", message: "private stack content" }, context: { url: "/private/repository" } },
      { client: "web", kind: "unhandledrejection", error: { message: "private rejection content" } }
    ])
    for (const request of f.requests) {
      expect(new URL(request.url).pathname).toBe(CLIENT_ERRORS_PATH)
      expect(request.method).toBe("POST")
      expect(request.headers.get("authorization")).toBeNull()
      expect(request.headers.get("x-smithers-service-token")).toBeNull()
    }
  })

  test("reporting returns while the backend is unresolved and unrelated HTTP remains usable", async () => {
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    let started!: () => void
    const received = new Promise<void>(resolve => { started = resolve })
    const f = fixture(async request => {
      if (new URL(request.url).pathname !== CLIENT_ERRORS_PATH) return new Response(null, { status: 404 })
      started(); await held; return new Response(null, { status: 204 })
    })
    expect(f.reporter.report("error", new Error("held"))).toBeUndefined()
    await received
    let completed = false
    const finish = f.accepted[0]!.then(response => { completed = true; return response })
    expect(completed).toBe(false)
    expect((await f.call(new Request("https://app.test/api/not-a-route"))).status).toBe(404)
    release()
    expect((await finish).status).toBe(204)
  })

  test("the reporter caps each kind independently before transport", async () => {
    const f = fixture()
    for (const kind of ["error", "unhandledrejection", "operational"] as const) {
      for (let index = 0; index <= CLIENT_ERROR_REPORT_LIMIT; index++) f.reporter.report(kind, new Error("bounded"))
    }
    await Promise.all(f.accepted)
    expect(f.requests).toHaveLength(3 * CLIENT_ERROR_REPORT_LIMIT)
    expect(f.reporter.reported()).toBe(3 * CLIENT_ERROR_REPORT_LIMIT)
  })

  test("backend admission refusals pass through without an edge storage or export implementation", async () => {
    for (const status of [400, 403, 413, 429, 500]) {
      const f = fixture(() => Response.json({ code: "fixture_refusal" }, { status }))
      const response = await f.call(new Request(`https://app.test${CLIENT_ERRORS_PATH}`, { method: "POST", body: "{}" }))
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ code: "fixture_refusal" })
      expect(f.requests).toHaveLength(1)
    }
  })

  test("session and CSRF stay end-to-end while forged authority is stripped", async () => {
    const f = fixture()
    await f.call(new Request(`https://app.test${CLIENT_ERRORS_PATH}`, { method: "POST", body: "{}", headers: {
      cookie: "smithers_session=private-session", authorization: "Bearer browser-token", "x-csrf-token": "csrf",
      "x-user-id": "999", "x-smithers-service-token": "forged"
    } }))
    const headers = f.requests[0]!.headers
    expect(headers.get("cookie")).toBe("smithers_session=private-session")
    expect(headers.get("authorization")).toBe("Bearer browser-token")
    expect(headers.get("x-csrf-token")).toBe("csrf")
    expect(headers.has("x-user-id")).toBe(false)
    expect(headers.has("x-smithers-service-token")).toBe(false)
  })

  test("unconfigured and unsafe upstreams cannot receive reports or credentials", async () => {
    for (const origin of [undefined, "http://cloud.test", "https://user:password@cloud.test", "not a URL"]) {
      const response = await edge.fetch(new Request(`https://app.test${CLIENT_ERRORS_PATH}`, { method: "POST", body: "{}", headers: { authorization: "Bearer private" } }), {
        ASSETS: { fetch: async () => { throw new Error("API must not reach assets") } }, SMITHERS_BACKEND_ORIGIN: origin
      })
      expect(response.status).toBe(503)
      expect(await response.text()).not.toContain("private")
    }
  })

  test("backend failures do not make the reporter throw or retry", async () => {
    const f = fixture(() => new Response("private failure body", { status: 500 }))
    expect(f.reporter.report("error", new Error("one"))).toBeUndefined()
    expect((await f.accepted[0]!).status).toBe(500)
    expect(f.requests).toHaveLength(1)
    const rejected = createClientErrorReporter({ fetchImpl: async () => { throw new Error("transport unavailable") } })
    expect(rejected.report("error", new Error("two"))).toBeUndefined()
    await Promise.resolve()
    expect(rejected.reported()).toBe(1)
  })
})
