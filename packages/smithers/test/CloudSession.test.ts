/** The signed-in Cloud session another host reads with: the CLI's token and origin, sent as the CLI sends them. */
import { execFileSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import * as CloudSession from "../src/CloudSession.ts"

const servers: Array<() => void> = []
afterEach(() => {
  for (const close of servers.splice(0)) close()
})
const origin = async (
  reply: (path: string, auth: string | undefined) => { status: number; body: unknown; headers?: Record<string, string> }
) => {
  const server = createServer((request, response) => {
    const { status, body, headers } = reply(request.url ?? "", request.headers.authorization)
    response.writeHead(status, { "content-type": "application/json", ...headers })
    response.end(JSON.stringify(body))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(() => server.close())
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
const home = () => mkdtempSync(join(tmpdir(), "cloud-session-"))

describe("CloudSession.signedIn", () => {
  it("GETs a path as the signed-in person, with the token the CLI sends", async () => {
    const at = await origin((path, auth) => ({ status: 200, body: { path, auth } }))
    const cloud = await CloudSession.signedIn({
      HOME: home(),
      XDG_CONFIG_HOME: home(),
      SMITHERS_API_ORIGIN: at,
      SMITHERS_TOKEN: "tok_1"
    })
    expect(cloud?.origin).toBe(at)
    expect(await cloud!.get("/api/repos/o/r/mythical", new AbortController().signal)).toEqual({
      path: "/api/repos/o/r/mythical",
      auth: "token tok_1"
    })
  })

  it("is undefined without an origin or a login, and a refused read names its status", async () => {
    expect(await CloudSession.signedIn({ HOME: home(), XDG_CONFIG_HOME: home(), SMITHERS_TOKEN: "tok_1" }))
      .toBeUndefined()
    const at = await origin(() => ({ status: 403, body: {} }))
    expect(await CloudSession.signedIn({ HOME: home(), XDG_CONFIG_HOME: home(), SMITHERS_API_ORIGIN: at }))
      .toBeUndefined()
    const cloud = await CloudSession.signedIn({
      HOME: home(),
      XDG_CONFIG_HOME: home(),
      SMITHERS_API_ORIGIN: at,
      SMITHERS_TOKEN: "t"
    })
    await expect(cloud!.get("/api/x")).rejects.toMatchObject({
      _tag: "/cli/Refused",
      fault: "user",
      code: "cloud_request_failed",
      message: "/api/x: HTTP 403"
    })
  })

  it("refuses a body that is not JSON by path, never the parser's text", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" })
      response.end("<html>")
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    servers.push(() => server.close())
    const at = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const cloud = await CloudSession.signedIn({
      HOME: home(),
      XDG_CONFIG_HOME: home(),
      SMITHERS_API_ORIGIN: at,
      SMITHERS_TOKEN: "t"
    })
    await expect(cloud!.get("/api/x")).rejects.toMatchObject({
      _tag: "/cli/Refused",
      fault: "infra",
      code: "cloud_response_invalid",
      message: "/api/x: the response is not JSON"
    })
  })

  it("POSTs a JSON body as the signed-in person, and refuses a path off the origin or a refusal by status", async () => {
    const seen: Array<
      { method: string | undefined; type: string | undefined; auth: string | undefined; body: string }
    > = []
    const server = createServer((request, response) => {
      let body = ""
      request.on("data", (chunk) => (body += chunk))
      request.on("end", () => {
        seen.push({
          method: request.method,
          type: request.headers["content-type"],
          auth: request.headers.authorization,
          body
        })
        response.writeHead(request.url === "/api/no" ? 403 : 201, { "content-type": "application/json" })
        response.end(JSON.stringify({ ok: true }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    servers.push(() => server.close())
    const at = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const cloud = await CloudSession.signedIn({
      HOME: home(),
      XDG_CONFIG_HOME: home(),
      SMITHERS_API_ORIGIN: at,
      SMITHERS_TOKEN: "tok_2"
    })
    expect(await cloud!.post("/api/x", { title: "T", request: "r-1" })).toEqual({ ok: true })
    expect(seen).toEqual([{
      method: "POST",
      type: "application/json",
      auth: "token tok_2",
      body: "{\"title\":\"T\",\"request\":\"r-1\"}"
    }])
    await expect(cloud!.post("/api/no", {})).rejects.toMatchObject({ fault: "user", message: "/api/no: HTTP 403" })
    await expect(cloud!.post("//evil.example/x", {})).rejects.toThrow("Not a Cloud API path")
    expect(seen).toHaveLength(2)
  })

  it("never sends the token to another host, and refuses redirects", async () => {
    const at = await origin((path) => ({ status: 200, body: { path } }))
    const cloud = await CloudSession.signedIn({
      HOME: home(),
      XDG_CONFIG_HOME: home(),
      SMITHERS_API_ORIGIN: at,
      SMITHERS_TOKEN: "t"
    })
    await expect(cloud!.get("@evil.example/x")).rejects.toThrow("Not a Cloud API path")
    await expect(cloud!.get("//evil.example/x")).rejects.toThrow("Not a Cloud API path")
  })
})

describe("CloudSession.repository", () => {
  it("names owner/name from a git remote, and nothing without one", () => {
    const dir = home()
    execFileSync("git", ["init", "-q", dir])
    expect(CloudSession.repository(dir, process.env)).toBeUndefined()
    execFileSync("git", ["-C", dir, "remote", "add", "origin", "https://github.com/smithersai/smithers.git"])
    expect(CloudSession.repository(dir, process.env)).toBe("smithersai/smithers")
    execFileSync("git", ["-C", dir, "remote", "set-url", "origin", "/srv/git/acme/secret-project.git"])
    expect(CloudSession.repository(dir, process.env)).toBeUndefined()
  })
})

it("reads opaque page metadata while keeping ordinary GET body-compatible", async () => {
  const seen: Array<{ path: string; auth: string | undefined }> = []
  const path = "/api/repos/o/r/issues?view=bugs&limit=100"
  const at = await origin((requested, auth) => {
    seen.push({ path: requested, auth })
    return {
      status: 200,
      body: [{ number: 17, title: "Visible issue" }],
      headers: { Link: `<${path}&cursor=MTc>; rel="next"`, "X-Total-Count": "2" }
    }
  })
  const cloud = await CloudSession.signedIn({
    HOME: home(),
    XDG_CONFIG_HOME: home(),
    SMITHERS_API_ORIGIN: at,
    SMITHERS_TOKEN: "tok_page"
  })
  expect(await cloud!.getPage(path)).toEqual({
    body: [{ number: 17, title: "Visible issue" }],
    nextCursor: "MTc",
    bytes: Buffer.byteLength(JSON.stringify([{ number: 17, title: "Visible issue" }]))
  })
  expect(await cloud!.get(path)).toEqual([{ number: 17, title: "Visible issue" }])
  expect(seen).toEqual([{ path, auth: "token tok_page" }, { path, auth: "token tok_page" }])
})

for (const changed of ["origin", "repository", "view", "limit", "state", "duplicate-cursor"] as const) {
  it(`refuses ${changed} page continuation authority before another credentialed request`, async () => {
    let calls = 0
    const path = "/api/repos/o/r/issues?view=bugs&limit=100"
    const at = await origin(() => {
      calls += 1
      const next = changed === "origin" ?
        "http://127.0.0.1:1/api/repos/o/r/issues?view=bugs&limit=100&cursor=MTc"
        : changed === "repository" ?
        "/api/repos/other/r/issues?view=bugs&limit=100&cursor=MTc"
        : changed === "view" ?
        "/api/repos/o/r/issues?view=everything&limit=100&cursor=MTc"
        : changed === "limit" ?
        "/api/repos/o/r/issues?view=bugs&limit=500&cursor=MTc"
        : changed === "state" ?
        "/api/repos/o/r/issues?view=bugs&limit=100&state=closed&cursor=MTc"
        : path + "&cursor=MTc&cursor=MjA"
      return { status: 200, body: [], headers: { Link: `<${next}>; rel="next"` } }
    })
    const cloud = await CloudSession.signedIn({
      HOME: home(),
      XDG_CONFIG_HOME: home(),
      SMITHERS_API_ORIGIN: at,
      SMITHERS_TOKEN: "tok_page_authority"
    })
    await expect(cloud!.getPage(path)).rejects.toMatchObject({ fault: "infra", code: "backend_protocol" })
    expect(calls).toBe(1)
    expect(await cloud!.get(path)).toEqual([])
    expect(calls).toBe(2)
  })
}

it("bounds successful response bytes rather than decoded Unicode characters", async () => {
  const at = await origin(() => ({ status: 200, body: "é".repeat(2 * 1024 * 1024) }))
  const cloud = await CloudSession.signedIn({
    HOME: home(),
    XDG_CONFIG_HOME: home(),
    SMITHERS_API_ORIGIN: at,
    SMITHERS_TOKEN: "tok_unicode"
  })
  await expect(cloud!.getPage("/api/repos/o/r/issues?view=bugs&limit=100")).rejects.toMatchObject({
    fault: "infra",
    code: "cloud_response_too_large"
  })
})

it("cancels an unresolved response stream and permits a fresh completed read", async () => {
  let entered!: () => void
  const streaming = new Promise<void>((resolve) => {
    entered = resolve
  })
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    if (request.url === "/api/held") {
      response.write("[")
      entered()
    } else response.end("[]")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(() => {
    server.closeAllConnections()
    server.close()
  })
  const cloud = await CloudSession.signedIn({
    HOME: home(),
    XDG_CONFIG_HOME: home(),
    SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    SMITHERS_TOKEN: "tok_stream"
  })
  const abort = new AbortController()
  const read = cloud!.getPage("/api/held", abort.signal)
  await streaming
  abort.abort()
  await expect(read).rejects.toMatchObject({ name: "AbortError" })
  expect(await cloud!.getPage("/api/completed")).toEqual({ body: [], nextCursor: "", bytes: 2 })
})

it("accepts an actual BOM-prefixed JSON page as ordinary GET does", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    response.end("\uFEFF[]")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(() => server.close())
  const cloud = await CloudSession.signedIn({
    HOME: home(),
    XDG_CONFIG_HOME: home(),
    SMITHERS_TOKEN: "tok_bom",
    SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  expect(await cloud!.getPage("/api/page")).toEqual({ body: [], nextCursor: "", bytes: 5 })
  expect(await cloud!.get("/api/page")).toEqual([])
})
