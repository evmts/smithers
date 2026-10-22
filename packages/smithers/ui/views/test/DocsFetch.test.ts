/**
 * `Docs.fetchText` against a real HTTP server on this machine, through
 * Effect's real `FetchHttpClient`: text answered, the guard that refuses
 * private hosts before anything is sent and on every redirect, statuses,
 * binary bodies, the size cap and the deadline. The server is on
 * `127.0.0.1`, which the guard refuses unless a test names it in
 * `privateHosts`.
 */
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Docs } from "../src/index.ts"

const seen: Array<{ readonly path: string; readonly headers: IncomingHttpHeaders }> = []
const open: Array<ServerResponse> = []

const answer =
  (status: number, body: string | Uint8Array, type = "text/plain; charset=utf-8") => (response: ServerResponse) => {
    response.writeHead(status, { "content-type": type })
    response.end(body)
  }

const redirect = (location: string) => (response: ServerResponse) => {
  response.writeHead(302, { location })
  response.end()
}

const routes: Record<string, (response: ServerResponse) => void> = {
  "/llms.txt": answer(200, "# Docs\n\n- [A](/a.md)\n"),
  "/a.md": answer(200, "# A\n\nCafé.", "text/markdown; charset=utf-8"),
  "/untyped": (response) => {
    response.writeHead(200)
    response.end("plain")
  },
  "/json": answer(200, "{}", "application/json"),
  "/missing": answer(404, "nope"),
  "/image": answer(200, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png"),
  "/nul": answer(200, new Uint8Array([0x61, 0x00, 0x62]), "text/plain"),
  "/big": answer(200, "x".repeat(4096)),
  "/latin1": answer(200, new Uint8Array([0x43, 0x61, 0x66, 0xe9]), "text/plain; charset=iso-8859-1"),
  "/cut": (response) => {
    response.writeHead(200, { "content-type": "text/plain" })
    response.write("partial")
    setTimeout(() => response.socket?.destroy(), 20)
  },
  "/to-a": redirect("/a.md"),
  "/loop": redirect("/loop"),
  "/to-private": redirect("http://10.0.0.1/llms.txt"),
  "/to-script": redirect("javascript:alert(1)"),
  "/hang": (response) => void open.push(response)
}

let server: Server
let origin: string
beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname
    seen.push({ path, headers: request.headers })
    const route = routes[path]
    if (route === undefined) {
      response.writeHead(404).end()
      return
    }
    route(response)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
beforeEach(() => {
  seen.length = 0
  for (const response of open.splice(0)) response.destroy()
})

const fetchText = (url: string, options: Partial<Docs.FetchOptions> = {}) =>
  Effect.runPromise(
    Docs.fetchText(url, { privateHosts: ["127.0.0.1"], ...options }).pipe(Effect.provide(FetchHttpClient.layer))
  )

describe("Docs.fetchText", () => {
  it("answers a text body with its media type, asking for Markdown and plain text", async () => {
    expect(await fetchText(`${origin}/llms.txt`)).toEqual({
      _tag: "Text",
      text: "# Docs\n\n- [A](/a.md)\n",
      type: "text/plain",
      url: `${origin}/llms.txt`
    })
    expect(await fetchText(`${origin}/a.md`)).toMatchObject({
      _tag: "Text",
      text: "# A\n\nCafé.",
      type: "text/markdown"
    })
    expect(seen[0]!.headers.accept).toContain("text/markdown")
    expect(seen[0]!.headers.cookie).toBeUndefined()
  })

  it("follows a redirect, guarded, and answers the URL it ended on", async () => {
    expect(await fetchText(`${origin}/to-a`)).toMatchObject({ _tag: "Text", url: `${origin}/a.md` })
    expect(await fetchText(`${origin}/loop`)).toEqual({ _tag: "Refused", reason: "redirects" })
    expect(await fetchText(`${origin}/to-private`)).toEqual({ _tag: "Refused", reason: "private_host" })
    expect(await fetchText(`${origin}/to-script`)).toEqual({ _tag: "Refused", reason: "redirects" })
  })

  it("refuses a private host, a script URL or credentials before anything is sent", async () => {
    expect(await fetchText(`${origin}/llms.txt`, { privateHosts: [] })).toEqual({
      _tag: "Refused",
      reason: "private_host"
    })
    for (const url of ["http://localhost/llms.txt", "https://intranet/llms.txt", "https://wiki.corp.internal/a.md"]) {
      expect(await fetchText(url)).toEqual({ _tag: "Refused", reason: "private_host" })
    }
    expect(await fetchText("javascript:alert(1)")).toEqual({ _tag: "Refused", reason: "invalid_url" })
    expect(await fetchText("https://user:pass@docs.example.com/llms.txt")).toEqual({
      _tag: "Refused",
      reason: "invalid_url"
    })
    expect(await fetchText("not a url")).toEqual({ _tag: "Refused", reason: "invalid_url" })
    // With no options at all, the guard lets no private host through.
    expect(
      await Effect.runPromise(Docs.fetchText(`${origin}/llms.txt`).pipe(Effect.provide(FetchHttpClient.layer)))
    ).toEqual({ _tag: "Refused", reason: "private_host" })
    expect(seen).toEqual([])
  })

  it("an error status, a body that isn't text, one over the cap, or no answer in time is refused by why", async () => {
    expect(await fetchText(`${origin}/missing`)).toEqual({ _tag: "Refused", reason: "status", status: 404 })
    expect(await fetchText(`${origin}/image`)).toEqual({ _tag: "Refused", reason: "content" })
    expect(await fetchText(`${origin}/json`)).toEqual({ _tag: "Refused", reason: "content" })
    expect(await fetchText(`${origin}/nul`)).toEqual({ _tag: "Refused", reason: "content" })
    expect(await fetchText(`${origin}/latin1`)).toEqual({ _tag: "Refused", reason: "content" })
    expect(await fetchText(`${origin}/cut`)).toEqual({ _tag: "Refused", reason: "unreachable" })
    expect(await fetchText(`${origin}/untyped`)).toMatchObject({ _tag: "Text", text: "plain", type: "text/plain" })
    expect(await fetchText(`${origin}/big`, { maxBytes: 1024 })).toEqual({ _tag: "Refused", reason: "too_large" })
    expect(await fetchText(`${origin}/hang`, { timeout: "200 millis" })).toEqual({ _tag: "Refused", reason: "timeout" })
    expect(await fetchText("http://127.0.0.1:1/llms.txt")).toEqual({ _tag: "Refused", reason: "unreachable" })
  })
})
