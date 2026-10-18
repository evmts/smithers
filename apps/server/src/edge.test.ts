import { DEFAULT_APP_DOCUMENT_PATH } from "./appDocument"
import { afterEach, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as TestClock from "effect/testing/TestClock"
import { RepositorySites } from "./RepositorySites"
import edge, { edgeAssets, handleEdgeRequest } from "./edge"
import { DEFAULT_UPSTREAM_TIMEOUT_MS, GIT_UPSTREAM_TIMEOUT_MS, Transport, transportFrom } from "./Http"

const servers: Array<ReturnType<typeof Bun.serve>> = []
afterEach(() => { for (const server of servers.splice(0)) server.stop(true) })
const backend = (fetch: (request: Request) => Response | Promise<Response>) => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch })
  servers.push(server)
  return server.url.origin
}
const assets = { fetch: async () => new Response("missing", { status: 404 }) }

test("every product route reaches the selected shared backend without edge authority", async () => {
  const received: string[] = []
  const origin = backend(request => {
    received.push(new URL(request.url).pathname)
    return Response.json({ source: "shared", path: new URL(request.url).pathname }, { status: 418 })
  })
  const paths = ["bootstrap", "agent/turn", "agent/turn/cancel", "agent/turn/replay", "agent/turn/retire",
    "agent/turn/erase", "model/catalog", "model/credential", "model/credential/receipt", "model/default",
    "model/test", "model/stream", "recommend", "recommend/outcome", "user", "auth/github",
    "auth/github/callback", "auth/logout", "billing/balance", "workflow/rpc", "repos/a/b/workspace", "unknown"]
  for (const path of paths) {
    const response = await edge.fetch(new Request(`https://canary.smithers.sh/api/${path}`), { ASSETS: assets, SMITHERS_BACKEND_ORIGIN: origin })
    expect(response.status).toBe(418)
    expect(await response.json()).toEqual({ source: "shared", path: `/api/${path}` })
  }
  expect(received).toEqual(paths.map(path => `/api/${path}`))
})

test("forwards session, bearer, CSRF, query and body; strips forged proxy authority", async () => {
  let received: { url: string; method: string; headers: Headers; body: string } | undefined
  const origin = backend(async request => {
    received = { url: request.url, method: request.method, headers: request.headers, body: await request.text() }
    return new Response("denied", { status: 403, headers: { "x-request-id": "shared-request" } })
  })
  const response = await edge.fetch(new Request("https://canary.smithers.sh/api/model/credential?one=a%2Fb&one=c", {
    method: "POST", headers: { cookie: "__Host-smithers_session=session; smithers_csrf=csrf", authorization: "token account-token",
      "x-csrf-token": "csrf", origin: "https://canary.smithers.sh", "content-type": "application/json",
      "x-user-id": "999", "x-user-login": "admin", "x-smithers-service-token": "forged", "x-forwarded-for": "1.2.3.4" }, body: '{"id":"request"}'
  }), { ASSETS: assets, SMITHERS_BACKEND_ORIGIN: origin })
  expect(received?.url).toBe(`${origin}/api/model/credential?one=a%2Fb&one=c`)
  expect(received?.method).toBe("POST")
  expect(received?.body).toBe('{"id":"request"}')
  expect(received?.headers.get("cookie")).toContain("__Host-smithers_session=session")
  expect(received?.headers.get("authorization")).toBe("token account-token")
  expect(received?.headers.get("x-csrf-token")).toBe("csrf")
  expect(received?.headers.get("origin")).toBe("https://canary.smithers.sh")
  for (const key of ["x-user-id", "x-user-login", "x-smithers-service-token", "x-forwarded-for"]) expect(received?.headers.has(key)).toBe(false)
  expect(response.status).toBe(403)
  expect(response.headers.get("x-request-id")).toBe("shared-request")
  expect(await response.text()).toBe("denied")
})

test("OAuth cookies and redirects pass through without following them", async () => {
  let requests = 0
  const origin = backend(() => {
    requests++
    const headers = new Headers({ location: "https://github.com/login/oauth/authorize?state=opaque" })
    headers.append("set-cookie", "__Host-smithers_session=example; Path=/; HttpOnly; Secure; SameSite=Lax")
    headers.append("set-cookie", "smithers_csrf=example; Path=/; Secure; SameSite=Strict")
    return new Response(null, { status: 302, headers })
  })
  const response = await edge.fetch(new Request("https://canary.smithers.sh/api/auth/github/callback?code=opaque"), { ASSETS: assets, SMITHERS_BACKEND_ORIGIN: origin })
  expect(requests).toBe(1)
  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toBe("https://github.com/login/oauth/authorize?state=opaque")
  expect(response.headers.getSetCookie()).toHaveLength(2)
})

test("returns an accepted chat frame before the shared stream finishes", async () => {
  let finish!: () => void
  const origin = backend(() => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"type":"accepted"}\n'))
    finish = () => { controller.enqueue(new TextEncoder().encode('{"type":"done"}\n')); controller.close() }
  } }), { headers: { "content-type": "application/x-ndjson", "x-smithers-turn-journal": "1" } }))
  const response = await edge.fetch(new Request("https://canary.smithers.sh/api/agent/turn"), { ASSETS: assets, SMITHERS_BACKEND_ORIGIN: origin })
  const reader = response.body!.getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('{"type":"accepted"}\n')
  expect(response.headers.get("x-smithers-turn-journal")).toBe("1")
  finish()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('{"type":"done"}\n')
  expect((await reader.read()).done).toBe(true)
})

test("missing, invalid or self-referencing backend fails closed without reading assets", async () => {
  let assetReads = 0
  const ASSETS = { fetch: async () => { assetReads++; return new Response("asset") } }
  for (const target of [undefined, "https://user:secret@api.example", "https://api.example/prefix", "https://canary.smithers.sh"]) {
    const response = await edge.fetch(new Request("https://canary.smithers.sh/api/bootstrap"), { ASSETS, SMITHERS_BACKEND_ORIGIN: target })
    expect(response.status).toBe(503)
  }
  expect(assetReads).toBe(0)
})

test("unreachable shared host yields an honest gateway failure", async () => {
  const origin = backend(() => new Response("unused"))
  servers.at(-1)!.stop(true)
  const response = await edge.fetch(new Request("https://canary.smithers.sh/api/bootstrap"), { ASSETS: assets, SMITHERS_BACKEND_ORIGIN: origin })
  expect(response.status).toBe(502)
  expect((await response.json()).code).toBe("upstream_unreachable")
})

test("repository reloads serve the app document with isolation and canary noindex", async () => {
  const seen: string[] = []
  const ASSETS = { fetch: async (request: Request) => {
    const path = new URL(request.url).pathname
    seen.push(path)
    return path === "/smithersai/smithers/" ? new Response('<div id="root"></div>', { headers: { "content-type": "text/html" } }) : new Response("missing", { status: 404 })
  } }
  const response = await edge.fetch(new Request("https://canary.smithers.sh/example/repository"), { ASSETS })
  expect(response.status).toBe(200)
  expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp")
  expect(response.headers.get("x-robots-tag")).toBe("noindex")
  expect(seen).toEqual(["/example/repository", "/smithersai/smithers/"])
})

/*
 * #4039, reproduced in production on 2026-10-16: the owned QA repository's own
 * pull request at `https://smithers.sh/roninjin10/e2e-verify/pull/2/files`
 * answered with the marketing site's "Page not found", because the Worker
 * recognized exactly two repository segments and nothing below them. These pin
 * the request boundary: the reported URL reaches the application document, the
 * reader's tab survives the hop, and no site, API, frame or unsupported path
 * becomes the app by being shaped a little like one.
 */
const appDocumentProbe = () => {
  const seen: string[] = []
  const ASSETS = { fetch: async (request: Request) => {
    const path = new URL(request.url).pathname
    seen.push(path)
    return path.endsWith("/") && (path === "/smithersai/smithers/" || path === "/effect-ts/effect/")
      ? new Response('<div id="root"></div>', { headers: { "content-type": "text/html" } })
      : new Response("<h1>Page not found</h1>", { status: 404, headers: { "content-type": "text/html" } })
  } }
  return { ASSETS, seen }
}

test("the reported pull request URL and its tabs reach the app document, from the catalog page or the fallback", async () => {
  for (const pathname of [
    "/roninjin10/e2e-verify/pull/2/files",
    "/roninjin10/e2e-verify/pull/2",
    "/roninjin10/e2e-verify/pull/2/commits",
    "/roninjin10/e2e-verify/pull/2/checks",
    "/roninjin10/e2e-verify/pull/2/conversation",
    "/roninjin10/e2e-verify/pulls",
    "/roninjin10/e2e-verify/issues",
    "/roninjin10/e2e-verify/issues/6",
    "/smithersai/smithers/pull/2/files",
    "/smithersai/smithers/issues/4039",
    // The folder and file links a reader gets by swapping the domain.
    "/roninjin10/e2e-verify/tree/main",
    "/roninjin10/e2e-verify/tree/main/apps/server/src",
    "/roninjin10/e2e-verify/tree/release/1.2/apps",
    "/roninjin10/e2e-verify/blob/main/apps/server/src/edge.ts",
    "/roninjin10/e2e-verify/blob/3bad5fe63720eb8e3f7ae33a10de9e7aefb2dc74/apps/server/src/edge.ts",
    "/roninjin10/e2e-verify/tree/3bad5fe63720eb8e3f7ae33a10de9e7aefb2dc74/apps",
    "/smithersai/smithers/blob/main/README.md"
  ]) {
    const { ASSETS, seen } = appDocumentProbe()
    const response = await edge.fetch(new Request(`https://smithers.sh${pathname}`), { ASSETS })
    expect({ pathname, status: response.status }).toEqual({ pathname, status: 200 })
    expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp")
    // A catalog repository is served from its OWN prerendered page; any other
    // repository falls back to the one shell, exactly as `/owner/repo` does.
    // At this catalog size both are the same document, so what this pins is
    // that a document was served at all, and the next test pins which read.
    expect({ pathname, document: seen.at(-1) }).toEqual({ pathname, document: "/smithersai/smithers/" })
  }
})

test("a catalog repository's subject is served from that repository's own page without a second asset read", async () => {
  const { ASSETS, seen } = appDocumentProbe()
  const response = await edge.fetch(new Request("https://smithers.sh/smithersai/smithers/pull/2/files"), { ASSETS })
  expect(response.status).toBe(200)
  expect(seen).toEqual(["/smithersai/smithers/"])
})

test("a mixed-case subject path redirects to the canonical page and KEEPS the subject", async () => {
  const { ASSETS } = appDocumentProbe()
  const response = await edge.fetch(new Request("https://smithers.sh/SmithersAI/Smithers/pull/2/files"), { ASSETS })
  expect(response.status).toBe(301)
  expect(new URL(response.headers.get("location")!).pathname).toBe("/smithersai/smithers/pull/2/files")
})

/*
 * A ref and a file path are case-sensitive on every checkout this serves.
 * The repository root is still normalized to GitHub's canonical lowercase
 * page; everything below it is the reader's own spelling, and a path that is
 * already canonical below the root is served, never redirected.
 */
test("a file deep link keeps the case of its ref and its path while the root is canonicalized", async () => {
  const { ASSETS } = appDocumentProbe()
  const redirected = await edge.fetch(
    new Request("https://smithers.sh/SmithersAI/Smithers/blob/Release/1.2/docs/README.md"),
    { ASSETS }
  )
  expect(redirected.status).toBe(301)
  expect(new URL(redirected.headers.get("location")!).pathname)
    .toBe("/smithersai/smithers/blob/Release/1.2/docs/README.md")

  const served = appDocumentProbe()
  const direct = await edge.fetch(
    new Request("https://smithers.sh/smithersai/smithers/blob/main/docs/README.md"),
    { ASSETS: served.ASSETS }
  )
  expect(direct.status).toBe(200)
  expect(served.seen).toEqual(["/smithersai/smithers/"])
})

test("the frame path this change did not touch is still the app", async () => {
  const { ASSETS, seen } = appDocumentProbe()
  const response = await edge.fetch(new Request("https://smithers.sh/w/ws-1/b/main/f/frame-1"), { ASSETS })
  expect(response.status).toBe(200)
  expect(seen).toEqual(["/smithersai/smithers/"])
})

test("site, API, coming-soon and unsupported subject paths never become the app", async () => {
  // Every one of these is either another owner's route or a shape this app has
  // no view for. The honest answer is the site's, not a blank application.
  for (const pathname of [
    "/docs/cli/pull/2",
    "/api/repos/a/b/pull/2",
    "/migration/1.0/pull/2",
    "/owner/repo/pull/0",
    "/owner/repo/pull/-1",
    "/owner/repo/pull/2x",
    "/owner/repo/pull/99999999999",
    "/owner/repo/pull/%32",
    "/owner/repo/pu%6Cl/2",
    "/owner/repo/pull/2/files/src/index.ts",
    "/owner/repo/pull/2/rebase",
    "/owner/repo/pulls/2",
    "/owner/repo/issues/2/comments",
    "/owner/repo/tree",
    "/owner/repo/blob",
    "/owner/repo/tree/main/..",
    "/owner/repo/blob/main/../../etc/passwd",
    "/owner/repo/blob/main/src%2Findex.ts",
    "/owner/repo/blob/https://evil.example/x",
    "/owner/repo/commit/abc123"
  ]) {
    const { ASSETS, seen } = appDocumentProbe()
    const response = await edge.fetch(new Request(`https://smithers.sh${pathname}`), { ASSETS })
    expect({ pathname, served: seen.filter(path => path.endsWith("/smithers/")) }).toEqual({ pathname, served: [] })
    expect({ pathname, status: response.status }).toEqual({ pathname, status: pathname.startsWith("/api/") ? 503 : 404 })
  }
})

test("a subject path is read-only: only GET and HEAD fall back to the app shell", async () => {
  const { ASSETS, seen } = appDocumentProbe()
  for (const method of ["HEAD", "GET"]) {
    const response = await edge.fetch(new Request("https://smithers.sh/roninjin10/e2e-verify/pull/2/files", { method }), { ASSETS })
    expect(response.status).toBe(200)
  }
  const posted = await edge.fetch(new Request("https://smithers.sh/roninjin10/e2e-verify/pull/2/files", { method: "POST" }), { ASSETS })
  expect(posted.status).toBe(404)
  expect(seen.filter(path => path === "/smithersai/smithers/")).toHaveLength(2)
})

/*
 * A curated catalog row is a CATALOG fact; it was also the routing fence, and
 * that is the gap this lane closes. `/effect-ts/effect/` served a prerendered
 * marketing "Coming soon" page, and every subject below it was excluded from
 * `repositorySubjectRoot` outright, so a maintainer who had just installed the
 * Smithers GitHub App on one of these ten repositories could never reach the
 * app's own import path (M-46): the compiled page won before any read of
 * binding, access, installation or import state happened.
 *
 * These assert the ROUTING only. Serving the app grants nothing: availability
 * is still the catalog's and the account inventory's answer
 * (`apps/app/src/mainview/RepoLink.ts` `openRequestedRepo`, `/api/public/repos`),
 * and the Cloud mirror lookup still consults AVAILABLE_REPOS alone.
 */
test("a curated coming-soon repository and its subjects reach the app, with the app's own isolation", async () => {
  for (const pathname of [
    "/effect-ts/effect/",
    "/effect-ts/effect",
    "/effect-ts/effect/pull/2",
    "/effect-ts/effect/pull/2/files",
    "/effect-ts/effect/pulls",
    "/effect-ts/effect/issues",
    "/effect-ts/effect/issues/6",
    "/effect-ts/effect/tree/main/src",
    "/effect-ts/effect/blob/main/README.md"
  ]) {
    const { ASSETS, seen } = appDocumentProbe()
    const response = await edge.fetch(new Request(`https://smithers.sh${pathname}`), { ASSETS })
    expect({ pathname, status: response.status }).toEqual({ pathname, status: 200 })
    // The app document, and the app's isolation headers with it — the
    // coming-soon page deliberately carried none, because it was not the app.
    expect({ pathname, coep: response.headers.get("cross-origin-embedder-policy") })
      .toEqual({ pathname, coep: "require-corp" })
    expect({ pathname, document: seen.at(-1) }).toEqual({ pathname, document: "/effect-ts/effect/" })
  }
})

test("a coming-soon repository's mixed-case deep link redirects once, keeping the subject's own case", async () => {
  const { ASSETS } = appDocumentProbe()
  const response = await edge.fetch(new Request("https://smithers.sh/Effect-TS/effect/blob/Main/docs/README.md"), { ASSETS })
  expect(response.status).toBe(301)
  expect(new URL(response.headers.get("location")!).pathname).toBe("/effect-ts/effect/blob/Main/docs/README.md")

  const root = appDocumentProbe()
  // A bare mixed-case root goes to the canonical document path, as every
  // available repository's root already did.
  const rootResponse = await edge.fetch(new Request("https://smithers.sh/Effect-TS/effect"), { ASSETS: root.ASSETS })
  expect(rootResponse.status).toBe(301)
  expect(new URL(rootResponse.headers.get("location")!).pathname).toBe("/effect-ts/effect/")
})

/*
 * Routing parity, stated as the one thing that changed: a curated coming-soon
 * repository is now answered exactly as the available catalog repository is,
 * method for method. Nothing here widens what a method may do — a prerendered
 * document is the assets layer's answer either way — it pins that the two
 * rosters no longer route differently.
 */
test("a coming-soon repository is routed exactly as an available catalog repository is", async () => {
  for (const method of ["GET", "HEAD", "POST"]) {
    for (const subject of ["/pull/2", "/issues", "/blob/main/README.md"]) {
      const available = appDocumentProbe()
      const expected = await edge.fetch(new Request(`https://smithers.sh/smithersai/smithers${subject}`, { method }), { ASSETS: available.ASSETS })
      const coming = appDocumentProbe()
      const observed = await edge.fetch(new Request(`https://smithers.sh/effect-ts/effect${subject}`, { method }), { ASSETS: coming.ASSETS })
      expect({ method, subject, status: observed.status, coep: observed.headers.get("cross-origin-embedder-policy") })
        .toEqual({ method, subject, status: expected.status, coep: expected.headers.get("cross-origin-embedder-policy") })
      // Each is served from its OWN prerendered page, not from the other's.
      expect({ method, subject, served: coming.seen }).toEqual({ method, subject, served: ["/effect-ts/effect/"] })
    }
  }
})


test("Monday paths serve the app document and legacy subjects redirect with query", async () => {
  const paths = ["commits", "commits/main/src", "commit/abcdef1", "branches", "flows", "flows/build", "settings/secrets", "search?q=hello", "runs", "runs/one", "approvals"]
  for (const path of paths) {
    const response = await edge.fetch(new Request(`https://smithers.sh/any/repo/${path}`), { ASSETS: { fetch: async request => new URL(request.url).pathname === DEFAULT_APP_DOCUMENT_PATH ? new Response("app") : new Response("missing", { status: 404 }) } })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("app")
  }
  for (const [from, to] of [["actions", "runs"], ["labels", "issues"], ["milestones", "issues"]]) {
    const response = await edge.fetch(new Request(`https://smithers.sh/any/repo/${from}?q=a%2Fb`), { ASSETS: assets })
    expect(response.status).toBe(301)
    expect(response.headers.get("location")).toBe(`https://smithers.sh/any/repo/${to}?q=a%2Fb`)
  }
})

/*
 * #4299, reproduced in production on 2026-10-18: `git clone
 * https://smithers.sh/wallet-ae96a38b/qa-walk.git` answered its first request,
 * `info/refs?service=git-upload-pack`, with the site's 404 page, because only
 * /api reached the backend. The backend serves git's smart HTTP at the root
 * (`/{owner}/{repo}.git/...`), so these three endings, and nothing near them,
 * go to it through the same forwarder.
 */
const basic = `Basic ${btoa("x-access-token:smithers_token")}`

test("git discovery reaches the backend with its query and Basic credentials", async () => {
  for (const service of ["git-upload-pack", "git-receive-pack"]) {
    let received: { url: string; method: string; headers: Headers } | undefined
    const origin = backend(request => {
      received = { url: request.url, method: request.method, headers: request.headers }
      return new Response(`# service=${service}\n`, { headers: { "content-type": `application/x-${service}-advertisement` } })
    })
    const response = await edge.fetch(new Request(`https://smithers.sh/wallet-ae96a38b/qa-walk.git/info/refs?service=${service}`, {
      headers: { authorization: basic, "git-protocol": "version=2" }
    }), { ASSETS: assets, SMITHERS_BACKEND_ORIGIN: origin })
    expect(received?.url).toBe(`${origin}/wallet-ae96a38b/qa-walk.git/info/refs?service=${service}`)
    expect(received?.method).toBe("GET")
    expect(received?.headers.get("authorization")).toBe(basic)
    expect(received?.headers.get("git-protocol")).toBe("version=2")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe(`application/x-${service}-advertisement`)
    expect(await response.text()).toBe(`# service=${service}\n`)
  }
})

test("an upload-pack request streams up, gzip intact, and its pack streams back", async () => {
  const pack = Bun.gzipSync(new TextEncoder().encode("0032want 0123456789abcdef0123456789abcdef01234567\n00000009done\n"))
  let sawFirstChunk!: () => void
  const firstChunkArrived = new Promise<void>(resolve => { sawFirstChunk = resolve })
  let finish!: () => void
  let received: { headers: Headers; body: Uint8Array } | undefined
  const origin = backend(async request => {
    const reader = request.body!.getReader()
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      sawFirstChunk()
    }
    received = { headers: request.headers, body: new Uint8Array(Bun.concatArrayBuffers(chunks)) }
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode("0008NAK\n"))
      finish = () => { controller.enqueue(new TextEncoder().encode("0000")); controller.close() }
    } }), { headers: { "content-type": "application/x-git-upload-pack-result" } })
  })
  // The second half is sent only once the backend holds the first: an edge
  // that buffered the request would never deliver it, and this would time out.
  const body = new ReadableStream<Uint8Array>({ async start(controller) {
    controller.enqueue(pack.slice(0, 8))
    await firstChunkArrived
    controller.enqueue(pack.slice(8))
    controller.close()
  } })
  const response = await edge.fetch(new Request("https://smithers.sh/wallet-ae96a38b/qa-walk.git/git-upload-pack", {
    method: "POST", body, duplex: "half",
    headers: { authorization: basic, "content-type": "application/x-git-upload-pack-request", "content-encoding": "gzip", "git-protocol": "version=2" }
  } as RequestInit), { ASSETS: assets, SMITHERS_BACKEND_ORIGIN: origin })
  expect(received?.headers.get("content-encoding")).toBe("gzip")
  expect(received?.headers.get("content-type")).toBe("application/x-git-upload-pack-request")
  expect(received?.headers.get("git-protocol")).toBe("version=2")
  expect(received?.body).toEqual(pack)
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toBe("application/x-git-upload-pack-result")
  const reader = response.body!.getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("0008NAK\n")
  finish()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("0000")
  expect((await reader.read()).done).toBe(true)
})

test("the backend's 401 and its Basic challenge reach git unchanged, with no page in their place", async () => {
  let assetReads = 0
  const ASSETS = { fetch: async () => { assetReads++; return new Response("<h1>Page not found</h1>", { status: 404, headers: { "content-type": "text/html" } }) } }
  for (const [status, challenge] of [[401, 'Basic realm="Smithers Git"'], [404, null]] as const) {
    const origin = backend(() => new Response(status === 401 ? "authentication required\n" : "repository not found\n", {
      status, headers: { "content-type": "text/plain; charset=utf-8", ...(challenge === null ? {} : { "www-authenticate": challenge }) }
    }))
    const response = await edge.fetch(new Request("https://smithers.sh/alice/private.git/git-receive-pack", {
      method: "POST", body: "0000", headers: { "content-type": "application/x-git-receive-pack-request" }
    }), { ASSETS, SMITHERS_BACKEND_ORIGIN: origin })
    expect(response.status).toBe(status)
    expect(response.headers.get("www-authenticate")).toBe(challenge)
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8")
    expect(response.headers.has("cross-origin-embedder-policy")).toBe(false)
    expect(await response.text()).toBe(status === 401 ? "authentication required\n" : "repository not found\n")
  }
  expect(assetReads).toBe(0)
})

test("a git request leaves the browser session and forged proxy identity behind", async () => {
  let received: Headers | undefined
  const origin = backend(request => { received = request.headers; return new Response("0000") })
  await edge.fetch(new Request("https://smithers.sh/alice/demo.git/git-receive-pack", {
    method: "POST", body: "0000",
    headers: { cookie: "__Host-smithers_session=session; smithers_csrf=csrf", authorization: basic, "x-user-id": "999", "x-forwarded-for": "1.2.3.4" }
  }), { ASSETS: assets, SMITHERS_BACKEND_ORIGIN: origin })
  expect(received?.has("cookie")).toBe(false)
  expect(received?.get("authorization")).toBe(basic)
  for (const key of ["x-user-id", "x-forwarded-for"]) expect(received?.has(key)).toBe(false)
})

test("only the smart-HTTP endings are forwarded; the repository page and every near miss are not", async () => {
  let calls = 0
  const origin = backend(() => { calls++; return new Response("backend") })
  const { ASSETS, seen } = appDocumentProbe()
  const page = await edge.fetch(new Request("https://smithers.sh/roninjin10/e2e-verify"), { ASSETS, SMITHERS_BACKEND_ORIGIN: origin })
  expect(page.status).toBe(200)
  expect(seen.at(-1)).toBe("/smithersai/smithers/")
  for (const [method, path] of [
    ["GET", "/alice/demo.git/other"],
    ["GET", "/alice/demo.git/info/refs"],
    ["GET", "/alice/demo.git/info/refs?service=git-upload-archive"],
    ["GET", "/alice/demo.git/info/refs/?service=git-upload-pack"],
    ["GET", "/alice/demo/info/refs?service=git-upload-pack"],
    ["GET", "/org/alice/demo.git/info/refs?service=git-upload-pack"],
    ["GET", "/alice/.git/info/refs?service=git-upload-pack"],
    ["POST", "/alice/demo.git/info/refs?service=git-upload-pack"],
    ["GET", "/alice/demo.git/git-upload-pack"],
    ["PUT", "/alice/demo.git/git-receive-pack"],
    ["POST", "/alice/demo.git/git-receive-pack/x"]
  ] as const) {
    const response = await edge.fetch(new Request(`https://smithers.sh${path}`, { method }), { ASSETS: assets, SMITHERS_BACKEND_ORIGIN: origin })
    expect({ method, path, status: response.status }).toEqual({ method, path, status: 404 })
  }
  expect(calls).toBe(0)
})

/*
 * The backend answers a push only after it has read and run the whole pack,
 * and bounds that itself. The API's wait for headers would cut every push that
 * takes longer, so a git request waits past it; the edge's own deadline is a
 * backstop that still answers 504.
 */
test("a push outlasts the API's header deadline and still has a backstop", async () => {
  const pending = Layer.succeed(Transport, transportFrom(() => new Promise<Response>(() => {})))
  const run = (path: string) => Effect.runPromise(Effect.gen(function* () {
    const fiber = yield* handleEdgeRequest(new Request(`https://smithers.sh${path}`, { method: "POST", body: "0000" }), "https://backend.test")
      .pipe(Effect.provide(Layer.mergeAll(pending, edgeAssets(assets), Layer.succeed(RepositorySites, { resolve: () => Effect.succeed(undefined), content: () => Effect.succeed(new Response(null, { status: 404 })) }))), Effect.forkChild)
    yield* TestClock.adjust(DEFAULT_UPSTREAM_TIMEOUT_MS + 1)
    const afterApiDeadline = fiber.pollUnsafe()
    yield* TestClock.adjust(GIT_UPSTREAM_TIMEOUT_MS)
    const response = yield* Fiber.join(fiber)
    return { settledAtApiDeadline: afterApiDeadline !== undefined, status: response.status }
  }).pipe(Effect.provide(TestClock.layer())))
  expect(await run("/api/agent/turn")).toEqual({ settledAtApiDeadline: true, status: 504 })
  expect(await run("/alice/demo.git/git-receive-pack")).toEqual({ settledAtApiDeadline: false, status: 504 })
})
