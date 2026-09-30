import { afterEach, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startNativeRendererServer } from "./NativeRendererServer"

const close: Array<() => void> = []
afterEach(() => {
  for (const stop of close.splice(0)) stop()
})

const persistentRendererFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "smithers-native-persistence-"))
  close.push(() => rmSync(root, { recursive: true, force: true }))
  const dist = join(root, "dist")
  mkdirSync(dist)
  writeFileSync(join(dist, "index.html"), "<body>native</body>")
  const state = join(root, "state")
  const launch = (origin: string, token = "") => {
    const native = startNativeRendererServer(dist, origin, token, state)
    close.push(native.stop)
    return native
  }
  return { root, dist, state, launch, file: join(state, "renderer", "state.json") }
}

test("persistent renderer refuses an occupied identity and recovers the same origin", async () => {
  const fixture = persistentRendererFixture()
  const backend = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("backend") })
  close.push(() => backend.stop(true))
  const first = fixture.launch(backend.url.origin)
  const identity = first.origin
  first.stop()
  const occupant = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(new URL(identity).port),
    fetch: () => new Response("occupied")
  })
  close.push(() => occupant.stop(true))
  const before = readFileSync(fixture.file)
  expect(() => fixture.launch(backend.url.origin)).toThrow()
  expect(readFileSync(fixture.file)).toEqual(before)
  expect(await (await fetch(identity)).text()).toBe("occupied")
  occupant.stop(true)
  const recovered = fixture.launch(backend.url.origin)
  expect(recovered.origin).toBe(identity)
  expect(await (await fetch(identity)).text()).toContain("native")
})

test("persistent renderer isolates backend origins and account tokens across restart", async () => {
  const fixture = persistentRendererFixture()
  const createBackend = (name: string) =>
    Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        const account = request.headers.get("authorization")?.endsWith("private-token-b") ? "B" : "A"
        if (new URL(request.url).pathname === "/api/login") {
          return new Response("login", {
            headers: { "set-cookie": `smithers_session=${name}_${account}; HttpOnly; Path=/; Max-Age=3600` }
          })
        }
        return Response.json({ cookie: request.headers.get("cookie") })
      }
    })
  const a = createBackend("first")
  const b = createBackend("second")
  close.push(() => a.stop(true), () => b.stop(true))
  const first = fixture.launch(a.url.origin, "private-token-a")
  await (await fetch(`${first.origin}/api/login`, { headers: { authorization: "Bearer private-token-a" } })).text()
  first.setTarget(a.url.origin, "private-token-b")
  expect(await (await fetch(`${first.origin}/api/user`)).json()).toEqual({ cookie: null })
  await (await fetch(`${first.origin}/api/login`, { headers: { authorization: "Bearer private-token-b" } })).text()
  first.setTarget(b.url.origin, "private-token-a")
  expect(await (await fetch(`${first.origin}/api/user`)).json()).toEqual({ cookie: null })
  await (await fetch(`${first.origin}/api/login`, { headers: { authorization: "Bearer private-token-a" } })).text()
  first.stop()
  const restarted = fixture.launch(a.url.origin, "private-token-a")
  expect(await (await fetch(`${restarted.origin}/api/user`)).json()).toEqual({ cookie: "smithers_session=first_A" })
  restarted.setTarget(a.url.origin, "private-token-b")
  expect(await (await fetch(`${restarted.origin}/api/user`)).json()).toEqual({ cookie: "smithers_session=first_B" })
  restarted.setTarget(b.url.origin, "private-token-a")
  expect(await (await fetch(`${restarted.origin}/api/user`)).json()).toEqual({ cookie: "smithers_session=second_A" })
  const stored = readFileSync(fixture.file, "utf8")
  expect(stored).not.toContain("private-token-a")
  expect(stored).not.toContain("private-token-b")
  expect(stored).not.toContain(a.url.origin)
  expect(statSync(fixture.file).mode & 0o777).toBe(0o600)
  expect(statSync(join(fixture.state, "renderer")).mode & 0o777).toBe(0o700)
  const presentation = await (await fetch(`${restarted.origin}/renderer/state.json`)).text()
  expect(presentation).toContain("native")
  expect(presentation).not.toContain("smithers_session")
  expect(presentation).not.toContain("private-token")
})

test("persistent renderer keeps session-only cookies in memory and forgets expired cookies", async () => {
  const fixture = persistentRendererFixture()
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      if (new URL(request.url).pathname === "/api/login") {
        const headers = new Headers()
        headers.append("set-cookie", "session_only=memory; Path=/")
        headers.append("set-cookie", "expired=old; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
        headers.append("set-cookie", "persistent=live; Path=/; Max-Age=3600")
        return new Response("login", { headers })
      }
      return Response.json({ cookie: request.headers.get("cookie") })
    }
  })
  close.push(() => backend.stop(true))
  const first = fixture.launch(backend.url.origin)
  await (await fetch(`${first.origin}/api/login`)).text()
  expect(await (await fetch(`${first.origin}/api/user`)).json()).toEqual({
    cookie: "session_only=memory; persistent=live"
  })
  expect(readFileSync(fixture.file, "utf8")).not.toContain("memory")
  expect(readFileSync(fixture.file, "utf8")).not.toContain("old")
  first.stop()
  const restarted = fixture.launch(backend.url.origin)
  expect(await (await fetch(`${restarted.origin}/api/user`)).json()).toEqual({ cookie: "persistent=live" })
})

test("a session expiring while native is open is omitted from requests and restart", async () => {
  const fixture = persistentRendererFixture()
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      if (new URL(request.url).pathname === "/api/login") {
        return new Response("login", {
          headers: { "set-cookie": "smithers_session=expiring-private; Path=/; Max-Age=60" }
        })
      }
      return Response.json({ cookie: request.headers.get("cookie") })
    }
  })
  close.push(() => backend.stop(true))
  const native = fixture.launch(backend.url.origin)
  await (await fetch(`${native.origin}/api/login`)).text()
  expect(await (await fetch(`${native.origin}/api/user`)).json()).toEqual({
    cookie: "smithers_session=expiring-private"
  })
  // Controlled clock boundary avoids a wall-clock sleep; HTTP and filesystem remain real.
  const originalNow = Date.now
  const afterExpiry = originalNow() + 61_000
  Date.now = () => afterExpiry
  try {
    expect(await (await fetch(`${native.origin}/api/user`)).json()).toEqual({ cookie: null })
    native.stop()
    const restarted = fixture.launch(backend.url.origin)
    expect(await (await fetch(`${restarted.origin}/api/user`)).json()).toEqual({ cookie: null })
    expect(readFileSync(fixture.file, "utf8")).not.toContain("expiring-private")
  } finally {
    Date.now = originalNow
  }
})

test("backend revocation remains refused and explicit logout survives native restart", async () => {
  const fixture = persistentRendererFixture()
  let revoked = false
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const path = new URL(request.url).pathname
      if (path === "/api/login") {
        return new Response("login", {
          headers: { "set-cookie": "smithers_session=revocable; HttpOnly; Path=/; Max-Age=3600" }
        })
      }
      if (path === "/api/logout") {
        return new Response("logout", {
          headers: { "set-cookie": "smithers_session=; HttpOnly; Path=/; Max-Age=0" }
        })
      }
      return new Response("identity", {
        status: !revoked && request.headers.get("cookie")?.includes("revocable") ? 200 : 401
      })
    }
  })
  close.push(() => backend.stop(true))
  const first = fixture.launch(backend.url.origin)
  await (await fetch(`${first.origin}/api/login`)).text()
  first.stop()
  revoked = true
  const revokedRenderer = fixture.launch(backend.url.origin)
  expect((await fetch(`${revokedRenderer.origin}/api/user`)).status).toBe(401)
  revokedRenderer.stop()
  revoked = false
  const signedIn = fixture.launch(backend.url.origin)
  expect((await fetch(`${signedIn.origin}/api/user`)).status).toBe(200)
  expect(await (await fetch(`${signedIn.origin}/api/logout`)).text()).toBe("logout")
  expect(readFileSync(fixture.file, "utf8")).not.toContain("revocable")
  signedIn.stop()
  const signedOut = fixture.launch(backend.url.origin)
  expect((await fetch(`${signedOut.origin}/api/user`)).status).toBe(401)
})

test.each(["malformed", "public-file", "symlink"])(
  "persistent renderer refuses %s state without replacing it",
  (kind) => {
    const fixture = persistentRendererFixture()
    mkdirSync(join(fixture.state, "renderer"), { recursive: true, mode: 0o700 })
    const target = join(fixture.root, "unrelated")
    writeFileSync(target, "unrelated", { mode: 0o600 })
    if (kind === "symlink") symlinkSync(target, fixture.file)
    else writeFileSync(fixture.file, "not valid renderer state", { mode: kind === "public-file" ? 0o644 : 0o600 })
    const before = readFileSync(fixture.file)
    expect(() => fixture.launch("http://127.0.0.1:1")).toThrow()
    expect(readFileSync(fixture.file)).toEqual(before)
    expect(readFileSync(target, "utf8")).toBe("unrelated")
  }
)

test.each(["login", "logout"])(
  "failed persistent %s refuses success and retains the prior session",
  async (operation) => {
    const fixture = persistentRendererFixture()
    const backend = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        const path = new URL(request.url).pathname
        if (path === "/api/login") {
          return new Response("login succeeded", {
            headers: { "set-cookie": "smithers_session=durable; HttpOnly; Path=/; Max-Age=3600" }
          })
        }
        if (path === "/api/logout") {
          return new Response("logout succeeded", {
            headers: { "set-cookie": "smithers_session=; HttpOnly; Path=/; Max-Age=0" }
          })
        }
        return Response.json({ cookie: request.headers.get("cookie") })
      }
    })
    close.push(() => backend.stop(true))
    const first = fixture.launch(backend.url.origin)
    if (operation === "logout") await (await fetch(`${first.origin}/api/login`)).text()
    const before = readFileSync(fixture.file)
    chmodSync(join(fixture.state, "renderer"), 0o755)
    const refused = await fetch(`${first.origin}/api/${operation}`)
    expect(refused.status).toBe(503)
    expect(refused.headers.getSetCookie().join(";")).not.toContain("durable")
    expect(await refused.text()).not.toContain("succeeded")
    expect(readFileSync(fixture.file)).toEqual(before)
    expect(await (await fetch(`${first.origin}/api/user`)).json()).toEqual({
      cookie: operation === "logout" ? "smithers_session=durable" : null
    })
    chmodSync(join(fixture.state, "renderer"), 0o700)
    first.stop()
    const restarted = fixture.launch(backend.url.origin)
    expect(await (await fetch(`${restarted.origin}/api/user`)).json()).toEqual({
      cookie: operation === "logout" ? "smithers_session=durable" : null
    })
  }
)

test("a login response released after native shutdown cannot restore a late session", async () => {
  const fixture = persistentRendererFixture()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      if (new URL(request.url).pathname !== "/api/login") {
        return Response.json({ cookie: request.headers.get("cookie") })
      }
      entered.resolve()
      await release.promise
      completed.resolve()
      return new Response("late login", {
        headers: { "set-cookie": "smithers_session=late-private; HttpOnly; Path=/; Max-Age=3600" }
      })
    }
  })
  close.push(() => backend.stop(true))
  const first = fixture.launch(backend.url.origin)
  const pending = fetch(`${first.origin}/api/login`).then((response) => response.text()).catch(() =>
    "connection closed"
  )
  await entered.promise
  first.stop()
  first.stop()
  release.resolve()
  await completed.promise
  expect(await pending).not.toBe("late login")
  expect(readFileSync(fixture.file, "utf8")).not.toContain("late-private")
  const restarted = fixture.launch(backend.url.origin)
  expect(restarted.origin).toBe(first.origin)
  expect(await (await fetch(`${restarted.origin}/api/user`)).json()).toEqual({ cookie: null })
})

test("native renderer restores its origin and persistent backend session after restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "smithers-native-restored-"))
  close.push(() => rmSync(root, { recursive: true, force: true }))
  const dist = join(root, "dist")
  mkdirSync(dist)
  writeFileSync(join(dist, "index.html"), "<body>native</body>")
  const seen: Array<{ cookie: string | null; csrf: string | null }> = []
  // Controlled HTTP cookie issuer: this tests the relay's persistence, not backend authentication.
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const path = new URL(request.url).pathname
      if (path === "/api/login") {
        const headers = new Headers()
        headers.append("set-cookie", "smithers_session=private-restored-session; HttpOnly; Path=/; Max-Age=3600")
        headers.append("set-cookie", "__csrf=restored-csrf; Path=/; Max-Age=3600")
        return new Response("signed in", { headers })
      }
      seen.push({ cookie: request.headers.get("cookie"), csrf: request.headers.get("x-csrf-token") })
      return Response.json({
        signedIn: request.headers.get("cookie")?.includes("smithers_session=private-restored-session") ?? false
      })
    }
  })
  close.push(() => backend.stop(true))
  const launch = startNativeRendererServer
  const first = launch(dist, backend.url.origin, "", join(root, "state"))
  close.push(first.stop)
  const login = await fetch(`${first.origin}/api/login`)
  expect(login.headers.getSetCookie()).toEqual(["__csrf=restored-csrf; Path=/; SameSite=Strict; Max-Age=3600"])
  expect(await login.text()).toBe("signed in")
  first.stop()
  const restarted = launch(dist, backend.url.origin, "", join(root, "state"))
  close.push(restarted.stop)
  const restored = await fetch(`${restarted.origin}/api/user`)
  expect(await restored.json()).toEqual({ signedIn: true })
  expect(restarted.origin).toBe(first.origin)
  expect(restored.headers.getSetCookie()[0]).toStartWith("__csrf=restored-csrf; Path=/; SameSite=Strict; Max-Age=")
  expect(restored.headers.getSetCookie().join(";")).not.toContain("private-restored-session")
  await fetch(`${restarted.origin}/api/mutate`, { method: "POST", headers: { "x-csrf-token": "restored-csrf" } })
  expect(seen).toEqual([
    { cookie: "smithers_session=private-restored-session; __csrf=restored-csrf", csrf: null },
    { cookie: "smithers_session=private-restored-session; __csrf=restored-csrf", csrf: "restored-csrf" }
  ])
})

test("packaged Plue window serves its UI and forwards authenticated product API calls", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-plue-ui-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  mkdirSync(join(dist, "assets"))
  writeFileSync(join(dist, "index.html"), "<html><body>packaged UI</body></html>")
  writeFileSync(join(dist, "assets", "main.js"), "window.packaged = true")
  const seen: Array<{ path: string; auth: string | null; body: string }> = []
  const remote = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async (request) => {
    seen.push({ path: new URL(request.url).pathname, auth: request.headers.get("authorization"), body: await request.text() })
    return Response.json({ buildSha: "remote", capabilities: ["identity"] })
  } })
  close.push(() => remote.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${remote.port}`, "owner-token")
  close.push(native.stop)

  expect(await (await fetch(`${native.origin}/owner/repo`)).text()).toContain("packaged UI")
  expect(await (await fetch(`${native.origin}/assets/main.js`)).text()).toBe("window.packaged = true")
  const response = await fetch(`${native.origin}/api/bootstrap`, { headers: { authorization: "Bearer owner-token" } })
  expect(response.status).toBe(200)
  // The shell's one addition: the backend is a web origin; only this relay knows the desktop shell shows its page.
  expect(await response.json()).toEqual({ buildSha: "remote", capabilities: ["identity", "native.shell"] })
  const mutation = await fetch(`${native.origin}/api/issues`, { method: "POST", headers: {
    authorization: "Bearer owner-token", "content-type": "application/json"
  }, body: JSON.stringify({ title: "Native issue" }) })
  expect(mutation.status).toBe(200)
  expect(seen).toEqual([
    { path: "/api/bootstrap", auth: "Bearer owner-token", body: "" },
    { path: "/api/issues", auth: "Bearer owner-token", body: '{"title":"Native issue"}' }
  ])
  expect(() => startNativeRendererServer(dist, "file:///private/backend")).toThrow("Native API origin")
})

test("native UI stays available when the selected backend has no bootstrap", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-missing-bootstrap-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div id='root'>packaged UI</div>")
  const remote = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("404", { status: 404 }) })
  close.push(() => remote.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${remote.port}`)
  close.push(native.stop)
  expect(await (await fetch(`${native.origin}/`)).text()).toContain("packaged UI")
  expect((await fetch(`${native.origin}/api/bootstrap`)).status).toBe(404)
  const ready = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ apiVersion: 1 }) })
  close.push(() => ready.stop(true))
  native.setTarget(`http://127.0.0.1:${ready.port}`)
  // A document without a capability list is not a bootstrap this relay can decorate; it passes through.
  expect(await (await fetch(`${native.origin}/api/bootstrap`)).json()).toEqual({ apiVersion: 1 })
  expect(() => native.setTarget("file:///private/backend")).toThrow("Native API origin")
  expect(await (await fetch(`${native.origin}/api/bootstrap`)).json()).toEqual({ apiVersion: 1 })
})

test("the relay marks the selected backend's bootstrap as the desktop shell's and nothing else", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-shell-row-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div id='root'>packaged UI</div>")
  // The owned Go backend's self-host answer: a web origin (`host: "cloud"`) with owner credentials.
  const selfHost = { apiVersion: 1, host: "cloud", version: "dev", buildSha: "abc", capabilities: ["identity", "cloud"], authFlow: "credentials", sandbox: { platform: "darwin", mode: "trusted-only" } }
  const remote = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => {
    const url = new URL(request.url)
    if (url.pathname !== "/api/bootstrap") return Response.json({ capabilities: ["not-a-bootstrap"] })
    return request.method === "GET" ? Response.json(selfHost) : new Response("method not allowed", { status: 405 })
  } })
  close.push(() => remote.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${remote.port}`)
  close.push(native.stop)
  const relayed = await fetch(`${native.origin}/api/bootstrap`)
  expect(relayed.headers.get("content-type")).toBe("application/json")
  expect(await relayed.json()).toEqual({ ...selfHost, capabilities: ["identity", "cloud", "native.shell"] })
  // Idempotent, and confined to the bootstrap document: another route's `capabilities` field is not the shell's to edit.
  expect(await (await fetch(`${native.origin}/api/bootstrap`)).json()).toEqual({ ...selfHost, capabilities: ["identity", "cloud", "native.shell"] })
  expect(await (await fetch(`${native.origin}/api/other`)).json()).toEqual({ capabilities: ["not-a-bootstrap"] })
  expect((await fetch(`${native.origin}/api/bootstrap`, { method: "POST" })).status).toBe(405)
})

test("packaged Plue window relays a compressed backend response as readable JSON", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-compressed-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div id='root'>packaged UI</div>")
  // A CDN in front of Plue gzips API responses; fetch decodes the body, so the
  // relay must not keep advertising the original encoding.
  const remote = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(Bun.gzipSync(JSON.stringify({ buildSha: "compressed" })), {
    headers: { "content-type": "application/json", "content-encoding": "gzip" }
  }) })
  close.push(() => remote.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${remote.port}`)
  close.push(native.stop)
  const response = await fetch(`${native.origin}/api/bootstrap`, { headers: { "accept-encoding": "gzip" } })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ buildSha: "compressed" })
})

test("packaged terminal WebSocket reaches the selected backend with its owner session", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-terminal-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div>packaged UI</div>")
  const seen: Array<{ path: string; origin: string | null; cookie: string | null }> = []
  const remote = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request, server) {
      const url = new URL(request.url)
      if (url.pathname === "/api/login") return new Response("signed in", {
        headers: { "set-cookie": "smithers_session=owner; HttpOnly; Path=/" }
      })
      seen.push({ path: url.pathname + url.search, origin: request.headers.get("origin"), cookie: request.headers.get("cookie") })
      if (request.headers.get("origin") !== `http://127.0.0.1:${server.port}` ||
        request.headers.get("cookie") !== "smithers_session=owner") return new Response("Forbidden", { status: 403 })
      return server.upgrade(request) ? undefined : new Response("Upgrade required", { status: 426 })
    },
    websocket: { message(socket, message) { socket.send(message) } }
  })
  close.push(() => remote.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${remote.port}`)
  close.push(native.stop)
  await fetch(`${native.origin}/api/login`)

  const response = await new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(`${native.origin.replace("http:", "ws:")}/api/repos/owner/repo/workspace/sessions/session/terminal?ticket=owner`, {
      headers: { origin: native.origin, cookie: "smithers_session=owner" }
    } as never)
    socket.addEventListener("open", () => socket.send("native terminal"))
    socket.addEventListener("message", (event) => { resolve(String(event.data)); socket.close() })
    socket.addEventListener("error", () => reject(new Error("terminal WebSocket failed")))
    socket.addEventListener("close", () => reject(new Error("terminal WebSocket closed before output")))
  })
  expect(response).toBe("native terminal")
  expect(seen).toEqual([{ path: "/api/repos/owner/repo/workspace/sessions/session/terminal?ticket=owner",
    origin: `http://127.0.0.1:${remote.port}`, cookie: "smithers_session=owner" }])
})

test("switching native backends isolates HTTP and WebSocket sessions and restores the selected jar", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-session-switch-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div>packaged UI</div>")
  const seen: Array<{ backend: string; transport: string; cookie: string | null }> = []
  const backend = (name: string) => Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request, server) {
      const cookie = request.headers.get("cookie")
      if (request.headers.get("upgrade") === "websocket") {
        seen.push({ backend: name, transport: "websocket", cookie })
        return server.upgrade(request) ? undefined : new Response("Upgrade required", { status: 426 })
      }
      seen.push({ backend: name, transport: "http", cookie })
      if (new URL(request.url).pathname === "/api/login") {
        return new Response("signed in", { headers: { "set-cookie": `smithers_session=${name}_SESSION; HttpOnly; Path=/` } })
      }
      return Response.json({ backend: name })
    },
    websocket: { message(socket, message) { socket.send(message) } }
  })
  const a = backend("A")
  const b = backend("B")
  close.push(() => a.stop(true), () => b.stop(true))
  const aOrigin = `http://127.0.0.1:${a.port}`
  const bOrigin = `http://127.0.0.1:${b.port}`
  const native = startNativeRendererServer(dist, aOrigin)
  close.push(native.stop)
  const rendererCookie = "smithers_session=A_SESSION"
  const http = () => fetch(`${native.origin}/api/identity`, { headers: { cookie: rendererCookie } })
  const socket = () => new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`${native.origin.replace("http:", "ws:")}/api/terminal`, {
      headers: { origin: native.origin, cookie: rendererCookie }
    } as never)
    ws.addEventListener("open", () => ws.send("ping"))
    ws.addEventListener("message", () => { resolve(); ws.close() })
    ws.addEventListener("error", () => reject(new Error("native WebSocket failed")))
    ws.addEventListener("close", (event) => reject(new Error(`native WebSocket closed before output: ${event.code}; ${JSON.stringify(seen)}`)))
  })

  const login = await fetch(`${native.origin}/api/login`)
  expect(login.headers.get("set-cookie")).not.toContain("A_SESSION")
  expect(await login.text()).toBe("signed in")
  await http()
  await socket()
  native.setTarget(bOrigin)
  await http()
  await socket()
  native.setTarget(aOrigin)
  await http()
  await socket()
  expect(seen).toEqual([
    { backend: "A", transport: "http", cookie: null },
    { backend: "A", transport: "http", cookie: rendererCookie },
    { backend: "A", transport: "websocket", cookie: rendererCookie },
    { backend: "B", transport: "http", cookie: null },
    { backend: "B", transport: "websocket", cookie: null },
    { backend: "A", transport: "http", cookie: rendererCookie },
    { backend: "A", transport: "websocket", cookie: rendererCookie }
  ])
})

test("native relay keeps CSRF paired with its backend session", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-csrf-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div>packaged UI</div>")
  const seen: Array<{ backend: string; cookie: string | null; csrf: string | null }> = []
  const backend = (name: string) => Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const url = new URL(request.url)
    seen.push({ backend: name, cookie: request.headers.get("cookie"), csrf: request.headers.get("x-csrf-token") })
    if (url.pathname === "/api/login") {
      const headers = new Headers()
      headers.append("set-cookie", `smithers_session=${name}_SESSION; HttpOnly; Path=/`)
      headers.append("set-cookie", `__csrf=${name}_CSRF; Path=/; SameSite=Strict`)
      return new Response("signed in", { headers })
    }
    return Response.json({ backend: name })
  } })
  const a = backend("A")
  const b = backend("B")
  close.push(() => a.stop(true), () => b.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${a.port}`)
  close.push(native.stop)
  const aLogin = await fetch(`${native.origin}/api/login`)
  expect(aLogin.headers.getSetCookie()).toEqual(["__csrf=A_CSRF; Path=/; SameSite=Strict"])
  await fetch(`${native.origin}/api/mutate`, { method: "POST", headers: { "x-csrf-token": "A_CSRF" } })
  native.setTarget(`http://127.0.0.1:${b.port}`)
  const bFirst = await fetch(`${native.origin}/api/mutate`, { method: "POST", headers: {
    cookie: "smithers_session=A_SESSION; __csrf=A_CSRF", "x-csrf-token": "A_CSRF"
  } })
  expect(bFirst.headers.get("set-cookie")).toContain("Max-Age=0")
  const bLogin = await fetch(`${native.origin}/api/login`)
  expect(bLogin.headers.getSetCookie()).toEqual(["__csrf=B_CSRF; Path=/; SameSite=Strict"])
  await fetch(`${native.origin}/api/mutate`, { method: "POST", headers: { "x-csrf-token": "B_CSRF" } })
  native.setTarget(`http://127.0.0.1:${a.port}`)
  const aBack = await fetch(`${native.origin}/api/identity`)
  expect(aBack.headers.get("set-cookie")).toContain("__csrf=A_CSRF")
  expect(seen).toEqual([
    { backend: "A", cookie: null, csrf: null },
    { backend: "A", cookie: "smithers_session=A_SESSION; __csrf=A_CSRF", csrf: "A_CSRF" },
    { backend: "B", cookie: null, csrf: null },
    { backend: "B", cookie: null, csrf: null },
    { backend: "B", cookie: "smithers_session=B_SESSION; __csrf=B_CSRF", csrf: "B_CSRF" },
    { backend: "A", cookie: "smithers_session=A_SESSION; __csrf=A_CSRF", csrf: null }
  ])
})

test("a stale renderer bearer is not sent to the next backend", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-token-switch-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div>packaged UI</div>")
  const seen: Array<{ backend: string; transport: string; authorization: string | null }> = []
  const backend = (name: string) => Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch(request, server) {
      seen.push({ backend: name, transport: request.headers.get("upgrade") === "websocket" ? "websocket" : "http",
        authorization: request.headers.get("authorization") })
      return request.headers.get("upgrade") === "websocket"
        ? server.upgrade(request) ? undefined : new Response("Upgrade required", { status: 426 })
        : new Response("ok")
    }, websocket: { message(socket, message) { socket.send(message) } }
  })
  const a = backend("A")
  const b = backend("B")
  close.push(() => a.stop(true), () => b.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${a.port}`, "A_TOKEN")
  close.push(native.stop)
  const http = (authorization: string) => fetch(`${native.origin}/api/identity`, { headers: { authorization } })
  const socket = (authorization: string) => new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`${native.origin.replace("http:", "ws:")}/api/terminal`, {
      headers: { origin: native.origin, authorization }
    } as never)
    ws.addEventListener("open", () => ws.send("ping"))
    ws.addEventListener("message", () => { resolve(); ws.close() })
    ws.addEventListener("error", () => reject(new Error("token WebSocket failed")))
  })
  await http("Bearer A_TOKEN")
  await socket("Bearer A_TOKEN")
  native.setTarget(`http://127.0.0.1:${b.port}`, "B_TOKEN")
  await http("Bearer A_TOKEN")
  await socket("Bearer A_TOKEN")
  await http("Bearer B_TOKEN")
  await socket("Bearer B_TOKEN")
  expect(seen).toEqual([
    { backend: "A", transport: "http", authorization: "Bearer A_TOKEN" },
    { backend: "A", transport: "websocket", authorization: "Bearer A_TOKEN" },
    { backend: "B", transport: "http", authorization: null },
    { backend: "B", transport: "websocket", authorization: null },
    { backend: "B", transport: "http", authorization: "Bearer B_TOKEN" },
    { backend: "B", transport: "websocket", authorization: "Bearer B_TOKEN" }
  ])
})

test("switching targets closes old tunnels and discards a delayed old response", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-switch-race-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div>packaged UI</div>")
  let entered!: () => void
  let release!: () => void
  const requestEntered = new Promise<void>((resolve) => { entered = resolve })
  const releaseResponse = new Promise<void>((resolve) => { release = resolve })
  const aCookies: Array<string | null> = []
  const a = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request, server) {
    if (request.headers.get("upgrade") === "websocket") {
      return server.upgrade(request) ? undefined : new Response("Upgrade required", { status: 426 })
    }
    aCookies.push(request.headers.get("cookie"))
    entered()
    await releaseResponse
    return new Response("stale A", { headers: { "set-cookie": "smithers_session=LATE_A; Path=/" } })
  }, websocket: { message() {} } })
  const b = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("B") })
  close.push(() => a.stop(true), () => b.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${a.port}`)
  close.push(native.stop)
  const ws = new WebSocket(`${native.origin.replace("http:", "ws:")}/api/terminal`, {
    headers: { origin: native.origin }
  } as never)
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve())
    ws.addEventListener("error", () => reject(new Error("old tunnel did not open")))
  })
  const closed = new Promise<void>((resolve) => ws.addEventListener("close", () => resolve()))
  const slow = fetch(`${native.origin}/api/slow`)
  await requestEntered
  native.setTarget(`http://127.0.0.1:${b.port}`)
  release()
  await closed
  const stale = await slow
  expect(stale.status).toBe(409)
  expect(stale.headers.get("set-cookie")).toBeNull()
  expect(await stale.text()).toBe("Backend changed")
  expect(await (await fetch(`${native.origin}/api/identity`)).text()).toBe("B")
  native.setTarget(`http://127.0.0.1:${a.port}`)
  const back = await fetch(`${native.origin}/api/identity`, { headers: { cookie: "smithers_session=LATE_A" } })
  expect(back.headers.get("set-cookie")).not.toContain("LATE_A")
  expect(aCookies).toEqual([null, null])
})

test("switching targets stops an old streamed response", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-stream-switch-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div>packaged UI</div>")
  let release!: () => void
  const secondChunk = new Promise<void>((resolve) => { release = resolve })
  const a = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(new ReadableStream({
    async start(output) {
      output.enqueue(new TextEncoder().encode("first"))
      await secondChunk
      output.enqueue(new TextEncoder().encode("secret after switch"))
      output.close()
    }
  })) })
  const b = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("B") })
  close.push(() => a.stop(true), () => b.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${a.port}`)
  close.push(native.stop)
  const response = await fetch(`${native.origin}/api/stream`)
  const reader = response.body!.getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("first")
  native.setTarget(`http://127.0.0.1:${b.port}`)
  release()
  try {
    const afterSwitch = await reader.read()
    expect(afterSwitch.value === undefined ? "" : new TextDecoder().decode(afterSwitch.value)).not.toContain("secret")
  } catch (error) {
    expect(String(error)).toContain("Backend changed")
  }
})

test("terminal input survives the first HTTPS upstream handshake", async () => {
  const directory = mkdtempSync(join(tmpdir(), "smithers-native-https-terminal-"))
  try {
    const key = join(directory, "key.pem")
    const cert = join(directory, "cert.pem")
    const generated = Bun.spawnSync([
      "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
      "-out", cert, "-days", "1", "-subj", "/CN=localhost",
      "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"
    ], { stdout: "ignore", stderr: "pipe" })
    expect(generated.exitCode).toBe(0)
    const child = Bun.spawn([Bun.which("bun")!, join(import.meta.dir, "fixtures", "NativeRendererHttpsTerminal.ts")], {
      cwd: join(import.meta.dir, "../../.."),
      env: { ...process.env, NODE_EXTRA_CA_CERTS: cert, SMITHERS_NATIVE_HTTPS_CERT: cert, SMITHERS_NATIVE_HTTPS_KEY: key },
      stdout: "pipe", stderr: "pipe"
    })
    const output = await Promise.race([
      Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]),
      Bun.sleep(10_000).then(() => { child.kill(); throw new Error("HTTPS terminal regression timed out") })
    ])
    expect(output[2], `${output[0]}\n${output[1]}`).toBe(0)
    expect(output[0]).toContain("HTTPS_TERMINAL_OK")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("a DNS-rebound or cross-origin page cannot use the owner's relayed backend session", async () => {
  const dist = mkdtempSync(join(tmpdir(), "smithers-native-rebind-"))
  close.push(() => rmSync(dist, { recursive: true, force: true }))
  writeFileSync(join(dist, "index.html"), "<div>packaged UI</div>")
  const seen: Array<string> = []
  const remote = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => {
    seen.push(new URL(request.url).pathname)
    return new Response("owner data", { headers: { "set-cookie": "smithers_session=owner; HttpOnly; Path=/" } })
  } })
  close.push(() => remote.stop(true))
  const native = startNativeRendererServer(dist, `http://127.0.0.1:${remote.port}`)
  close.push(native.stop)
  const port = new URL(native.origin).port
  // Bun's fetch rewrites Host from the URL, so send the rebound request over node:http.
  const { request } = await import("node:http")
  const send = (headers: Record<string, string>, path = "/api/repos") => new Promise<{ status: number; setCookie: string[] | undefined }>((resolve, reject) => {
    const outgoing = request({ host: "127.0.0.1", port: Number(port), path, headers }, (response) => {
      response.resume()
      resolve({ status: response.statusCode ?? 0, setCookie: response.headers["set-cookie"] })
    })
    outgoing.on("error", reject)
    outgoing.end()
  })
  const rebound = await send({ host: `attacker.example:${port}` })
  expect(rebound.status).toBe(421)
  expect(rebound.setCookie).toBeUndefined()
  expect((await send({ host: `attacker.example:${port}` }, "/")).status).toBe(421)
  const crossOrigin = await send({ host: `127.0.0.1:${port}`, origin: "http://attacker.example" })
  expect(crossOrigin.status).toBe(403)
  expect((await send({ host: `127.0.0.1:${port}`, origin: "null" })).status).toBe(403)
  expect(seen).toEqual([])
  expect((await send({ host: `127.0.0.1:${port}`, origin: native.origin })).status).toBe(200)
  expect((await send({ host: `127.0.0.1:${port}` })).status).toBe(200)
  expect(seen).toEqual(["/api/repos", "/api/repos"])
})
