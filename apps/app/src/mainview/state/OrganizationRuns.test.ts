/*
 * The organization Flow host's runs, observed through the existing run cards.
 *
 * A single-owner host that advertises `organization` serves its configured
 * repository through /api/organization/* (packages/backend/internal/compose
 * browser_flow.go); every other repository keeps /api/workflow/*. The run
 * list and run card are the same ones every repository uses; only the relay
 * route differs.
 */
import { describe, expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import type { Card } from "@smthrs/rpc/Cards"
import { scopedControllers } from "./ControllerTestScope"
import type { AppServices } from "./AppController"
import { createAppStore } from "./AppStore"
import { json, memoryStorage, settle, silentAgent } from "./TestFixtures"

const createAppController = scopedControllers()

const webStore = () => createAppStore({ kind: "localStorage", storage: memoryStorage() })

const ORG = "owner/org"
const OTHER = "owner/notes"

const said = (outcome: { status: string; value?: string; error?: string }): string =>
  outcome.status === "failed" ? (outcome.error ?? "") : (outcome.value ?? "")

const bootstrap = (capabilities: AppBootstrap["capabilities"]): AppBootstrap => ({
  apiVersion: 1,
  host: "local",
  version: "dev",
  buildSha: "test",
  capabilities,
  authFlow: "credentials",
  sandbox: { platform: "darwin", mode: "trusted-only" }
})

const summary = (runId: string, flowId: string, status: string) => ({
  runId, flowId, status, createdAt: 1, updatedAt: 2, turns: 0, calls: 0, callsFailed: 0,
  editsAttempted: 0, editsSucceeded: 0, inputTokens: 0, outputTokens: 0, verdict: status, diagnosis: "Verdict   running."
})

interface Call {
  readonly method: string
  readonly path: string
  readonly repo?: string
}

const host = (options: { readonly capabilities: AppBootstrap["capabilities"]; readonly describe?: () => Response }) => {
  const calls: Array<Call> = []
  const relay = (rows: ReadonlyArray<ReturnType<typeof summary>>, body: Record<string, unknown>) => {
    const payload = (body.payload ?? {}) as { selector?: { _tag?: string; runId?: string } }
    if (body.procedure !== "Projection.Snapshot") return json(200, { ok: false, error: { message: `no ${String(body.procedure)}` } })
    const selector = payload.selector ?? {}
    const selected = selector._tag === "run-summary" ? rows.filter(row => row.runId === selector.runId) : selector._tag === "workspace-runs" ? rows : []
    return json(200, { ok: true, payload: { rows: selected, cursor: { value: 1, offset: 0 } } })
  }
  const services: AppServices = {
    workflowPollMs: 1,
    toastDebounceMs: 0,
    toastAutoDismissMs: 10_000,
    bootstrap: bootstrap(options.capabilities),
    fetchImpl: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const absolute = new URL(url, "https://app.test")
      if (absolute.pathname.endsWith("/contents/.smithers/factory.json")) return json(404, { status: "error", message: "no projection" })
      if (/^\/api\/repos\/[^/]+\/[^/]+\/home$/.test(absolute.pathname)) return json(404, { status: "error", message: "no homepage" })
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {}
      calls.push({ method: init?.method ?? "GET", path: absolute.pathname, ...(typeof body.repo === "string" ? { repo: body.repo } : {}) })
      switch (absolute.pathname) {
        case "/api/organization":
          return options.describe?.() ?? json(200, { repo: "Owner/Org" })
        case "/api/organization/provision":
          return body.repo === ORG ? json(200, { status: "ready", workspaceId: "ws-org", gatewayId: "ws-org" }) : json(404, { ok: false })
        case "/api/organization/rpc":
          return body.repo === ORG ? relay([summary("run-intake", "organization/intake", "running")], body) : json(404, { ok: false })
        case "/api/workflow/provision":
          return json(200, { status: "ready", gatewayId: "gw-1" })
        case "/api/workflow/rpc":
          return relay([summary("run-review", "review-pr", "completed")], body)
        default:
          return json(404, { status: "error", message: `no stub for ${absolute.pathname}` })
      }
    }
  }
  return { services, calls }
}

const signIn = async (store: Awaited<ReturnType<typeof webStore>>) => {
  store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "owner", allowlisted: true, admin: false, scopesPlain: null })
  store.dispatch({
    type: "repositories.loaded",
    actor: "system",
    repositories: [ORG, OTHER].map((fullName) => ({ id: fullName, org: "owner", ownerKind: "user", name: fullName.split("/")[1] ?? "", head: null }))
  })
  await settle(2)
}

const runList = (store: Awaited<ReturnType<typeof webStore>>, repo: string): Extract<Card, { kind: "run-list" }> | undefined => {
  const card = store.collections.cards.get(`run-list-${repo}`)
  return card?.kind === "run-list" ? card : undefined
}

const relayCalls = (calls: ReadonlyArray<Call>, prefix: string, repo: string) =>
  calls.filter(call => call.path.startsWith(prefix) && call.repo === repo).map(call => call.path)

describe("organization runs in the app", () => {
  test("the configured repository's runs list and open through the organization relay", async () => {
    const store = await webStore()
    const double = host({ capabilities: ["identity", "cloud", "organization"] })
    const controller = createAppController(store, silentAgent, double.services)
    await signIn(store)

    const listed = await controller.commands.run("runs.list", ORG)
    expect(said(listed)).toBe(`1 run on ${ORG}.`)
    expect(runList(store, ORG)?.payload.runs.map(run => [run.runId, run.flowId, run.status])).toEqual([["run-intake", "organization/intake", "running"]])
    expect(relayCalls(double.calls, "/api/organization/", ORG)).toEqual(["/api/organization/provision", "/api/organization/rpc"])
    expect(relayCalls(double.calls, "/api/workflow/", ORG)).toEqual([])

    const opened = await controller.commands.run("runs.open", `run-intake ${ORG}`)
    expect(said(opened)).toContain("run-opened run=run-intake")
    const card = store.collections.cards.get("flow-run-run-intake")
    expect(card?.kind === "run-trace" && card.payload.workflow).toBe("organization/intake")
    expect(relayCalls(double.calls, "/api/workflow/", ORG)).toEqual([])

    // Every other repository keeps the workflow relay; the host was asked once.
    const other = await controller.commands.run("runs.list", OTHER)
    expect(said(other)).toBe(`1 run on ${OTHER}.`)
    expect(runList(store, OTHER)?.payload.runs.map(run => run.flowId)).toEqual(["review-pr"])
    expect(relayCalls(double.calls, "/api/workflow/", OTHER)).toEqual(["/api/workflow/provision", "/api/workflow/rpc"])
    expect(relayCalls(double.calls, "/api/organization/", OTHER)).toEqual([])
    expect(double.calls.filter(call => call.path === "/api/organization")).toHaveLength(1)
  })

  test("a host without the capability is never asked, and every repository keeps the workflow relay", async () => {
    const store = await webStore()
    const double = host({ capabilities: ["identity", "cloud"] })
    const controller = createAppController(store, silentAgent, double.services)
    await signIn(store)
    await controller.commands.run("runs.list", ORG)
    expect(runList(store, ORG)?.payload.runs.map(run => run.flowId)).toEqual(["review-pr"])
    expect(double.calls.filter(call => call.path.startsWith("/api/organization"))).toEqual([])
  })

  test("an account the host serves no organization to keeps the workflow relay", async () => {
    const store = await webStore()
    const double = host({ capabilities: ["identity", "cloud", "organization"], describe: () => json(404, { ok: false, error: { message: "Organization unavailable." } }) })
    const controller = createAppController(store, silentAgent, double.services)
    await signIn(store)
    await controller.commands.run("runs.list", ORG)
    await controller.commands.run("runs.list", OTHER)
    expect(relayCalls(double.calls, "/api/workflow/", ORG)).toEqual(["/api/workflow/provision", "/api/workflow/rpc"])
    expect(double.calls.filter(call => call.path === "/api/organization")).toHaveLength(1)
    expect(double.calls.filter(call => call.path.startsWith("/api/organization/"))).toEqual([])
  })

  test("an unanswered ask fails the call instead of sending organization work to another host", async () => {
    const store = await webStore()
    let answer = () => json(503, { ok: false })
    const double = host({ capabilities: ["identity", "cloud", "organization"], describe: () => answer() })
    const controller = createAppController(store, silentAgent, double.services)
    await signIn(store)
    const refused = await controller.commands.run("runs.list", ORG)
    expect(refused.status).toBe("failed")
    expect(double.calls.filter(call => call.path.startsWith("/api/workflow/") || call.path.startsWith("/api/organization/"))).toEqual([])
    answer = () => json(200, { repo: ORG })
    const listed = await controller.commands.run("runs.list", ORG)
    expect(said(listed)).toBe(`1 run on ${ORG}.`)
    expect(relayCalls(double.calls, "/api/organization/", ORG)).toEqual(["/api/organization/provision", "/api/organization/rpc"])
    expect(double.calls.filter(call => call.path === "/api/organization")).toHaveLength(2)
  })
})
