// Opt-in spike receipt against one separately running, real smthrs serve.
import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { startLocalServer } from "./server"
import { createLocalWorkflowRelay } from "./LocalWorkflowGateway"
import { createGatewaySeam } from "../mainview/state/controller/gateway"
import { questionOf } from "../mainview/cards/ApprovalQuestion"
import { LOCAL_SESSION_HEADER } from "@smthrs/rpc/LocalSession"

const state = process.env.L7_GATEWAY_STATE
test.skipIf(state === undefined)("real HumanTask snapshot -> app server -> app decoder -> answer -> completed", async () => {
  const root = state!
  const token = (await readFile(join(root, "serve.stderr"), "utf8")).match(/approval token  (\S+)/)?.[1]
  expect(token).toBeDefined()
  const url = "http://127.0.0.1:17391"
  const config = { url, repo: "local/spike", workspaceId: "l7-temp" }
  const dist = await mkdtemp(join(tmpdir(), "l7-app-dist-"))
  await writeFile(join(dist, "index.html"), "<!doctype html><div id=app></div>")
  // Exercise the actual environment selection in startLocalServer.
  const names = ["SMITHERS_LOCAL_GATEWAY_URL", "SMITHERS_LOCAL_GATEWAY_REPO", "SMITHERS_LOCAL_GATEWAY_WORKSPACE_ID", "SMITHERS_LOCAL_GATEWAY_OPERATOR_TOKEN"] as const
  const previous = names.map((name) => process.env[name])
  Object.assign(process.env, { SMITHERS_LOCAL_GATEWAY_URL: url, SMITHERS_LOCAL_GATEWAY_REPO: config.repo, SMITHERS_LOCAL_GATEWAY_WORKSPACE_ID: config.workspaceId, SMITHERS_LOCAL_GATEWAY_OPERATOR_TOKEN: token })
  const logs: string[] = []
  const app = await startLocalServer({ distDir: dist, cloudMode: "offline", log: (line) => logs.push(line) })
  const receipts: Record<string, unknown> = {}
  try {
    const apiFetch = (target: string, init?: RequestInit) => fetch(target, {
      ...init, headers: { ...init?.headers, [LOCAL_SESSION_HEADER]: app.sessionToken }
    })
    const seam = createGatewaySeam({ baseUrl: app.origin, bindingFor: () => ({ workspaceId: config.workspaceId }), fetch: apiFetch,
      errorMessageOf: async (response) => (await response.text()) })
    expect((await fetch(`${app.origin}/api/workflow/rpc`, { method: "POST" })).status).toBe(401)
    expect((await apiFetch(`${app.origin}/api/workflow/rpc`, { method: "POST", headers: { origin: "http://evil.test" } })).status).toBe(403)
    const inbox = await seam.approvalsInbox(config.repo)
    receipts.inbox = inbox
    expect(inbox.status).toBe("ok")
    if (inbox.status !== "ok") throw new Error(JSON.stringify(inbox))
    expect(inbox.value).toHaveLength(1)
    const row = inbox.value[0]!
    expect(row.runId).toBe("run-2")
    expect(row.waitRunId).toBeDefined()
    expect(questionOf(row)).toMatchObject({ kind: "json", prompt: "Which gateway answered?", name: "l7/answer" })
    const before = await seam.workspaceRuns(config.repo)
    receipts.before = before
    expect(before.status).toBe("ok")
    if (before.status === "ok") expect(before.value.find((run) => run.runId === row.runId)?.status).toBe("waiting-approval")
    const body = { repo: config.repo, workspaceId: config.workspaceId, procedure: "Approval.Submit", payload: { ...row.payload, decision: "approve", answer: { choice: "loopback" } } }
    const anonymous = await createLocalWorkflowRelay(config, 10000)(new Request(`${app.origin}/api/workflow/rpc`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    }))
    receipts.anonymous = await anonymous.json()
    expect(receipts.anonymous).toMatchObject({ ok: false, error: { detail: [{ _tag: "Fail", error: { code: "unauthorized" } }] } })
    const answered = await seam.submitApproval(config.repo, row.payload, "approve", undefined, { choice: "loopback" })
    receipts.answer = answered
    expect(answered.status).toBe("ok")
    const until = Date.now() + 25000
    let run = await seam.run(config.repo, row.runId)
    while (run.status === "ok" && run.value?.status !== "completed" && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      run = await seam.run(config.repo, row.runId)
    }
    receipts.after = run
    expect(run.status).toBe("ok")
    if (run.status === "ok") expect(run.value?.status).toBe("completed")
    const pending = await seam.approvalsInbox(config.repo)
    receipts.pending = pending
    expect(pending).toMatchObject({ status: "ok", value: [] })
    expect(logs.join("\n")).not.toContain(token!)
    receipts.logs = logs
  } finally {
    await writeFile(join(root, "app-receipt.json"), JSON.stringify(receipts, null, 2) + "\n")
    await app.stop()
    await rm(dist, { recursive: true, force: true })
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index] })
  }
}, 45000)
