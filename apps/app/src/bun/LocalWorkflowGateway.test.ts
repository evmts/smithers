import { expect, test } from "bun:test"
import { createLocalWorkflowRelay, connectLocalGateway } from "./LocalWorkflowGateway"

const root = "/tmp/gateway-fixture"
const hash = (await import("node:crypto")).createHash("sha256").update(root).digest("hex").slice(0, 16)
const health = { workspaceHash: hash, gatewayId: "cli-fixture", protocolVersion: "1" }
const config = { url: "http://127.0.0.1:1234", repo: "local/fixture", workspaceId: hash, gatewayId: health.gatewayId, root, operatorToken: "private" }
const request = (body: unknown, path = "/api/workflow/rpc") => new Request(`http://127.0.0.1:4444${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", authorization: "browser", cookie: "private-cookie" } })

test("startup refuses a nonliteral or nonloopback target, missing credential, unreachable serve and mismatched workspace", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises")
  const directory = await mkdtemp("/tmp/gateway-refusal-")
  const tokenFile = directory + "/token"
  try {
    await writeFile(tokenFile, "private", { mode: 0o600 })
    for (const url of ["http://localhost:1", "http://example.com", "http://192.168.1.2", "http://127.0.0.1/rpc", "http://user@127.0.0.1", "http://2130706433"]) {
      await expect(connectLocalGateway({ url, root, repo: config.repo, tokenFile })).rejects.toThrow("loopback")
      expect(() => createLocalWorkflowRelay({ ...config, url }, 1000)).toThrow("loopback")
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
  await expect(connectLocalGateway({ url: config.url, root, repo: config.repo, tokenFile: "/missing" })).rejects.toThrow("token file")
})

test("all unary procedures translate mounts and preserve payloads without forwarding browser credentials", async () => {
  for (const procedure of ["Plan", "Run", "Cancel", "Resume", "Steer", "Signal", "List", "Projection.Snapshot", "Approval.Submit", "Run.Fork", "Run.Verify"]) {
    const payload = { marker: procedure, nested: [true, 1] }
    const relay = createLocalWorkflowRelay(config, 1000, async (url, init) => {
      expect(url.pathname).toBe(procedure.includes(".") ? "/projections" : "/rpc")
      expect(init.redirect).toBe("error")
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer private")
      expect(new Headers(init.headers).get("cookie")).toBeNull()
      expect(new Headers(init.headers).get("origin")).toBeNull()
      expect(JSON.parse(String(init.body))).toEqual({ _tag: "Request", id: 1, tag: procedure, payload, headers: [] })
      return new Response(JSON.stringify({ _tag: "Exit", requestId: 1, exit: { _tag: "Success", value: payload } }) + "\n")
    })
    expect(await (await relay(request({ repo: config.repo, workspaceId: hash, procedure, payload }))).json()).toEqual({ ok: true, payload })
  }
})

test("binding refusals happen before egress, including provision and streams", async () => {
  const relay = createLocalWorkflowRelay(config, 1000, async () => { throw new Error("must not fetch") })
  for (const extra of [{ repo: "wrong/repo" }, { workspaceId: "0123456789abcdef" }]) {
    expect((await relay(request({ repo: config.repo, workspaceId: hash, procedure: "List", payload: {}, ...extra }))).status).toBe(400)
  }
  expect(await (await relay(request({ repo: config.repo }, "/api/workflow/provision"))).json()).toEqual({ status: "ready", workspaceId: hash, gatewayId: health.gatewayId })
  expect((await relay(request({ repo: "wrong/repo" }, "/api/workflow/provision"))).status).toBe(400)
  expect((await relay(request({ repo: config.repo, workspaceId: "wrong" }, "/api/workflow/provision"))).status).toBe(400)
  for (const procedure of ["Watch", "Projection.Subscribe", "toString", "__proto__"]) {
    expect((await relay(request({ repo: config.repo, workspaceId: hash, procedure, payload: {} }))).status).toBe(400)
  }
})

test("preserves typed refusals and fails closed without leaking upstream bodies or errors", async () => {
  const body = { repo: config.repo, workspaceId: hash, procedure: "List", payload: {} }
  const cause = [{ _tag: "Fail", error: { code: "unauthorized" } }, { _tag: "Die", defect: { stack: "private-stack" } }]
  const failed = createLocalWorkflowRelay(config, 1000, async () => new Response(JSON.stringify({ _tag: "Exit", requestId: 1, exit: { _tag: "Failure", cause } })))
  expect(await (await failed(request(body))).json()).toMatchObject({ ok: false, error: { detail: [cause[0]] } })
  for (const response of [new Response("private", { status: 401 }), new Response("private"), new Response("{}")]) {
    const answer = await createLocalWorkflowRelay(config, 1000, async () => response)(request(body))
    expect(answer.status).toBeGreaterThanOrEqual(400)
    expect(await answer.text()).not.toContain("private")
  }
  const answer = await createLocalWorkflowRelay(config, 1000, async () => { throw new Error("private") })(request(body))
  expect(answer.status).toBe(502)
  expect(await answer.text()).not.toContain("private")
})

test("launch checks real health and refuses unreachable or different workspaces", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const directory = await mkdtemp(join(tmpdir(), "gateway-health-"))
  const tokenFile = join(directory, "token")
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json(health) })
  const url = `http://127.0.0.1:${server.port}`
  try {
    await writeFile(tokenFile, "private", { mode: 0o600 })
    expect(await connectLocalGateway({ url, root, repo: config.repo, tokenFile })).toEqual({ ...config, url })
    await expect(connectLocalGateway({ url, root: directory, repo: config.repo, tokenFile })).rejects.toThrow("health does not match")
    await server.stop(true)
    await expect(connectLocalGateway({ url, root, repo: config.repo, tokenFile })).rejects.toThrow("unreachable")
  } finally {
    await server.stop(true)
    await rm(directory, { recursive: true, force: true })
  }
})

test("local API identifies an operator and synthesizes no inventory or catalog", async () => {
  const { localGatewayApi } = await import("./LocalWorkflowGateway")
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const directory = await mkdtemp(join(tmpdir(), "gateway-catalog-"))
  const api = (path: string) => localGatewayApi({ ...config, root: directory }, new Request(`http://localhost${path}`))
  try {
    await mkdir(join(directory, ".smithers"))
    await writeFile(join(directory, ".smithers/factory.json"), '{"flows":[]}')
    expect(await (await api("/api/user")).json()).toMatchObject({ username: "local-operator", display_name: "Local operator", is_admin: false })
    for (const path of ["/api/user/repos", "/api/user/orgs", "/api/user/workspaces", "/api/conversations/main/view-state", `/api/repos/${config.repo}/home`]) expect((await api(path)).status).toBe(409)
    expect((await api(`/api/repos/${config.repo}/contents/.smithers/factory.json`)).status).toBe(409)
    expect((await api("/api/repos/wrong/repo/contents/.smithers/factory.json")).status).toBe(409)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
