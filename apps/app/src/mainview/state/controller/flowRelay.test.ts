import { describe, expect, test } from "bun:test"
import { json } from "../TestFixtures"
import { createFlowRelay, ORGANIZATION_RELAY, WORKFLOW_RELAY } from "./flowRelay"
import { createGatewaySeam } from "./gateway"

const asking = (answers: Array<() => Response>) => {
  const asked: Array<string> = []
  const fetch = async (url: string): Promise<Response> => {
    asked.push(url)
    const next = answers.shift()
    if (next === undefined) throw new Error("unexpected ask")
    return next()
  }
  return { asked, fetch }
}

describe("flow relay routing", () => {
  test("a host without the organization capability is never asked", async () => {
    const host = asking([])
    const relay = createFlowRelay({ organization: false, baseUrl: "https://app.test", fetch: host.fetch, epoch: () => 0 })
    expect(await relay.pathsFor("owner/org")).toBe(WORKFLOW_RELAY)
    expect(host.asked).toEqual([])
  })

  test("routes only the configured repository, asking once per account generation", async () => {
    let epoch = 1
    const host = asking([() => json(200, { repo: "Owner/Org" }), () => json(404, { ok: false })])
    const relay = createFlowRelay({ organization: true, baseUrl: "https://app.test", fetch: host.fetch, epoch: () => epoch })
    expect(await relay.pathsFor("owner/org")).toBe(ORGANIZATION_RELAY)
    expect(await relay.pathsFor("owner/notes")).toBe(WORKFLOW_RELAY)
    expect(await relay.pathsFor("OWNER/ORG")).toBe(ORGANIZATION_RELAY)
    expect(host.asked).toEqual(["https://app.test/api/organization"])
    epoch = 2
    expect(await relay.pathsFor("owner/org")).toBe(WORKFLOW_RELAY)
    expect(await relay.pathsFor("owner/org")).toBe(WORKFLOW_RELAY)
    expect(host.asked).toHaveLength(2)
  })

  test("a failed or malformed answer is not cached and never routes elsewhere", async () => {
    const host = asking([
      () => json(503, { ok: false }),
      () => json(200, { repo: "" }),
      () => { throw new Error("offline") },
      () => json(200, { repo: "owner/org" })
    ])
    const relay = createFlowRelay({ organization: true, baseUrl: "", fetch: host.fetch, epoch: () => 0 })
    await expect(relay.pathsFor("owner/org")).rejects.toThrow("503")
    await expect(relay.pathsFor("owner/notes")).rejects.toThrow("without a repository")
    await expect(relay.pathsFor("owner/org")).rejects.toThrow("offline")
    expect(await relay.pathsFor("owner/org")).toBe(ORGANIZATION_RELAY)
    expect(host.asked).toHaveLength(4)
  })

  test("the gateway seam sends a repository's calls to its relay, and refuses when the relay is unknown", async () => {
    const posted: Array<string> = []
    const seam = createGatewaySeam({
      baseUrl: "https://app.test",
      rpcPathFor: async (repo) => {
        if (repo === "owner/unknown") throw new Error("organization relay answered 503")
        return repo === "owner/org" ? ORGANIZATION_RELAY.rpc : WORKFLOW_RELAY.rpc
      },
      fetch: async (url) => {
        posted.push(url)
        return json(200, { ok: true, payload: { rows: [] } })
      },
      errorMessageOf: async (_response, fallback) => fallback
    })
    expect((await seam.workspaceRuns("owner/org")).status).toBe("ok")
    expect((await seam.workspaceRuns("owner/notes")).status).toBe("ok")
    const refused = await seam.workspaceRuns("owner/unknown")
    expect(refused).toEqual({ status: "error", message: "The workspace didn't answer: the flow service is unreachable." })
    expect(posted).toEqual(["https://app.test/api/organization/rpc", "https://app.test/api/workflow/rpc"])
  })
})
