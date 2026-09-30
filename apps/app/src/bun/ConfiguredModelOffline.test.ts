import { beforeAll, afterAll, expect, test } from "bun:test"
import { startFullBackend } from "../../e2e/fixtures/full-backend"
import { PROVIDER_MODEL,PROVIDER_REPLY } from "../../e2e/real/support/model-provider-behaviors"
import { launchModelProvider } from "../../e2e/real/support/model-provider-process"
import { createRuntime,loadBootstrap,unavailableAgent } from "../mainview/runtime/Runtime"
import { createAppStore } from "../mainview/state/AppStore"
import { scopedControllers } from "../mainview/state/ControllerTestScope"
import { memoryStorage, waitFor } from "../mainview/state/TestFixtures"

const createAppController = scopedControllers()
let backend: Awaited<ReturnType<typeof startFullBackend>>
beforeAll(async () => { backend = await startFullBackend() }, 120_000)
afterAll(async () => { await backend?.stop() })

test("an owned backend tests and assigns a loopback model, then answers through its durable transport", async () => {
  const key = "sk-offline-0123456789abcdef"
  const provider = await launchModelProvider({ key })
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const transport: Array<[string, string, number]> = []
  const http: typeof backend.http = async (input, init) => {
    const response = await backend.http(input, init)
    transport.push([init?.method ?? "GET", new URL(String(input), backend.origin).pathname, response.status])
    return response
  }
  const user = await http("/api/user")
  expect(user.status).toBe(200)
  expect(await user.json()).toMatchObject({ username: backend.username, is_admin: true })
  const enrolled = await http("/api/model/credential", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "enroll", requestId: crypto.randomUUID(), name: "LOOPBACK", origin: provider.origin, value: key })
  })
  expect(enrolled.status).toBe(200)
  const bootstrap = await loadBootstrap(http)
  const runtime = createRuntime({ bootstrap, http })
  const controller = createAppController(store, runtime.backend.agent ?? unavailableAgent(), { bootstrap, fetchImpl: http })
  try {
    await controller.adoptSession({ state: "signed-in", login: backend.username, admin: true })
    expect(runtime.backend.agent?.available).toBe(true)
    expect(await provider.journal()).toHaveLength(0)
    await controller.commands.run("model.list")
    await waitFor(() => { const card = store.collections.cards.get("models"); return card?.kind === "models" && card.payload.host === "observed" })
    expect((await controller.commands.run("model.save", `--name loopback --protocol openai-chat --model ${PROVIDER_MODEL.answers} --credential LOOPBACK --url ${provider.origin}`)).status).toBe("executed")
    await controller.commands.run("model.test", "loopback")
    await waitFor(() => store.collections.models.get("loopback")?.lastTest !== undefined)
    expect(store.collections.models.get("loopback")?.lastTest?.result.ok).toBe(true)
    expect((await controller.commands.run("model.assign", "explainer loopback")).status).toBe("executed")
    expect((await controller.commands.run("agent.explain", "the loopback provider")).status).toBe("executed")
    await waitFor(() => [...store.collections.cards.values()].some((card) => card.kind === "explain" && card.payload.phase === "answered"))
    const answer = [...store.collections.cards.values()].find((card) => card.kind === "explain")
    expect(answer?.kind === "explain" && answer.payload).toMatchObject({ answer: PROVIDER_REPLY.join(""), answeredBy: "loopback", phase: "answered" })
    expect((await provider.journal()).map((entry) => [entry.modelId, entry.authorized])).toEqual([
      [PROVIDER_MODEL.answers, true], [PROVIDER_MODEL.answers, true]
    ])
    await waitFor(() => transport.some(([, path, status]) => path === "/api/agent/turn/retire" && status === 200))
    expect(transport.filter(([, path]) => path === "/api/agent/turn" || path === "/api/agent/turn/retire")).toEqual([
      ["POST", "/api/agent/turn", 200], ["POST", "/api/agent/turn/retire", 200]
    ])
    expect(bootstrap.capabilities).toContain("agent")
    expect(bootstrap.capabilities).toContain("model.turn")
    expect(runtime.backend.agent?.available).toBe(true)
  } finally {
    await controller.dispose()
    await provider.close()
  }
})
