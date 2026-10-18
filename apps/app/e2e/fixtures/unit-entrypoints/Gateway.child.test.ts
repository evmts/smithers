import { expect, mock, test } from "bun:test"
import { mkdtemp, writeFile, rm, mkdir, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"

let nativeCalls = 0
mock.module("../../../src/bun/NativeBackendProcess", () => ({ startNativeBackend: () => { nativeCalls++; throw new Error("Go must not start") } }))
const logs: string[] = []
const original = console.log
console.log = (value) => { logs.push(String(value)) }

test("gateway entrypoint uses the token file, binds health, and never spawns Go", async () => {
  const root = await mkdtemp(join(tmpdir(), "gateway-entrypoint-"))
  const cwd = process.cwd()
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 16)
  const token = "server-only-credential"
  const seen: string[] = []
  const serve = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async (req) => {
    if (new URL(req.url).pathname === "/health") return Response.json({ workspaceHash: hash, gatewayId: "cli-test", protocolVersion: "1" })
    seen.push(req.headers.get("authorization") ?? "")
    const body = JSON.parse(await req.text())
    return Response.json({ _tag: "Exit", requestId: body.id, exit: { _tag: "Success", value: { items: [] } } })
  } })
  try {
    await writeFile(join(root, "token"), token, { mode: 0o600 })
    await mkdir(join(root, "dist"))
    await writeFile(join(root, "dist/index.html"), "<!doctype html><head></head>")
    await symlink(join(root, "token"), join(root, "dist/credential-alias"))
    process.chdir(root)
    process.argv.push("--root", root, "--gateway", `http://127.0.0.1:${serve.port}`, "--gateway-token-file", join(root, "token"), "--dist", join(root, "dist"), "--origin", "http://localhost:0")
    const entry = import("../../../src/bun/serve")
    const until = Date.now() + 8000
    while (!logs.some((line) => line.startsWith("SMITHERS_LOCAL_ORIGIN=")) && Date.now() < until) await Bun.sleep(20)
    const origin = logs.find((line) => line.startsWith("SMITHERS_LOCAL_ORIGIN="))?.split("=")[1]
    expect(origin).toMatch(/^http:\/\/localhost:/)
    const html = await (await fetch(origin!)).text()
    const session = html.match(/name="smithers-local-session" content="([^"]+)"/)?.[1]
    expect(session).toBeDefined()
    const api = (path: string, body?: unknown) => fetch(`${origin}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "x-smithers-local-session": session!, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const bootstrap = await (await api("/api/bootstrap")).json()
    const repo = bootstrap.gateway.repo
    expect(bootstrap.gateway.workspaceId).toBe(hash)
    expect((await fetch(`${origin}/api/user`)).status).toBe(401)
    expect((await fetch(`${origin}/api/user`, { headers: { "x-smithers-local-session": session!, origin: "http://localhost:9999" } })).status).toBe(403)
    expect(await (await api("/api/user")).json()).toMatchObject({ username: "local-operator", display_name: "Local operator" })
    for (const path of ["repos", "orgs", "workspaces"]) expect((await api(`/api/user/${path}`)).status).toBe(409)
    expect((await api("/api/live")).status).toBe(409)
    expect(await (await api("/api/workflow/provision", { repo })).json()).toEqual({ status: "ready", workspaceId: hash, gatewayId: "cli-test" })
    expect((await api("/api/workflow/provision", { repo: "other/repo" })).status).toBe(400)
    expect((await api("/api/workflow/rpc", { repo, workspaceId: hash, procedure: "List", payload: { _tag: "runs" } })).status).toBe(200)
    expect(seen).toEqual([`Bearer ${token}`])
    expect(nativeCalls).toBe(0)
    expect(html).not.toContain(token)
    expect(JSON.stringify(bootstrap)).not.toContain(token)
    expect(logs.join("\n")).not.toContain(token)
    for (const path of ["/token", "/credential-alias"]) expect((await fetch(origin! + path)).status).toBe(404)
    process.emit("SIGTERM")
    await entry
  } finally {
    console.log = original
    process.chdir(cwd)
    await serve.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, 12000)
