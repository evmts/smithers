/*
 * #3831. The canonical `/agents` on the bootstrap production actually serves.
 *
 * The person's journey (roninjin10/e2e-verify, 2026-10-15, root's native Arc
 * on https://smithers.sh): `/agents` opened an Agents card listing five rows —
 * Orchestrator/Fable 5, Implementation/GPT-6.1 Sol, Trivial implementation/
 * GPT-6 Luna, UI/Kimi K3, Fast UI/Cerebras Qwen 3.8 27B — each with a Runs
 * button, and clicking Orchestrator's Runs opened a box prerequisite rather
 * than any recorded work.
 *
 * No host answered for any of it. `GET /api/agents` is mounted by
 * `packages/backend/internal/compose/chat_routes.go` under
 * `config.IsSingleOwner(cfg.Auth)` alone — the condition the bootstrap's
 * `install` row states — and the hosted origin serves no projection of it. Its
 * factory ids are not even those five: an install answers `planner`,
 * `implementer`, `reviewer` and `app`. The five were seed rows of
 * `controller/agents.ts` itself, from the `@smthrs/rpc/AgentRoles` table, each
 * carrying a local harness that retired with the local backend.
 *
 * What the hosted origin DOES read for this card is the target repository's
 * flow catalog, `.smithers/factory.json` off the public contents route, whose
 * rows that declare a model are that repository's agents. Those are real,
 * and a row that is a flow has a real Runs door.
 */
import { expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import { CardSchema } from "@smthrs/rpc/Cards"
import type { Card } from "../../state/AppState"
import type { AppServices } from "../../state/AppController"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"
import { json, memoryStorage, settled, unavailableAgent } from "../../state/TestFixtures"

const REPO = "roninjin10/e2e-verify"

/** What https://smithers.sh/api/bootstrap answered on 2026-10-15, verbatim: no `install`. */
const HOSTED: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "1.0.0-rc.5", buildSha: "c6c360ddca963cf23c13c3e512e554f0a7af2dbf",
  capabilities: ["identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select",
    "cloud", "cloud.terminal", "billing.balance", "billing.overview", "billing.plans", "billing.portal", "billing.checkout"],
  authFlow: "redirect", sandbox: { platform: "linux", mode: "enforced" }
}

/*
 * The five rows root's native Arc showed, exactly as the build that listed
 * them wrote them into the browser database: the `@smthrs/rpc/AgentRoles`
 * table, each row claiming `builtin: true` and a local harness.
 */
const SEED_ROWS = [
  { id: "orchestrator", label: "Orchestrator", purpose: "Plans the work.", harness: "claude", harnessName: "claude", model: { provider: "anthropic", id: "claude-fable-5", label: "Fable 5" }, builtin: true, available: false, reason: "", account: "" },
  { id: "implementation", label: "Implementation", purpose: "Writes the change.", harness: "codex", harnessName: "codex", model: { provider: "openai", id: "gpt-6.1-sol", label: "GPT-6.1 Sol" }, builtin: true, available: false, reason: "", account: "" },
  { id: "trivial-implementation", label: "Trivial implementation", purpose: "Writes a small change.", harness: "codex", harnessName: "codex", model: { provider: "openai", id: "gpt-6-luna", label: "GPT-6 Luna" }, builtin: true, available: false, reason: "", account: "" },
  { id: "ui", label: "UI", purpose: "Builds the pages.", harness: "opencode", harnessName: "opencode", model: { provider: "kimi-for-coding", id: "kimi-for-coding/k3", label: "Kimi K3" }, builtin: true, available: false, reason: "", account: "" },
  { id: "fast-ui", label: "Fast UI", purpose: "Builds the pages quickly.", harness: "opencode", harnessName: "opencode", model: { provider: "cerebras", id: "cerebras/qwen-3.8-27b", label: "Cerebras Qwen 3.8 27B" }, builtin: true, available: false, reason: "", account: "" }
]

const PROJECTION = `/api/repos/roninjin10/e2e-verify/contents/.smithers/factory.json`
const HOME = `/api/repos/roninjin10/e2e-verify/home`

/** One `flows` row of the factory projection, on its own wire shape. */
const flowRow = (id: string, model: string | null, description = `Runs ${id}.`) => ({
  id, description, summary: null, featured: false, kind: "mdx", path: `flows/${id}/flow.mdx`,
  capabilities: [], model, modelInvocable: true
})

/** The contents route's document, as the mirror serves it. */
const contents = (flows: ReadonlyArray<unknown>) =>
  ({ path: ".smithers/factory.json", encoding: "utf-8", content: JSON.stringify({ on: [], flows }) })

const hosted = async (options: {
  readonly bootstrap?: AppBootstrap
  readonly routes?: Record<string, unknown>
  readonly selectRepo?: boolean
  /*
   * A card the browser database already held when this launch opened, which
   * is what rehydration hands the controller after a reload. With one, the
   * repository selection is restored before the controller opens too: a
   * reload commits no selection of its own.
   */
  readonly savedCard?: Record<string, unknown>
} = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: string[] = []
  /* Every call of the launch, including the reads the selection started before the command. */
  const everyCall: string[] = []
  const routes = options.routes ?? {}
  /* The operational sink the diagnostics ring forwards to; nothing here reaches the screen. */
  const diagnostics: Array<{ kind: string; body: string }> = []
  const services: AppServices = {
    bootstrap: options.bootstrap ?? HOSTED,
    clientErrors: { report: (kind, error) => void diagnostics.push({ kind, body: String(error) }), reported: () => diagnostics.length },
    toastDebounceMs: 0,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://smithers.sh")
      const method = (init?.method ?? "GET").toUpperCase()
      calls.push(`${method} ${url.pathname}`)
      everyCall.push(`${method} ${url.pathname}`)
      const answer = routes[`${method} ${url.pathname}`]
      if (answer === undefined) return json(404, { status: "error", code: "not_found", message: `no stub for ${method} ${url.pathname}` })
      /* A route may answer a whole Response, or a promise a test never settles. */
      const settledAnswer = answer instanceof Promise ? await answer : answer
      return settledAnswer instanceof Response ? settledAnswer.clone() : json(200, settledAnswer)
    }
  }
  const loadIdentity = () => store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  const loadRepositories = () => store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "roninjin10", ownerKind: "user", name: "e2e-verify", head: { bookmark: "main", changeId: "c", commitId: "k" } }
  ] }).isPersisted.promise
  const selectRepository = () => store.dispatch({ type: "repo.selected", actor: "user", id: REPO }).isPersisted.promise
  /*
   * A reload: the selection and the card are already in the database the
   * launch opens, and the account read lands after the controller is up, with
   * that card restored. That order is the one that found the account
   * listener's stale rewrite.
   */
  if (options.savedCard !== undefined) {
    await loadRepositories()
    if (options.selectRepo !== false) await selectRepository()
    await store.dispatch({ type: "card.upsert", actor: "user", card: options.savedCard as never }).isPersisted.promise
  }
  const controller = createAppController(store, unavailableAgent, services)
  await loadIdentity()
  if (options.savedCard === undefined) {
    await loadRepositories()
    if (options.selectRepo !== false) await selectRepository()
  }
  calls.length = 0
  diagnostics.length = 0
  const card = (): Extract<Card, { kind: "agents" }> | undefined => {
    const row = store.collections.cards.get("agents")
    return row?.kind === "agents" ? row : undefined
  }
  const rows = () => {
    const payload = card()?.payload
    return payload !== undefined && "agents" in payload ? payload.agents : []
  }
  return { store, controller, calls, everyCall, diagnostics, card, rows }
}

/** The Agents card door's own records, in order. */
const inventoryRecords = (diagnostics: ReadonlyArray<{ kind: string; body: string }>): ReadonlyArray<string> =>
  diagnostics.filter(entry => entry.kind === "operational" && entry.body.includes("agents.inventory"))
    .map(entry => (JSON.parse(entry.body) as { subject?: string }).subject ?? "")

/*
 * The reproduction. The repository's catalog declares exactly one flow with a
 * model, so the honest card has exactly one row; before the fix it had six.
 */
test("a hosted host lists the repository's agent flows, never the built-in seed roles", async () => {
  const h = await hosted({ routes: {
    [`GET ${PROJECTION}`]: contents([flowRow("review", "openai:gpt-6.1-sol", "Reviews the working-copy change."), flowRow("checks/lint", null)]),
    [`GET ${HOME}`]: { blocks: [] }
  } })
  try {
    /* The catalog read is the seam's own, started by the selection. */
    await settled()
    const outcome = await h.controller.runCommandForResult("agents")
    expect(outcome).toMatchObject({ status: "executed" })
    expect(h.rows().map(row => row.id)).toEqual(["review"])
    for (const seeded of ["orchestrator", "implementation", "trivial-implementation", "ui", "fast-ui", "explainer"]) {
      expect(h.rows().map(row => row.id)).not.toContain(seeded)
    }
    /* The one row is a repository flow, so its Runs door names work that can exist. */
    expect(h.rows()[0]).toMatchObject({ id: "review", label: "review", builtin: false, model: { provider: "openai", id: "gpt-6.1-sol", label: "GPT-6.1 Sol" } })
    /* The install-only factory route is never called on a host that does not serve it. */
    expect(h.everyCall).not.toContain("GET /api/agents")
    expect(h.everyCall).toContain(`GET ${PROJECTION}`)
    expect(h.card()?.payload).toMatchObject({ inventory: "repository" })
  } finally { await h.controller.dispose() }
})

/*
 * A catalog that answered and declares no flow with a model is a real empty:
 * the card says so, and says it off the READ, not off the seed table.
 */
test("a repository whose catalog declares no agent flow answers an empty card, from the read", async () => {
  const h = await hosted({ routes: {
    [`GET ${PROJECTION}`]: contents([flowRow("checks/lint", null), flowRow("docs", null)]),
    [`GET ${HOME}`]: { blocks: [] }
  } })
  try {
    await settled()
    const outcome = await h.controller.runCommandForResult("agents")
    expect(outcome).toMatchObject({ status: "executed" })
    expect(h.rows()).toEqual([])
    expect(h.card()?.payload).toMatchObject({ inventory: "repository" })
    /* Two flows read, no agent among them: the record tells those apart. */
    expect(inventoryRecords(h.diagnostics)).toEqual(["agents.inventory source=repository catalog=read rows=0 flows=2"])
  } finally { await h.controller.dispose() }
})

/*
 * A projection the mirror has not answered is not an empty repository. The
 * card claims nothing while the read is out, and the subscription fills it in
 * place when the catalog lands.
 */
test("a catalog that has not answered yet claims nothing, and the rows arrive in place", async () => {
  /* The mirror accepted the read and has not answered: not an empty repository. */
  const h = await hosted({ routes: {
    [`GET ${HOME}`]: { blocks: [] },
    [`GET ${PROJECTION}`]: new Promise<never>(() => {})
  } })
  try {
    const outcome = await h.controller.runCommandForResult("agents")
    expect(outcome).toMatchObject({ status: "executed" })
    expect(h.rows()).toEqual([])
    expect(h.card()?.payload).toMatchObject({ inventory: "reading" })
    expect(inventoryRecords(h.diagnostics)).toEqual(["agents.inventory source=reading catalog=none rows=0 flows=0"])
    const before = h.card()!
    /* The catalog lands: the open card follows it, at the same ordinal. */
    await h.store.dispatch({ type: "repository-flows.loaded", actor: "system", repo: REPO,
      flows: [{ id: "review", description: "Reviews the change.", summary: null, featured: false, model: "openai:gpt-6.1-sol", modelInvocable: true }] }).isPersisted.promise
    await settled()
    expect(h.rows().map(row => row.id)).toEqual(["review"])
    expect(h.card()!.ordinal).toBe(before.ordinal)
    expect(h.card()!.payload).toMatchObject({ inventory: "repository" })
  } finally { await h.controller.dispose() }
})

/*
 * No repository is named, so there is no catalog to read. The card says that,
 * and lists nothing: it does not reach for the install-only route, and it does
 * not read "no catalog" as "no agents".
 */
test("a host with no repository named states it has no catalog to read, and lists nothing", async () => {
  const h = await hosted({ selectRepo: false, routes: {} })
  try {
    await h.store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [] }).isPersisted.promise
    const outcome = await h.controller.runCommandForResult("agents")
    expect(outcome).toMatchObject({ status: "executed" })
    expect(h.rows()).toEqual([])
    expect(h.card()?.payload).toMatchObject({ inventory: "no-repository" })
    expect(h.everyCall).not.toContain("GET /api/agents")
    expect(inventoryRecords(h.diagnostics)).toEqual(["agents.inventory source=no-repository catalog=none rows=0 flows=0"])
  } finally { await h.controller.dispose() }
})

/*
 * The record is a diagnostic, not a payload: the closed vocabulary and two
 * counts, and never the repository, a flow id, a model, a URL or a backend
 * sentence. A read that answered rows records nothing at all.
 */
test("the inventory record carries its codes and counts and nothing else", async () => {
  const h = await hosted({ routes: {
    [`GET ${PROJECTION}`]: contents([flowRow("checks/lint", null)]),
    [`GET ${HOME}`]: { blocks: [] }
  } })
  try {
    await settled()
    await h.controller.runCommandForResult("agents")
    const records = inventoryRecords(h.diagnostics)
    expect(records).toHaveLength(1)
    for (const record of records) {
      for (const secret of [REPO, "e2e-verify", "roninjin10", "checks/lint", "factory.json", "/api/", "gpt-6.1-sol", "not_found"]) {
        expect(record).not.toContain(secret)
      }
    }
  } finally { await h.controller.dispose() }
})

test("a read that answered rows records nothing", async () => {
  const h = await hosted({ routes: {
    [`GET ${PROJECTION}`]: contents([flowRow("review", "openai:gpt-6.1-sol")]),
    [`GET ${HOME}`]: { blocks: [] }
  } })
  try {
    await settled()
    await h.controller.runCommandForResult("agents")
    expect(h.rows()).toHaveLength(1)
    expect(inventoryRecords(h.diagnostics)).toEqual([])
  } finally { await h.controller.dispose() }
})

/*
 * `/agent <name>` is the other half of the person's journey: it filters the
 * card to one row. A name the catalog that ANSWERED does not hold is the
 * install's own 404 words for it, never a card filtered down to nothing — and
 * the five seed ids are exactly such names on this host.
 */
test("/agent for a name the catalog does not hold answers the install's words, and opens no filtered-empty card", async () => {
  const h = await hosted({ routes: {
    [`GET ${PROJECTION}`]: contents([flowRow("review", "openai:gpt-6.1-sol")]),
    [`GET ${HOME}`]: { blocks: [] }
  } })
  try {
    await settled()
    const seeded = await h.controller.runCommandForResult("agent", "orchestrator")
    expect(seeded).toMatchObject({ status: "failed" })
    expect(seeded.status === "failed" ? seeded.error : "").toBe("Agent not found")
    expect(h.card()).toBeUndefined()
    /* A name the catalog DOES hold opens the card filtered to it. */
    const real = await h.controller.runCommandForResult("agent", "review")
    expect(real).toMatchObject({ status: "executed" })
    expect(h.card()?.payload).toMatchObject({ selectedAgent: "review" })
    expect(h.rows().map(row => row.id)).toEqual(["review"])
  } finally { await h.controller.dispose() }
})

/*
 * An install DOES serve the factory inventory, and it stays the authority
 * there: the rows are the four profiles `GET /api/agents` answered, and the
 * repository's own catalog is not folded into them.
 */
test("an install serves its own factory inventory, and the repository catalog does not join it", async () => {
  const h = await hosted({
    bootstrap: { ...HOSTED, capabilities: [...HOSTED.capabilities, "install"] },
    routes: {
      [`GET ${PROJECTION}`]: contents([flowRow("review", "openai:gpt-6.1-sol")]),
      [`GET ${HOME}`]: { blocks: [] },
      "GET /api/agents": { native: false, canAssign: false, agents: [
        { id: "reviewer", label: "Reviewer agent", purpose: "Reviews a change.", model: { provider: "openai", id: "model-a", label: "model-a" },
          source: "owner", builtin: true, available: true, reason: "", account: "will@example.com" }
      ] }
    }
  })
  try {
    await h.controller.runCommandForResult("agents")
    await settled()
    expect(h.rows().map(row => row.id)).toEqual(["reviewer"])
    expect(h.everyCall).toContain("GET /api/agents")
    /* The served inventory names its own source, and it is not the catalog's. */
    expect(h.card()?.payload).toMatchObject({ inventory: "host" })
    expect(inventoryRecords(h.diagnostics)).toEqual([])
  } finally { await h.controller.dispose() }
})

/*
 * Reload. A saved row's facts come from the seed table only when the row
 * itself claimed to be built-in: a repository agent flow whose id happens to
 * be `ui` is that repository's flow, and rehydration may not relabel it as
 * the built-in UI role with the built-in's model.
 */
test("a saved repository agent flow named after a built-in role keeps its own facts on reload", () => {
  const saved = {
    id: "agents", kind: "agents", title: "Agents", status: "active", createdAt: 1, ordinal: 1,
    payload: { native: false, inventory: "repository", agents: [
      { id: "ui", label: "ui", purpose: "Builds this repository's UI pages.", model: { provider: "openai", id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
        builtin: false, available: false, reason: "", account: "" }
    ] }
  }
  const parsed = CardSchema.parse(saved)
  const rows = parsed.kind === "agents" && "agents" in parsed.payload ? parsed.payload.agents : []
  expect(rows).toEqual([{ id: "ui", label: "ui", purpose: "Builds this repository's UI pages.",
    model: { provider: "openai", id: "gpt-6.1-sol", label: "GPT-6.1 Sol" }, builtin: false, available: false, reason: "", account: "" }])
  /* A row that DOES claim the table still reads its facts from it. */
  const builtin = CardSchema.parse({ ...saved, payload: { ...saved.payload, agents: [{ ...saved.payload.agents[0], builtin: true, label: "stale", model: { provider: "x", id: "stale", label: "stale" } }] } })
  const table = builtin.kind === "agents" && "agents" in builtin.payload ? builtin.payload.agents[0] : undefined
  expect(table).toMatchObject({ id: "ui", label: "UI", builtin: true, model: { provider: "kimi-for-coding", id: "kimi-for-coding/k3", label: "Kimi K3" } })
})

/*
 * The retest root will actually run. The Agents card is conversation state in
 * the browser database (e2e/real/agents.spec.ts pins the reload), so root's
 * OPEN card — the five seed rows, saved by the build that listed them — is
 * what the fixed build reads back. A row that says `builtin: true` is
 * refreshed from the seed table on decode, so a reload alone put every one of
 * them back on the screen: the card followed the repository only on the next
 * committed transition, and a reload commits none.
 *
 * A host that answers for no seed row may not restore a card that lists them.
 */
test("a card saved with the seed rows does not come back on a reload", async () => {
  const h = await hosted({
    savedCard: {
      id: "agents", kind: "agents", title: "Agents", status: "active", createdAt: 1, ordinal: 1,
      payload: { native: false, agents: SEED_ROWS }
    },
    routes: {
      [`GET ${PROJECTION}`]: contents([flowRow("review", "openai:gpt-6.1-sol")]),
      [`GET ${HOME}`]: { blocks: [] }
    }
  })
  try {
    await settled()
    for (const seeded of SEED_ROWS) expect(h.rows().map(row => row.id)).not.toContain(seeded.id)
    expect(h.rows().map(row => row.id)).toEqual(["review"])
    expect(h.card()?.payload).toMatchObject({ inventory: "repository" })
    /* The restored card keeps its place in the transcript; it is not re-asked for. */
    expect(h.card()!.ordinal).toBe(1)
    expect(h.card()!.createdAt).toBe(1)
  } finally { await h.controller.dispose() }
})

/*
 * A REFUSED catalog read is not a repository with no agents. The seam writes
 * `flows: []` for all three of an answered-and-empty catalog, a repository
 * with no `.smithers/factory.json` and a read the mirror refused
 * (seams/RepositoryFlowsSeam.ts), so the row's own `catalog` outcome is the
 * only thing that tells them apart. Reading the refusal as an empty inventory
 * is the same class of claim as the seed rows: a fact no source stated.
 */
for (const [label, status] of [["unauthorized", 401], ["refused", 500]] as const) {
  test(`a catalog read the mirror ${label} states a prerequisite, not an empty inventory`, async () => {
    const h = await hosted({ routes: {
      [`GET ${PROJECTION}`]: json(status, { status: "error", code: "refused", message: "the mirror did not answer" }),
      [`GET ${HOME}`]: { blocks: [] }
    } })
    try {
      await settled()
      const outcome = await h.controller.runCommandForResult("agents")
      expect(outcome).toMatchObject({ status: "executed" })
      expect(h.rows()).toEqual([])
      expect(h.card()?.payload).toMatchObject({ inventory: "unreadable" })
      expect(inventoryRecords(h.diagnostics)).toEqual(["agents.inventory source=unreadable catalog=unreadable rows=0 flows=0"])
      /* The refusal is not a reason to ask the route this host does not serve. */
      expect(h.everyCall).not.toContain("GET /api/agents")
      /*
       * And it holds no verdict about a name either: `/agent review` on a host
       * that could not read its catalog is not "Agent not found".
       */
      const named = await h.controller.runCommandForResult("agent", "review")
      expect(named).toMatchObject({ status: "executed" })
      expect(h.card()?.payload).toMatchObject({ inventory: "unreadable" })
    } finally { await h.controller.dispose() }
  })
}

/*
 * A repository with no `.smithers/factory.json` DID answer: it declares no
 * agents. The card says so, and the record keeps the two apart for a retest
 * that has to know whether the repository has a catalog at all.
 */
test("a repository with no catalog at all declares no agents, and the record says which", async () => {
  const h = await hosted({ routes: {
    [`GET ${PROJECTION}`]: json(404, { status: "error", code: "not_found", message: "no projection" }),
    [`GET ${HOME}`]: { blocks: [] }
  } })
  try {
    await settled()
    await h.controller.runCommandForResult("agents")
    expect(h.rows()).toEqual([])
    expect(h.card()?.payload).toMatchObject({ inventory: "repository" })
    expect(inventoryRecords(h.diagnostics)).toEqual(["agents.inventory source=repository catalog=absent rows=0 flows=0"])
  } finally { await h.controller.dispose() }
})

/*
 * The same reload, with the catalog read refused. A card corrected only by the
 * rows of the next committed change is corrected by nothing here, so the seed
 * rows would stay on the screen for as long as the person does not act.
 */
test("a card saved with the seed rows does not survive a reload whose catalog read is refused", async () => {
  const h = await hosted({
    savedCard: {
      id: "agents", kind: "agents", title: "Agents", status: "active", createdAt: 1, ordinal: 1,
      payload: { native: false, agents: SEED_ROWS }
    },
    routes: {
      [`GET ${PROJECTION}`]: json(500, { status: "error", code: "refused", message: "the mirror did not answer" }),
      [`GET ${HOME}`]: { blocks: [] }
    }
  })
  try {
    await settled()
    for (const seeded of SEED_ROWS) expect(h.rows().map(row => row.id)).not.toContain(seeded.id)
    expect(h.rows()).toEqual([])
    expect(h.card()?.payload).toMatchObject({ inventory: "unreadable" })
    expect(h.everyCall).not.toContain("GET /api/agents")
  } finally { await h.controller.dispose() }
})
