import { describe, expect, test } from "bun:test"
import { createLocalWorkflowRelay, localGatewayFromEnvironment } from "./LocalWorkflowGateway"

const config = { url: "http://127.0.0.1:17391", repo: "local/spike", workspaceId: "l7-temp" }
const request = (procedure = "Projection.Snapshot", extra = {}, payload: unknown = { selector: { _tag: "approvals" } }) =>
  new Request("http://127.0.0.1:1234/api/workflow/rpc", {
    method: "POST", headers: { "content-type": "application/json", cookie: "private", authorization: "Bearer browser", origin: "http://127.0.0.1:1234" },
    body: JSON.stringify({ repo: config.repo, workspaceId: config.workspaceId, procedure, payload, ...extra })
  })
const success = (value: unknown) => new Response(JSON.stringify({ _tag: "Exit", requestId: 1, exit: { _tag: "Success", value } }) + "\n")

describe("L7 local workflow relay", () => {
  test("configuration is explicit and loopback-only", () => {
    expect(localGatewayFromEnvironment({})).toBeUndefined()
    expect(localGatewayFromEnvironment({ SMITHERS_LOCAL_GATEWAY_URL: config.url, SMITHERS_LOCAL_GATEWAY_REPO: config.repo, SMITHERS_LOCAL_GATEWAY_WORKSPACE_ID: config.workspaceId })).toEqual(config)
    for (const url of ["https://example.com", "http://localhost", "http://127.0.0.1/rpc", "http://user:pass@127.0.0.1", "http://127.0.0.1?x=1"]) {
      expect(() => createLocalWorkflowRelay({ ...config, url }, 1000)).toThrow()
    }
    expect(() => createLocalWorkflowRelay({ ...config, workspaceId: "" }, 1000)).toThrow()
    expect(() => createLocalWorkflowRelay({ ...config, repo: "" }, 1000)).toThrow()
  })

  test("maps every unary procedure without changing its payload or forwarding browser credentials", async () => {
    for (const procedure of ["Plan", "Run", "Cancel", "Resume", "Steer", "Signal", "List", "Projection.Snapshot", "Approval.Submit", "Run.Fork", "Run.Verify"]) {
      const payload = { marker: procedure, nested: { a: [1, true] } }
      const relay = createLocalWorkflowRelay({ ...config, operatorToken: "server-only" }, 1000, async (url, init) => {
        expect(url.origin).toBe(config.url)
        expect(url.pathname).toBe(procedure.includes(".") ? "/projections" : "/rpc")
        expect(init.redirect).toBe("error")
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer server-only")
        expect(new Headers(init.headers).get("cookie")).toBeNull()
        expect(new Headers(init.headers).get("origin")).toBeNull()
        expect(String(init.body).endsWith("\n")).toBe(true)
        expect(JSON.parse(String(init.body))).toEqual({ _tag: "Request", id: 1, tag: procedure, payload, headers: [] })
        return success(payload)
      })
      expect(await (await relay(request(procedure, {}, payload))).json()).toEqual({ ok: true, payload })
    }
  })

  test("refuses wrong bindings, provisioning, streams and inherited property names before egress", async () => {
    const relay = createLocalWorkflowRelay(config, 1000, async () => { throw new Error("must not fetch") })
    for (const extra of [{ repo: "other/repo" }, { workspaceId: "other" }]) expect((await relay(request("List", extra))).status).toBe(400)
    for (const procedure of ["Watch", "Projection.Subscribe", "toString", "__proto__"]) expect((await relay(request(procedure))).status).toBe(400)
    expect((await relay(new Request("http://127.0.0.1/api/workflow/provision", { method: "POST" }))).status).toBe(501)
    expect((await relay(new Request("http://127.0.0.1/api/workflow/rpc"))).status).toBe(405)
  })

  test("preserves typed failures and refuses missing exits, bad frames, ingress and connection failures", async () => {
    const cause = [{ _tag: "Fail", error: { _tag: "/control/Unauthorized", code: "unauthorized" } }]
    const relay = createLocalWorkflowRelay(config, 1000, async () => new Response(JSON.stringify({ _tag: "Exit", requestId: 1, exit: { _tag: "Failure", cause } })))
    expect(await (await relay(request())).json()).toMatchObject({ ok: false, error: { detail: cause } })
    for (const [response, status] of [[new Response("{}"), 500], [new Response("bad json"), 502], [new Response("private", { status: 401 }), 401]] as const) {
      const answer = await createLocalWorkflowRelay(config, 1000, async () => response)(request())
      expect(answer.status).toBe(status)
      expect(await answer.text()).not.toContain("private")
    }
    const failed = await createLocalWorkflowRelay(config, 1000, async () => { throw new Error("private") })(request())
    expect(failed.status).toBe(502)
    expect(await failed.text()).not.toContain("private")
  })
})
