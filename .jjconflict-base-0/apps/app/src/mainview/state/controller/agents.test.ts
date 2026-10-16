import { AGENT_ROLES } from "@smthrs/rpc/AgentRoles"
import { afterEach, expect, test } from "bun:test"
import type { Card, RepositoryFlow } from "../AppState"
import { createAppStore } from "../AppStore"
import type { AppStore } from "../AppStore"
import { memoryStorage, settled } from "../TestFixtures"
import { AGENTS_CARD_ID, agentProfileOf, createAgentsController, flowModelOf, repositoryAgentCatalog } from "./agents"
import type { ControllerContext } from "./context"

/*
 * An agent is a flow (#2203): off an install, the Agents card lists the target
 * repository's flows that declare a model, each with its label, purpose and
 * model, and the card renders every row's Runs door (AgentCards.tsx,
 * runs.list flow=<id>). No organization, no reporting line.
 *
 * It lists NOTHING else. The built-in `AGENT_ROLES` table is the declared
 * factory table the model menus read (state/AppProjection.ts); no host without
 * `install` answers for it, so it is not that host's inventory
 * (#3831, subjects.cloudAgents.test.ts has the production reproduction).
 */

const REPO = "smithersai/smithers"
const flow = (id: string, model: string | null, description = `Runs ${id}.`): RepositoryFlow =>
  ({ id, description, summary: null, featured: false, model, modelInvocable: true })

const opened: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of opened.splice(0)) await close() })

const setup = async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  let disposed = false
  const finalizers: Array<() => void | Promise<void>> = []
  const records: string[] = []
  const ctx = {
    store, commandActor: "user", baseUrl: "", get disposed() { return disposed },
    failures: { report: (_seam: string, _error: unknown, subject?: string) => void records.push(subject ?? "") },
    onDispose: (finalizer: () => void | Promise<void>) => { finalizers.push(finalizer) }
  } as unknown as ControllerContext
  const agents = createAgentsController(ctx, { nextOrdinal: store.nextOrdinal })
  opened.push(async () => { disposed = true; for (const finalizer of finalizers) await finalizer(); await store.settled?.(); await store.dispose?.() })
  const card = (): Extract<Card, { kind: "agents" }> | undefined => {
    const row = store.collections.cards.get(AGENTS_CARD_ID)
    return row?.kind === "agents" ? row : undefined
  }
  const rows = () => {
    const payload = card()?.payload
    return payload !== undefined && "agents" in payload ? payload.agents : []
  }
  return { store, agents, card, rows, records }
}

const loadRepository = async (store: AppStore, flows: ReadonlyArray<RepositoryFlow>) => {
  await store.dispatch({ type: "repository.upserted", actor: "system",
    repository: { id: REPO, org: "smithersai", ownerKind: "org", name: "smithers", head: null, catalog: true } }).isPersisted.promise
  await store.dispatch({ type: "repository-flows.loaded", actor: "system", repo: REPO, flows: [...flows] }).isPersisted.promise
}

test("the card lists the repository's flows that declare a model, with label, purpose and model, and no seed role", async () => {
  const t = await setup()
  await loadRepository(t.store, [
    flow("review", "sol", "Reviews the working-copy change."),
    flow("checks/lint", null),
    flow("assistant", "openai:gpt-6.1-sol", "Answers questions and routes work."),
    flow("product-release", "openai:gpt-6-sol", "Ships a release.")
  ])
  await t.agents.listAgents()
  expect(t.rows().map((row) => row.id)).toEqual(["review", "assistant", "product-release"])
  // The label is the flow id (no declaration names a flow); a known model shows the built-ins' display name, an unknown one its id.
  expect(t.rows()).toEqual([
    { id: "review", label: "review", purpose: "Reviews the working-copy change.", model: { provider: "", id: "sol", label: "sol" },
      builtin: false, available: false, reason: "", account: "" },
    { id: "assistant", label: "assistant", purpose: "Answers questions and routes work.", model: { provider: "openai", id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
      builtin: false, available: false, reason: "", account: "" },
    { id: "product-release", label: "product-release", purpose: "Ships a release.", model: { provider: "openai", id: "gpt-6-sol", label: "gpt-6-sol" },
      builtin: false, available: false, reason: "", account: "" }
  ])
  // Not one id of the declared factory table is on the card: no host answered for it here.
  for (const role of AGENT_ROLES) expect(t.rows().map((row) => row.id)).not.toContain(role.id)
  // A flow runs on Smithers itself and names no harness.
  expect(Object.keys(t.rows().at(-1)!)).not.toContain("harness")
  // The rows came from the catalog that answered, and the card says so.
  expect(t.card()!.payload).toMatchObject({ inventory: "repository" })
})

test("without a repository the card states that it has no catalog to read, and lists nothing", async () => {
  const t = await setup()
  await t.agents.listAgents()
  expect(t.rows()).toEqual([])
  expect(t.card()!.payload).toMatchObject({ inventory: "no-repository" })
  expect(t.records).toEqual(["agents.inventory source=no-repository catalog=none rows=0 flows=0"])
})

test("a catalog that answers with no agent flow releases the loading stage it was held on", async () => {
  const t = await setup()
  await t.store.dispatch({ type: "repository.upserted", actor: "system",
    repository: { id: REPO, org: "smithersai", ownerKind: "org", name: "smithers", head: null, catalog: true } }).isPersisted.promise
  await t.agents.listAgents()
  expect(t.card()!.payload).toMatchObject({ inventory: "reading" })
  // The rows do not change (both empty); the stage does, and the open card follows it.
  await loadRepository(t.store, [flow("checks/lint", null)])
  await settled()
  expect(t.card()!.payload).toMatchObject({ inventory: "repository" })
  expect(t.rows()).toEqual([])
})

test("an open card follows the repository: flows that load after it was asked for appear in place, at the same ordinal", async () => {
  const t = await setup()
  await loadRepository(t.store, [])
  await t.agents.listAgents()
  const before = t.card()!
  expect(t.rows()).toHaveLength(0)
  await loadRepository(t.store, [flow("triage", "luna")])
  await settled()
  expect(t.rows().map((row) => row.id)).toEqual(["triage"])
  expect(t.card()!.ordinal).toBe(before.ordinal)
  expect(t.card()!.createdAt).toBe(before.createdAt)
  // Nothing else changed: the card is not rewritten again.
  const transitions = t.store.collections.transitions.size
  await t.store.dispatch({ type: "toast.shown", actor: "system", key: "x", title: "x" }).isPersisted.promise
  await settled()
  expect(t.store.collections.transitions.size).toBe(transitions + 1)
})

test("a repository whose catalog has not answered is not a repository with no agents", async () => {
  const t = await setup()
  await t.store.dispatch({ type: "repository.upserted", actor: "system",
    repository: { id: REPO, org: "smithersai", ownerKind: "org", name: "smithers", head: null, catalog: true } }).isPersisted.promise
  await t.agents.listAgents()
  expect(t.card()!.payload).toMatchObject({ inventory: "reading" })
  expect(t.rows()).toEqual([])
  expect(t.records).toEqual(["agents.inventory source=reading catalog=none rows=0 flows=0"])
  // The same store, once the catalog answers with no agent flow: a real empty, told apart by its counts.
  await loadRepository(t.store, [flow("checks/lint", null)])
  await t.agents.listAgents()
  expect(t.card()!.payload).toMatchObject({ inventory: "repository" })
  expect(t.records.at(-1)).toBe("agents.inventory source=repository catalog=read rows=0 flows=1")
})

test("a refused catalog read is a prerequisite, and the next answer releases it", async () => {
  const t = await setup()
  await t.store.dispatch({ type: "repository.upserted", actor: "system",
    repository: { id: REPO, org: "smithersai", ownerKind: "org", name: "smithers", head: null, catalog: true } }).isPersisted.promise
  await t.store.dispatch({ type: "repository-flows.loaded", actor: "system", repo: REPO, flows: [], catalog: "unreadable" }).isPersisted.promise
  await t.agents.listAgents()
  expect(t.card()!.payload).toMatchObject({ inventory: "unreadable" })
  expect(t.rows()).toEqual([])
  expect(t.records).toEqual(["agents.inventory source=unreadable catalog=unreadable rows=0 flows=0"])
  /* The refused read holds no verdict about a name either. */
  expect(await t.agents.listAgents("review")).toBeUndefined()
  expect(t.card()!.payload).toMatchObject({ inventory: "unreadable" })
  /* A later read answers: the open card follows it off the refusal. */
  await loadRepository(t.store, [flow("review", "sol", "Reviews the working-copy change.")])
  await settled()
  expect(t.card()!.payload).toMatchObject({ inventory: "repository" })
  expect(t.rows().map((row) => row.id)).toEqual(["review"])
})

test("a flow id with a path segment keeps its id, which is the Runs door's flow filter", async () => {
  const t = await setup()
  await loadRepository(t.store, [flow("checks/wiki", "fable")])
  await t.agents.listAgents()
  expect(t.rows().at(-1)).toMatchObject({ id: "checks/wiki", label: "checks/wiki" })
  expect(repositoryAgentCatalog(t.store).rows.map((row) => row.id)).toEqual(["checks/wiki"])
})

test("a flow's model is shown as written, or by the built-ins' display name when the id is a known one; a seat that reads as a flag is no model", () => {
  expect(flowModelOf("sol")).toEqual({ provider: "", id: "sol", label: "sol" })
  expect(flowModelOf(" anthropic:claude-fable-5-1 ")).toEqual({ provider: "anthropic", id: "claude-fable-5-1", label: "claude-fable-5-1" })
  expect(flowModelOf("anthropic:claude-fable-5")).toEqual({ provider: "anthropic", id: "claude-fable-5", label: "Fable 5" })
  expect(flowModelOf("gpt-6-luna")).toEqual({ provider: "", id: "gpt-6-luna", label: "GPT-6 Luna" })
  expect(flowModelOf("cerebras:qwen-3.8-27b")).toEqual({ provider: "cerebras", id: "qwen-3.8-27b", label: "Cerebras Qwen 3.8 27B" })
  expect(flowModelOf("openai:-m evil")).toBeUndefined()
  expect(flowModelOf("")).toBeUndefined()
  expect(agentProfileOf(flow("plain", null))).toBeUndefined()
  expect(agentProfileOf(flow("odd", "openai:"))).toBeUndefined()
})
