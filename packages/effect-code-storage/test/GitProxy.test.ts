import { Effect, Redacted } from "effect"
import { FetchHttpClient, HttpServerRequest, HttpServerResponse } from "effect/http"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { gzipSync } from "node:zlib"
import { describe, expect, test } from "vitest"
import { GitProxy } from "../src/index.ts"
import { brokenBody, httpClient, telemetry } from "./fixtures.ts"

// The read-only git proxy a sandbox clones through, against a scripted git host on the `fetch` seam. The guest's
// requests arrive as a Worker would hand them to the host: web Requests, here from `forge.smithers.internal`.

const UPSTREAM = { url: "https://acme.code.storage/github/o/n.git", authorization: Redacted.make("Basic dDpzZWNyZXQ=") }
const GUEST = "http://forge.smithers.internal/o/n"

interface Seen {
  readonly method: string
  readonly url: string
  readonly headers: Headers
  readonly body: string
}

const proxy = async (
  request: Request,
  answer: (request: Request) => Response | "throw" = () =>
    new Response("advertisement", {
      status: 200,
      headers: {
        "content-type": "application/x-git-upload-pack-advertisement",
        "cache-control": "no-cache",
        "set-cookie": "upstream=1",
        "x-github-request-id": "abc"
      }
    }),
  upstream: typeof UPSTREAM | { readonly url: string } = UPSTREAM
) => {
  const seen: Array<Seen> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const outgoing = input instanceof Request ? input : new Request(input, init)
    seen.push({
      method: outgoing.method,
      url: outgoing.url,
      headers: outgoing.headers,
      body: outgoing.method === "POST" ? await outgoing.text() : ""
    })
    const response = answer(outgoing)
    if (response === "throw") throw new TypeError("fetch failed")
    return response
  }
  const recorded = telemetry()
  // The body streams with the request's services, as a server streams it, so its records land with the test's.
  const { response, context } = await Effect.runPromise(
    recorded.provide(
      Effect.all({
        response: GitProxy.uploadPack(HttpServerRequest.fromWeb(request), upstream),
        context: Effect.context<never>()
      }).pipe(Effect.provide(httpClient(fetch)))
    )
  )
  const web = HttpServerResponse.toWeb(response, { context })
  return { response: web, body: await web.text(), seen, recorded }
}

describe("GitProxy.classify", () => {
  test.each(
    [
      ["GET", "/o/n/info/refs?service=git-upload-pack", "info-refs"],
      ["GET", "/anything/else.git/info/refs?service=git-upload-pack", "info-refs"],
      ["POST", "/o/n/git-upload-pack", "upload-pack"],
      ["GET", "/o/n/info/refs?service=git-receive-pack", undefined],
      ["GET", "/o/n/info/refs?service=git-upload-pack&service=git-receive-pack", undefined],
      ["GET", "/o/n/info/refs", undefined],
      ["POST", "/o/n/git-receive-pack", undefined],
      ["POST", "/o/n/git-upload-pack?x=1", undefined],
      ["GET", "/o/n/git-upload-pack", undefined],
      ["PUT", "/o/n/info/refs?service=git-upload-pack", undefined],
      ["GET", "/o/n/info/lfs/objects/batch", undefined],
      ["GET", "/o/n/HEAD", undefined]
    ] as const
  )("%s %s is %s", (method, path, service) => {
    expect(GitProxy.classify(method, `${GUEST}${path}`)).toBe(service)
  })
})

describe("GitProxy.uploadPack", () => {
  test("sends the ref advertisement request to the upstream with its credential, never the guest's", async () => {
    const { response, body, seen, recorded } = await proxy(
      new Request(`${GUEST}/info/refs?service=git-upload-pack`, {
        headers: { authorization: "Basic Z3Vlc3Q6Z3Vlc3Q=", "git-protocol": "version=2", cookie: "a=b", accept: "*/*" }
      })
    )
    expect(response.status).toBe(200)
    expect(body).toBe("advertisement")
    expect(seen).toHaveLength(1)
    expect(seen[0]!.url).toBe("https://acme.code.storage/github/o/n.git/info/refs?service=git-upload-pack")
    expect(seen[0]!.headers.get("authorization")).toBe("Basic dDpzZWNyZXQ=")
    expect(seen[0]!.headers.get("git-protocol")).toBe("version=2")
    expect(seen[0]!.headers.get("accept")).toBe("*/*")
    expect(seen[0]!.headers.get("cookie")).toBeNull()
    expect(seen[0]!.headers.get("accept-encoding")).toBe("identity")
    // Only git's own headers come back.
    expect(response.headers.get("content-type")).toBe("application/x-git-upload-pack-advertisement")
    expect(response.headers.get("cache-control")).toBe("no-cache")
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(response.headers.get("x-github-request-id")).toBeNull()
    expect(recorded.count(GitProxy.requests, { service: "info-refs", outcome: "ok" })).toBe(1)
    expect(recorded.recorded()).not.toContain("dDpzZWNyZXQ")
    expect(recorded.recorded()).not.toContain("Z3Vlc3Q")
  })

  test("streams the negotiation body to the upstream and the pack back", async () => {
    const { response, body, seen, recorded } = await proxy(
      new Request(`${GUEST}/git-upload-pack`, {
        method: "POST",
        body: "0032want d0dd1f61b33d64e29d8bc1372a94ef6a2fee76a9\n00000009done\n",
        headers: { "content-type": "application/x-git-upload-pack-request", "content-encoding": "identity" }
      }),
      () =>
        new Response(new Blob(["PA", "CK"]).stream(), {
          status: 200,
          headers: { "content-type": "application/x-git-upload-pack-result" }
        })
    )
    expect(seen[0]!.method).toBe("POST")
    expect(seen[0]!.url).toBe("https://acme.code.storage/github/o/n.git/git-upload-pack")
    expect(seen[0]!.body).toBe("0032want d0dd1f61b33d64e29d8bc1372a94ef6a2fee76a9\n00000009done\n")
    expect(seen[0]!.headers.get("content-type")).toBe("application/x-git-upload-pack-request")
    expect(seen[0]!.headers.get("content-encoding")).toBe("identity")
    expect(response.status).toBe(200)
    expect(body).toBe("PACK")
    expect(recorded.count(GitProxy.requests, { service: "upload-pack", outcome: "ok" })).toBe(1)
  })

  test("a pack that breaks off breaks the guest's response too, and counts as broken, never ok", async () => {
    const recorded = telemetry()
    const fetch: typeof globalThis.fetch = async () => new Response(brokenBody("PACK"), { status: 200 })
    const { response, context } = await Effect.runPromise(
      recorded.provide(
        Effect.all({
          response: GitProxy.uploadPack(
            HttpServerRequest.fromWeb(new Request(`${GUEST}/git-upload-pack`, { method: "POST", body: "0000" })),
            UPSTREAM
          ),
          context: Effect.context<never>()
        }).pipe(Effect.provide(httpClient(fetch)))
      )
    )
    await expect(HttpServerResponse.toWeb(response, { context }).text()).rejects.toThrow()
    expect(recorded.count(GitProxy.requests, { service: "upload-pack", outcome: "broken" })).toBe(1)
    expect(recorded.count(GitProxy.requests, { service: "upload-pack", outcome: "ok" })).toBe(0)
  })

  test("a gzipping upstream behind a real fetch: the guest gets the decoded bytes and no Content-Encoding", async () => {
    // GitHub gzips info/refs whatever the client asks; a real `fetch` decodes it, so passing its encoding on would make
    // git gunzip plain bytes. A local server stands in for the upstream, so the network stack is the real one.
    const advertisement = "001e# service=git-upload-pack\n0000"
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/x-git-upload-pack-advertisement",
        "content-encoding": "gzip"
      })
      response.end(gzipSync(advertisement))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const { port } = server.address() as AddressInfo
    try {
      const response = await Effect.runPromise(
        GitProxy.uploadPack(
          HttpServerRequest.fromWeb(new Request(`${GUEST}/info/refs?service=git-upload-pack`)),
          { url: `http://127.0.0.1:${port}/o/n.git` }
        ).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const web = HttpServerResponse.toWeb(response)
      expect(web.headers.get("content-encoding")).toBeNull()
      expect(await web.text()).toBe(advertisement)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  test("sends no credential when the upstream has none", async () => {
    const { seen } = await proxy(
      new Request(`${GUEST}/info/refs?service=git-upload-pack`),
      undefined,
      { url: "https://github.com/o/n.git/" }
    )
    expect(seen[0]!.url).toBe("https://github.com/o/n.git/info/refs?service=git-upload-pack")
    expect(seen[0]!.headers.get("authorization")).toBeNull()
  })

  test("refuses a push before anything reaches the upstream", async () => {
    const { response, seen, recorded } = await proxy(
      new Request(`${GUEST}/git-receive-pack`, { method: "POST", body: "0000" })
    )
    expect(response.status).toBe(403)
    expect(seen).toEqual([])
    expect(recorded.count(GitProxy.requests, { service: "refused", outcome: "refused" })).toBe(1)
  })

  test("passes an upstream's refusal back by its status", async () => {
    const { response, recorded } = await proxy(
      new Request(`${GUEST}/info/refs?service=git-upload-pack`),
      () => new Response("no", { status: 404, headers: { "content-type": "text/plain" } })
    )
    expect(response.status).toBe(404)
    expect(recorded.count(GitProxy.requests, { service: "info-refs", outcome: "4xx" })).toBe(1)
  })

  test("answers 502 when the upstream doesn't answer", async () => {
    const { response, recorded } = await proxy(new Request(`${GUEST}/info/refs?service=git-upload-pack`), () => "throw")
    expect(response.status).toBe(502)
    expect(recorded.count(GitProxy.requests, { service: "info-refs", outcome: "transport" })).toBe(1)
    expect(recorded.spans.map((span) => span.name)).toContain("GitProxy.uploadPack")
  })
})
