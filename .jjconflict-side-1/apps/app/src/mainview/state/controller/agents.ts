import { actorSharedState } from "../ActorBindings"
import { Data } from "effect"
import { randomUuid } from "../../runtime/RandomUuid"
import { agentsFailure, AgentsRefusal, assignInstallAgentModel } from "./models"
import { CardSchema } from "@smthrs/rpc/Cards"
import type { LiveChannel } from "../../runtime/LiveChannel"
import {
  knownModelLabel,
  MODEL_ID
} from "@smthrs/rpc/AgentRoles"
import type { Card, RepositoryFlow } from "../AppState"
import type { AppStore } from "../AppStore"
import { resolveTargetRepo } from "../RepoContext"
import type { ControllerContext } from "./context"

export const AGENTS_CARD_ID = "agents"

type AgentsCard = Extract<Card, { kind: "agents" }>
/** One row of the Agents card: a host's factory profile, or a repository agent flow. */
export type AgentProfileRow = Extract<AgentsCard["payload"], { native: boolean }>["agents"][number]
/** Which source the card's rows are, and how far it got (`@smthrs/rpc/Cards`). */
export type AgentsInventory = NonNullable<Extract<AgentsCard["payload"], { native: boolean }>["inventory"]>

export interface AgentsController {
  /** `agent.list`: the Agents card, at the transcript's tail. */
  readonly assignAgentModel: (role: string, model: string) => Promise<string | void>
  readonly listAgents: (role?: string, model?: string) => Promise<string | void>

}

export interface AgentsControllerDependencies {
  readonly refreshSettings?: () => Promise<unknown>
  readonly install?: boolean
  readonly live?: Pick<LiveChannel, "subscribe" | "getSnapshot">
  readonly nextOrdinal: () => number
}

/**
 * The model a flow declares, as its frontmatter wrote it: `provider:modelId`
 * or a bare seat name (`sol`). The row shows the display name the built-in
 * roles give that id ("GPT-6 Sol") when it is a known one, else the id as
 * written, never a label this app invented; a seat the harness could read
 * as a flag is no model.
 */
export const flowModelOf = (seat: string): AgentProfileRow["model"] | undefined => {
  const written = seat.trim()
  const colon = written.indexOf(":")
  const provider = colon === -1 ? "" : written.slice(0, colon)
  const id = colon === -1 ? written : written.slice(colon + 1)
  return MODEL_ID.test(id) ? { provider, id, label: knownModelLabel(id) ?? id } : undefined
}

/**
 * A flow with a model is an agent: its row, or none for a flow that names no
 * model. Its label is its id: neither `flow.mdx` frontmatter (description,
 * capabilities, model, flows, budget) nor the factory projection (id,
 * description, summary, featured) declares a title or name for a flow.
 */
export const agentProfileOf = (flow: RepositoryFlow): AgentProfileRow | undefined => {
  if (flow.model === null) return undefined
  const model = flowModelOf(flow.model)
  if (model === undefined) return undefined
  return { id: flow.id, label: flow.id, purpose: flow.description, model, builtin: false, available: false, reason: "", account: "" }
}

/**
 * The target repository's agents, WITH the stage of the read that would have
 * answered them.
 *
 * The rows are its flow catalog rows that declare a model
 * (`.smithers/flows/<name>/flow.mdx` with `model`), in catalog order, off the catalog
 * the slash leaves and the homepage read (seams/RepositoryFlowsSeam.ts). That
 * catalog is this host's ONLY agent source when it holds no `install` row: the
 * factory inventory lives behind `GET /api/agents`, which
 * `packages/backend/internal/compose/chat_routes.go` mounts under
 * `config.IsSingleOwner(cfg.Auth)` alone — the same condition the bootstrap's
 * `install` row states (flows/DoorAvailability.ts).
 *
 * `inventory` is why the rows are what they are, so no caller has to read an
 * empty array as a verdict: a repository that has not answered yet, one whose
 * read was REFUSED, and one that answered and declares no agent flow are three
 * different facts, and only the third is an empty inventory
 * ([#3831](https://github.com/smithersai/smithers/issues/3831)). The seam's
 * row carries which one through `catalog`, because `flows: []` is what all
 * three leave behind (seams/RepositoryFlowsSeam.ts). `flows` is the catalog's
 * size, which is how an empty list of AGENTS is told apart from an empty
 * CATALOG without naming a flow; `declared` is whether the repository has a
 * catalog at all, which the counts alone cannot say.
 */
export const repositoryAgentCatalog = (store: AppStore): {
  readonly inventory: AgentsInventory
  readonly rows: ReadonlyArray<AgentProfileRow>
  readonly flows: number
  readonly declared: "read" | "absent" | "unreadable" | "none"
} => {
  const target = resolveTargetRepo(store, undefined)
  if ("error" in target) return { inventory: "no-repository", rows: [], flows: 0, declared: "none" }
  const catalog = store.collections.repositoryFlows.get(target.repo)
  if (catalog === undefined) return { inventory: "reading", rows: [], flows: 0, declared: "none" }
  /*
   * The read was refused. The row exists, so the read HAPPENED, but it holds
   * no catalog: this host has no agent source it can state, which is a
   * prerequisite, never an inventory of none.
   */
  if (catalog.catalog === "unreadable") return { inventory: "unreadable", rows: [], flows: 0, declared: "unreadable" }
  return {
    inventory: "repository",
    rows: catalog.flows.flatMap((flow) => {
      const row = agentProfileOf(flow)
      return row === undefined ? [] : [row]
    }),
    flows: catalog.flows.length,
    declared: catalog.catalog ?? "read"
  }
}

/**
 * What the Agents card answered, as a TAGGED failure, for the record below.
 *
 * `ctx.failures.report` forwards an error; this record is an outcome of the
 * healthy path and has none to forward, so it makes its own rather than a raw
 * `new Error`, which `RawErrorSites.test.ts` (#2813) refuses in product code.
 * The tag never reaches a card, and `inventory` is the same closed vocabulary
 * as the subject, so nothing new can ride along.
 */
class AgentsInventoryOutcome extends Data.TaggedError("AgentsInventoryOutcome")<{ readonly inventory: AgentsInventory }> {}

export const createAgentsController = (ctx: ControllerContext, deps: AgentsControllerDependencies): AgentsController => {
  const { store } = ctx
  const { collections } = store

  const agentsCard = (): AgentsCard | undefined => {
    const card = collections.cards.get(AGENTS_CARD_ID)
    return card?.kind === "agents" ? card : undefined
  }

  const shared = actorSharedState(ctx, "agents", () => ({
    served: undefined as AgentsCard["payload"] | undefined, stopLive: undefined as (() => void) | undefined,
    selectedAgent: undefined as string | undefined, selectedModel: undefined as string | undefined, generation: 0, pending: new Set<string>(), assignmentTail: Promise.resolve() as Promise<unknown>
  }))
  /*
   * The rows this HOST answered for, and nothing else.
   *
   * `shared.served` is the factory inventory `GET /api/agents` answered. An
   * origin that serves that route says so in its bootstrap (`install`), and
   * nowhere else does the route exist: the hosted Cloud mounts neither it nor
   * any projection of it, and its own factory ids (`planner`, `implementer`,
   * `reviewer`, `app`) are not even the ids of the client table that used to
   * stand in for them here.
   *
   * So a host without `install` has exactly one agent source — the target
   * repository's flow catalog — and the five built-in roles of
   * `@smthrs/rpc/AgentRoles` were seed rows of this module's own, listed with
   * their local harnesses and their declared models as if the host had
   * answered for them. It never had. They stay the declared factory table that
   * `state/AppProjection.ts` keeps in `collections.agents` for the model
   * menus and that `knownModelLabel` reads for a display name; they are not
   * this host's inventory, and a card is inventory
   * ([#3831](https://github.com/smithersai/smithers/issues/3831)).
   *
   * Every row the card renders therefore carries its own Runs door honestly:
   * a repository agent flow IS a flow, so `runs.list flow=<id>` names recorded
   * work that can exist. `orchestrator` was never a flow of any repository,
   * and its Runs button could only ever reach a box prerequisite for a filter
   * that matches nothing.
   */
  const agentsPayload = (): AgentsCard["payload"] => {
    if (shared.served !== undefined) return shared.served
    if (deps.install) return { native: false, install: true, agents: [] }
    const catalog = repositoryAgentCatalog(store)
    return { native: false, inventory: catalog.inventory, agents: [...catalog.rows] }
  }

  /**
   * The card's own record of an answer that held no rows, through
   * `ctx.failures` — the operational ring and the client error sink, never the
   * screen (state/OperationalFailures.ts dedupes a repeated key for a minute).
   *
   * The production cause could not be read off anything the app recorded: the
   * screen showed five rows no host had answered for, and the ring held
   * nothing about the read at all. So the door records WHICH source answered
   * and what it held — the closed `inventory` and catalog vocabularies and two
   * counts. `catalog` is how a repository that declares no catalog at all is
   * told from one whose catalog declares no agent, which the counts alone
   * cannot say. The record carries no repository, flow id, model, URL, header,
   * credential or backend sentence; a healthy answer with rows records
   * nothing.
   */
  const reportInventory = (catalog: ReturnType<typeof repositoryAgentCatalog>): void => {
    if (catalog.rows.length > 0) return
    ctx.failures.report(
      "agents.inventory",
      new AgentsInventoryOutcome({ inventory: catalog.inventory }),
      `agents.inventory source=${catalog.inventory} catalog=${catalog.declared} rows=${catalog.rows.length} flows=${catalog.flows}`
    )
  }

  /** The Agents card: at the tail when the human (or the model) asked for it, in place when a mutation refreshes it. */
  const renderAgentsCard = (toTail: boolean, error?: string): void => {
    const existing = agentsCard()
    if (!toTail && existing === undefined) return
    store.dispatch({
      type: "card.upsert",
      actor: ctx.commandActor,
      card: {
        id: AGENTS_CARD_ID,
        kind: "agents",
        title: "Agents",
        status: "active",
        createdAt: existing?.createdAt ?? Date.now(),
        ordinal: toTail || existing === undefined ? deps.nextOrdinal() : existing.ordinal,
        payload: { ...agentsPayload(), ...(existing && "agents" in existing.payload && existing.payload.testing ? { testing: existing.payload.testing } : {}), ...(existing && "agents" in existing.payload && existing.payload.testRequests ? { testRequests: existing.payload.testRequests } : {}), ...(shared.selectedAgent ? { selectedAgent: shared.selectedAgent } : {}), ...(shared.selectedModel ? { selectedModel: shared.selectedModel } : {}), ...(error === undefined ? {} : { error }) }
      }
    })
  }

  /*
   * An open card follows the repository: its catalog loads after the card
   * was asked for, or the target changes, and the rows would go stale. The
   * check runs after each committed batch (like the flows seam's target
   * read) and rewrites the card only when what it states differs, so the
   * rewrite itself settles it.
   *
   * What it states is the rows AND the stage they came from. A catalog that
   * answers with no agent flow leaves the rows unchanged (both empty) while
   * turning "has not answered" into "answered and declares none", so
   * comparing the rows alone would hold the card on its loading sentence for
   * good.
   */
  const rows = (payload: AgentsCard["payload"]): string =>
    JSON.stringify("agents" in payload ? [payload.inventory ?? "", payload.agents] : [])
  const subscription = collections.transitions.subscribeChanges((changes) => {
    if (!changes.some((change) => change.type === "insert")) return
    queueMicrotask(() => {
      if (ctx.disposed) return
      const existing = agentsCard()
      if (existing === undefined || "cloud" in existing.payload) return
      if (rows(existing.payload) !== rows(agentsPayload())) renderAgentsCard(false, existing.payload.error)
    })
  })
  void ctx.onDispose(() => { subscription.unsubscribe() })

  const accept = (payload: unknown, tail: boolean) => {
    const parsed = CardSchema.safeParse({ id: AGENTS_CARD_ID, kind: "agents", title: "Agents", status: "active", createdAt: Date.now(), ordinal: 0, payload })
    if (!parsed.success || parsed.data.kind !== "agents") throw new Error("Invalid agents response")
    /*
     * The route answered, so this payload's source is the HOST's own factory
     * inventory. It says so, because every payload the card renders must name
     * the source of its rows: an empty one that names none leaves the card
     * with no sentence at all (cards/AgentCards.tsx).
     */
    shared.served = "agents" in parsed.data.payload ? { ...parsed.data.payload, inventory: "host" as const } : parsed.data.payload
    renderAgentsCard(tail)
  }
  const listAgents: AgentsController["listAgents"] = async (role, model) => {
    /*
     * Off an install the card is the target repository's catalog, so the door
     * records which source answered it before it renders anything.
     */
    if (!deps.install && shared.served === undefined) {
      const catalog = repositoryAgentCatalog(store)
      reportInventory(catalog)
      /*
       * `/agent <name>` filters the card to one row. A name the catalog that
       * ANSWERED does not hold gets the install's own words for it
       * (`compose/agent_models.go`: GET /api/agents/{name} is a 404 "Agent not
       * found"), never a card filtered down to nothing. A catalog still
       * reading, or a host with no repository to read, holds no such verdict:
       * the card states its own stage, which is also what `model.list` and the
       * model acts refresh through this same door.
       */
      if (role !== undefined && catalog.inventory === "repository" && !catalog.rows.some((row) => row.id === role)) return "Agent not found"
    }
    shared.selectedAgent = role
    shared.selectedModel = model
    renderAgentsCard(true)
    if (!deps.install) return
    const request = ++shared.generation
    const epoch = ctx.accountEpoch
    void (async () => {
      try {
        const response = await ctx.http(`${ctx.baseUrl.replace(/\/$/, "")}/api/agents`, { credentials: "same-origin" })
        if (!response.ok) throw new AgentsRefusal({ sentence: await ctx.errorMessageOf(response, "Could not read agents") })
        const body: unknown = await response.json()
        if (ctx.disposed || epoch !== ctx.accountEpoch || request !== shared.generation) return
        const assignment = shared.served && "agents" in shared.served ? shared.served.assignment : undefined
        accept({ ...body as object, ...(assignment ? { assignment } : {}) }, false)
        if (!shared.stopLive && deps.live) shared.stopLive = deps.live.subscribe("agents", () => {
          if (ctx.disposed || epoch !== ctx.accountEpoch) return
          const snapshot = deps.live?.getSnapshot("agents")
          if (snapshot?.data !== undefined) {
            try { accept({ ...snapshot.data as object, ...(shared.served && "agents" in shared.served && shared.served.assignment ? { assignment: shared.served.assignment } : {}), canAssign: shared.served && "canAssign" in shared.served ? shared.served.canAssign : false }, false) } catch { renderAgentsCard(false, "Could not read agents") }
          }
        })
      } catch (error) { if (!ctx.disposed && request === shared.generation) renderAgentsCard(false, agentsFailure(error, "Could not read agents").detail) }
    })()
  }
  const launchAssignment = (request: { id: string; role: string; model: string; state: "requested" | "failed" }, reserved = false) => {
    const key = `${request.role}:${request.model}`
    if (!reserved && shared.pending.has(key)) return
    shared.pending.add(key)
    const epoch = ctx.accountEpoch
    const prior = shared.assignmentTail
    let release!: () => void
    shared.assignmentTail = new Promise<void>(done => { release = done })
    void ctx.withToast(`agent.model.${request.id}`, "Saving model", "Model saved", async () => {
      try {
        await prior
        if (ctx.disposed || epoch !== ctx.accountEpoch) return true
        const body = await assignInstallAgentModel(ctx, request.role, request.model)
        if (!ctx.disposed && epoch === ctx.accountEpoch && shared.served && "agents" in shared.served && shared.served.assignment?.id === request.id) accept(body, false)
        if (!ctx.disposed && epoch === ctx.accountEpoch) void deps.refreshSettings?.()
        return true
      } catch (error) {
        const failure = agentsFailure(error, "Could not save model")
        if (!ctx.disposed && epoch === ctx.accountEpoch && shared.served && "agents" in shared.served && shared.served.assignment?.id === request.id) {
          shared.served = { ...shared.served, assignment: { ...request, state: "failed" } }
          renderAgentsCard(false, failure.detail)
        }
        return failure.sentence
      } finally { shared.pending.delete(key); release() }
    }, false, () => !ctx.disposed, AGENTS_CARD_ID)
  }
  const assignAgentModel: AgentsController["assignAgentModel"] = async (role, model) => {
    if (ctx.commandActor !== "user" || !deps.install) return "Owner access required"
    const key = `${role}:${model}`
    if (shared.pending.has(key)) return
    if (!shared.served) {
      /* A placeholder the route has not answered yet, so it states that stage and not an empty inventory. */
      shared.served = { native: false, inventory: "reading", agents: [] }
      renderAgentsCard(true)
    }
    if (!("agents" in shared.served)) return "Agents unavailable"
    const request = { id: randomUuid(), role, model, state: "requested" as const }
    shared.pending.add(key)
    shared.served = { ...shared.served, assignment: request }
    renderAgentsCard(false)
    await store.settled?.()
    launchAssignment(request, true)
  }
  const recovered = agentsCard()?.payload
  if (deps.install && recovered && "agents" in recovered && recovered.assignment?.state === "requested") {
    shared.served = recovered
    shared.selectedAgent = recovered.selectedAgent
    shared.selectedModel = recovered.selectedModel
    queueMicrotask(() => { if (!ctx.disposed && ctx.commandActor === "user") launchAssignment(recovered.assignment!) })
  }

  /*
   * The account changed, so the served inventory belonged to someone else:
   * it is dropped and the open card is rewritten off this account's source.
   *
   * The rewrite waits for a microtask, like the transition subscription's. The
   * listeners run inside the dispatch that changed the account, and a second
   * dispatch from inside that one is based on state that has not persisted:
   * with an Agents card already open — which is exactly what a reload
   * restores — the rewrite made the identity dispatch itself fail
   * (chain/DurableCollection.ts `StaleDurableMutationError`).
   */
  const stopAccount = ctx.onAccountChange?.(() => {
    shared.generation++; shared.stopLive?.(); shared.stopLive = undefined; shared.served = undefined; shared.selectedAgent = undefined; shared.selectedModel = undefined
    queueMicrotask(() => { if (!ctx.disposed) renderAgentsCard(false) })
  })
  void ctx.onDispose(() => { stopAccount?.(); shared.generation++; shared.stopLive?.() })


  return { listAgents, assignAgentModel }
}
