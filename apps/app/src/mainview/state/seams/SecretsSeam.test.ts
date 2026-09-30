import type { StorageApi } from "@tanstack/db"
import { afterEach, describe, expect, test } from "bun:test"

import type { AgentPort } from "../../runtime/AgentPort"
import { scopedControllers } from "../ControllerTestScope"
import type { AppServices } from "../AppController"
import { createAppStore as openAppStore } from "../AppStore"
import type { AppStore } from "../AppStore"

const stores = new Set<AppStore>()
const tasks = new Set<Promise<unknown>>()
const releases = new Set<() => void>()
const unexpectedHttp: string[] = []
const checkpoint = () => new Promise<void>(resolve => setImmediate(resolve))
const bounded = async <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Secret fixture did not settle")), 3_000)
    })])
  } finally { clearTimeout(timer) }
}
const track = <T>(promise: Promise<T>): Promise<T> => { tasks.add(promise); return promise }
const createAppStore: typeof openAppStore = async (...args) => {
  const store = await openAppStore(...args)
  stores.add(store)
  return store
}
const heldResponse = () => {
  const held = Promise.withResolvers<Response>()
  releases.add(() => held.resolve(json(503, {})))
  track(held.promise)
  return held
}
// Release transport barriers before scopedControllers fences every controller.
afterEach(() => { for (const release of releases) release(); releases.clear() })
const createAppController = scopedControllers()
afterEach(async () => {
  const errors: unknown[] = []
  try {
    let previous = -1
    while (previous !== tasks.size) {
      previous = tasks.size
      await bounded(Promise.allSettled([...tasks]))
      await checkpoint()
    }
  } catch (error) { errors.push(error) }
  finally {
    tasks.clear()
    for (const store of stores) {
      try {
        if (typeof store.dispose !== "function") throw new Error("Secret fixture store has no disposal authority")
        await store.dispose()
      } catch (error) { errors.push(error) }
    }
    stores.clear()
  }
  const unexpected = unexpectedHttp.splice(0)
  if (unexpected.length) errors.push(new Error(`Unplanned secret HTTP: ${unexpected.join(", ")}`))
  if (errors.length) throw new AggregateError(errors, "Secret fixture cleanup failed")
})

/*
 * The secrets seam (SecretsSeam.ts) through the real command path:
 * /secrets.list reads GET /api/repos/{owner}/{repo}/agent-environment and
 * surfaces the "secrets" card with each secret's metadata (name, hosts,
 * match headers, updated time) and a model-readable result, never secret
 * values. Failures are honest strings, never throws; signed out, the agent
 * door names the sign-in step.
 */

const memoryStorage = (): StorageApi => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key)
  }
}

const unavailableAgent: AgentPort = {
  available: false,
  startTurn: async () => ({ status: "error", message: "unavailable" }),
  cancelTurn: async () => {},
  subscribe: () => () => {}
}


const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })


type Failure = "empty" | "get-500" | "get-403" | "get-throw" | "malformed"

/** The platform double: plue's AgentEnvironmentResponse plus an unexpected secret value to verify metadata-only parsing. */
const backend = (failure?: Failure) => {
  const requests: Array<{ readonly method: string; readonly url: string }> = []
  const services: AppServices = {
    fetchImpl: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? "GET"
      if (!url.includes("/agent-environment")) {
        unexpectedHttp.push(url)
        throw new Error(`Unplanned secret HTTP: ${url}`)
      }
      requests.push({ method, url })
      if (failure === "get-throw") throw new Error("socket hang up")
      if (failure === "get-500") return json(500, { message: "the platform fell over" })
      if (failure === "get-403") return json(403, { message: "forbidden: repository write access required" })
      if (failure === "malformed") return json(200, { setup_script: "", env: [], secrets: [{ hosts: [] }] })
      return json(200, {
        setup_script: "bun install",
        env: [{ name: "CI", value: "1" }],
        secrets: failure === "empty" ? [] : [
          {
            name: "NPM_TOKEN",
            value: "DO_NOT_EXPOSE_SECRET_BYTES",
            hosts: ["registry.npmjs.org"],
            match_headers: ["authorization"],
            updated_at: "2026-08-01T00:00:00.000Z"
          },
          { name: "SETUP_ONLY", hosts: [], match_headers: [], updated_at: "2026-08-02T00:00:00.000Z" }
        ],
        updated_at: "2026-08-02T00:00:00.000Z"
      })
    }
  }
  return { services, requests }
}

// Repo admission performs these adjacent discovery reads; they have no content in this fixture.
const discoveryRoutes = new Set([
  "/api/repos/will/flows/contents/.smithers/factory.json", "/api/repos/will/flows/home",
  ...["issues", "review", "ci", "feature", "chores"].map(job => `/api/repository-setup/state?repo=will%2Fflows&job=${job}`)
])
const controllerServices = (services: AppServices): AppServices => ({
  ...services,
  fetchImpl: (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    if (discoveryRoutes.has(url)) return Promise.resolve(json(404, {}))
    if (typeof services.fetchImpl !== "function") throw new Error("Secret fixture has no HTTP authority")
    return track(Promise.resolve(services.fetchImpl(input, init)))
  }
})

const freshController = async (failure?: Failure, services?: AppServices) => {
  const stub = backend(failure)
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  return {
    store,
    requests: stub.requests,
    controller: createAppController(store, unavailableAgent, controllerServices(services ?? stub.services))
  }
}

const signedIn = async (store: AppStore): Promise<void> => {
  await store.dispatch({
    type: "identity.session.loaded",
    actor: "system",
    state: "signed-in",
    login: "will",
    allowlisted: true,
    admin: false,
    scopesPlain: null
  }).isPersisted.promise
}

const signedOut = async (store: AppStore): Promise<void> => {
  await store.dispatch({
    type: "identity.session.loaded",
    actor: "system",
    state: "signed-out",
    login: null,
    allowlisted: false,
    admin: false,
    scopesPlain: null
  }).isPersisted.promise
}

const reposChosen = async (store: AppStore): Promise<void> => {
  await store.dispatch({
    type: "repositories.loaded",
    actor: "system",
    repositories: [{ id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null }]
  }).isPersisted.promise
}

const ready = async (store: AppStore): Promise<void> => {
  await signedIn(store)
  await reposChosen(store)
}

const secretsCard = (store: AppStore, repo = "will/flows") => {
  const card = store.collections.cards.get(`secrets-${repo}`)
  if (card === undefined || card.kind !== "secrets") return undefined
  return card
}

describe("secrets seam — secrets.list", () => {
  test("surfaces the secrets card from the agent-environment answer: name, hosts, header, updated time, no secret value", async () => {
    const { store, controller, requests } = await freshController()
    await ready(store)
    const outcome = await controller.commands.run("secrets.list")
    expect(outcome.status).toBe("executed")
    const value = outcome.status === "executed" ? outcome.value : undefined
    for (const text of ["will/flows", "NPM_TOKEN", "registry.npmjs.org", "authorization", "2026-08-01T00:00:00.000Z", "SETUP_ONLY"]) {
      expect(value).toContain(text)
    }
    expect(value).not.toContain("DO_NOT_EXPOSE_SECRET_BYTES")
    expect(value).not.toContain("bun install")

    expect(requests).toEqual([{ method: "GET", url: "/api/repos/will/flows/agent-environment" }])
    const card = secretsCard(store)
    expect(card).toBeDefined()
    expect(card?.title).toBe("Secrets · will/flows")
    expect(card?.status).toBe("active")
    expect(card?.payload.repo).toBe("will/flows")
    expect(card?.payload.scope).toBe("repository")
    expect(card?.payload.secrets).toEqual([
      { name: "NPM_TOKEN", hosts: ["registry.npmjs.org"], matchHeaders: ["authorization"], updatedAt: "2026-08-01T00:00:00.000Z" },
      { name: "SETUP_ONLY", hosts: [], matchHeaders: [], updatedAt: "2026-08-02T00:00:00.000Z" }
    ])
    // The environment's vars and setup script are the env card's, not this one's.
    expect(JSON.stringify(card)).not.toContain("DO_NOT_EXPOSE_SECRET_BYTES")
    expect(JSON.stringify(card)).not.toContain("bun install")
    expect(JSON.stringify(card)).not.toContain("\"CI\"")
  })

  test("the agent receives an explicit empty secrets list", async () => {
    const { store, controller } = await freshController("empty")
    await ready(store)
    const outcome = await controller.commands.runForAgent("secrets.list")
    expect(outcome.status).toBe("executed")
    expect(outcome.status === "executed" ? outcome.value : undefined).toBe("No secrets in will/flows.")
  })

  test("an explicit owner/repo argument targets that repository", async () => {
    const { store, controller, requests } = await freshController()
    await ready(store)
    const outcome = await controller.commands.run("secrets.list", "acme/site")
    expect(outcome.status).toBe("executed")
    expect(requests[0]?.url).toBe("/api/repos/acme/site/agent-environment")
    expect(secretsCard(store, "acme/site")).toBeDefined()
  })

  test("listing twice re-surfaces the one card at a later ordinal, never a second card", async () => {
    const { store, controller } = await freshController()
    await ready(store)
    await controller.commands.run("secrets.list")
    const first = secretsCard(store)?.ordinal
    await controller.commands.run("secrets.list")
    const cards = [...store.collections.cards.values()].filter((card) => card.kind === "secrets")
    expect(cards).toHaveLength(1)
    expect(cards[0]?.ordinal).toBeGreaterThan(first ?? Number.POSITIVE_INFINITY)
  })

  test("the agent's door reads the same list", async () => {
    const { store, controller, requests } = await freshController()
    await ready(store)
    const outcome = await controller.commands.runForAgent("secrets.list")
    expect(outcome.status).toBe("executed")
    const value = outcome.status === "executed" ? outcome.value : undefined
    for (const text of ["will/flows", "NPM_TOKEN", "registry.npmjs.org", "authorization", "2026-08-01T00:00:00.000Z", "SETUP_ONLY"]) {
      expect(value).toContain(text)
    }
    expect(value).not.toContain("DO_NOT_EXPOSE_SECRET_BYTES")
    expect(value).not.toContain("bun install")
    expect(requests).toHaveLength(1)
    expect(secretsCard(store)?.payload.secrets.map((secret) => secret.name)).toEqual(["NPM_TOKEN", "SETUP_ONLY"])
  })

  test("an inventory-less signed-in session answers the repo-resolution error as-is", async () => {
    const { store, controller, requests } = await freshController()
    await signedIn(store)
    const outcome = await controller.commands.run("secrets.list")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") {
      expect(outcome.error).toBe(
        "No repository is loaded yet — sign in with /cloud.sign-in, or name one as owner/repo"
      )
    }
    expect(requests).toHaveLength(0)
  })

  test("signed out, the agent's invocation names the sign-in step and reads nothing", async () => {
    const { store, controller, requests } = await freshController()
    await signedOut(store)
    const outcome = await controller.commands.runForAgent("secrets.list", "will/flows")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") expect(outcome.error).toContain("Sign in with GitHub first")
    expect(requests).toHaveLength(0)
    expect(secretsCard(store)).toBeUndefined()
  })
})

describe("secrets seam — honest failures", () => {
  test("a 403 answers the platform's message and surfaces no card", async () => {
    const { store, controller } = await freshController("get-403")
    await ready(store)
    const outcome = await controller.commands.run("secrets.list")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") expect(outcome.error).toBe("forbidden: repository write access required")
    expect(secretsCard(store)).toBeUndefined()
  })

  test("a 500 answers what failed and whose fault it was, never a throw", async () => {
    const { store, controller } = await freshController("get-500")
    await ready(store)
    const outcome = await controller.commands.run("secrets.list")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") {
      expect(outcome.error).toBe("The agent environment for will/flows couldn't be read (HTTP 500). That's a bug in Smithers, not something you did.")
      expect(outcome.error).not.toContain("the platform fell over")
    }
    expect(secretsCard(store)).toBeUndefined()
  })

  test("a network throw answers an honest string", async () => {
    const { store, controller } = await freshController("get-throw")
    await ready(store)
    const outcome = await controller.commands.run("secrets.list")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") {
      expect(outcome.error).toBe("The agent environment for will/flows couldn't be read — the platform didn't answer.")
    }
  })

  test("a malformed answer names the shape problem and surfaces no card", async () => {
    const { store, controller } = await freshController("malformed")
    await ready(store)
    const outcome = await controller.commands.run("secrets.list")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") {
      expect(outcome.error).toBe("The agent-environment answer for will/flows wasn't in the expected shape.")
    }
    expect(secretsCard(store)).toBeUndefined()
  })
})

describe("secrets seam — secrets.scope", () => {
  test("marks a repository secret main-only and names the stored scope", async () => {
    const requests: Array<{ readonly method: string; readonly url: string; readonly body: unknown }> = []
    const services: AppServices = {
      fetchImpl: async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        if (!url.includes("/secrets/")) { unexpectedHttp.push(url); throw new Error(`Unplanned secret HTTP: ${url}`) }
        const body = JSON.parse(String(init?.body)) as { main_only: boolean }
        requests.push({ method: init?.method ?? "GET", url, body })
        if (url.endsWith("/MISSING")) return json(404, { message: "secret not found" })
        return json(200, { name: "DEPLOY", main_only: body.main_only })
      }
    }
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, controllerServices(services))
    await ready(store)
    const marked = await controller.commands.run("secrets.scope", "DEPLOY main-only")
    expect(marked).toMatchObject({ status: "executed", value: "DEPLOY: main only" })
    expect(requests[0]).toMatchObject({ method: "PATCH", body: { main_only: true } })
    expect(requests[0]!.url).toEndWith("/api/repos/will/flows/secrets/DEPLOY")
    expect(await controller.commands.run("secrets.scope", "DEPLOY all")).toMatchObject({ status: "executed", value: "DEPLOY: every run" })
    expect(requests[1]).toMatchObject({ body: { main_only: false } })
    const missing = await controller.commands.run("secrets.scope", "MISSING main-only")
    expect(JSON.stringify(missing)).toContain("secret not found")
    // The agent may only ask to give a secret to every run; a human confirms.
    const before = requests.length
    expect(await controller.commands.runForAgent("secrets.scope", "DEPLOY all")).toMatchObject({ status: "executed" })
    expect(requests.length).toBe(before)
    const confirmation = [...store.collections.messages.values()].find(message => message.action?.flow === "secrets.scope")
    expect(confirmation?.action?.args).toStartWith("DEPLOY all")
  })
})

const metadataAnswer = (name = "CURRENT_SECRET") => ({ setup_script: "", env: [], secrets: [{ name, hosts: [], match_headers: [], updated_at: null, value: "PRIVATE_BYTES" }] })

for (const retirement of ["account", "sign-out", "dispose"] as const) for (const answer of ["success", "rejection"] as const) {
  test(`a held secret read ${answer} after ${retirement} cannot publish the retired metadata`, async () => {
    const reply = heldResponse()
    const entered = Promise.withResolvers<void>()
    const hits: string[] = []
    const { store, controller } = await freshController(undefined, { fetchImpl: async input => {
      hits.push(String(input)); entered.resolve(); return reply.promise
    } })
    await ready(store)
    const reading = track(controller.commands.run("secrets.list"))
    await bounded(entered.promise)
    controller.changeDraft("Keep my current chat")
    if (retirement === "account") await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ada", allowlisted: true, admin: false, scopesPlain: null }).isPersisted.promise
    else if (retirement === "sign-out") await signedOut(store)
    else await controller.dispose()
    if (answer === "success") reply.resolve(json(200, metadataAnswer("RETIRED_SECRET")))
    else reply.reject(new Error("retired transport failure"))
    const outcome = await bounded(reading)
    await bounded(Promise.allSettled([...tasks]))
    await checkpoint()
    expect(hits).toEqual(["/api/repos/will/flows/agent-environment"])
    expect(secretsCard(store)).toBeUndefined()
    expect(outcome).toEqual(retirement === "dispose"
      ? { status: "failed", error: "The command's outcome could not be saved. Check its result before trying again.", persistenceFailed: true }
      : { status: "executed", value: undefined })
    const retiredFailure = "The agent environment for will/flows couldn't be read — the platform didn't answer."
    const evidence = JSON.stringify({ messages: [...store.collections.messages.values()], toasts: [...store.collections.toasts.values()], cards: [...store.collections.cards.values()], journal: (await store.eventHistory()).events })
    expect(evidence).not.toContain("RETIRED_SECRET")
    expect(evidence).not.toContain(retiredFailure)
    expect(evidence).not.toContain("PRIVATE_BYTES")
    if (retirement === "dispose") expect(store.session().draft).toBe("Keep my current chat")
  })
}

test("duplicate user and agent reads join the held request and publish one metadata card", async () => {
  const reply = heldResponse()
  const entered = Promise.withResolvers<void>()
  let reads = 0
  const { store, controller } = await freshController(undefined, { fetchImpl: async () => { reads++; entered.resolve(); return reply.promise } })
  await ready(store)
  const first = track(controller.commands.run("secrets.list"))
  await bounded(entered.promise)
  const duplicate = track(controller.commands.runForAgent("secrets.list"))
  await checkpoint()
  expect(reads).toBe(1)
  expect(secretsCard(store)).toBeUndefined()
  controller.changeDraft("Chat can be edited during the read")
  expect(store.session().draft).toBe("Chat can be edited during the read")
  reply.resolve(json(200, metadataAnswer()))
  const outcomes = await bounded(Promise.all([first, duplicate]))
  expect(outcomes).toEqual([
    { status: "executed", value: undefined },
    { status: "executed", value: "Secrets · will/flows\nCURRENT_SECRET · hosts: none · headers: none · updated: unknown" }
  ])
  expect(reads).toBe(1)
  expect([...store.collections.cards.values()].filter(card => card.kind === "secrets")).toHaveLength(1)
  expect(secretsCard(store)?.payload.secrets).toEqual([{ name: "CURRENT_SECRET", hosts: [], matchHeaders: [], updatedAt: null }])
})

test("a refused read can retry immediately without caching the failed answer", async () => {
  let reads = 0
  const { store, controller } = await freshController(undefined, { fetchImpl: async () => ++reads === 1 ? json(503, { message: "Try the repository again" }) : json(200, metadataAnswer()) })
  await ready(store)
  expect(await controller.commands.run("secrets.list")).toEqual({ status: "failed", error: "Try the repository again" })
  expect(await controller.commands.run("secrets.list")).toEqual({ status: "executed", value: "Secrets · will/flows\nCURRENT_SECRET · hosts: none · headers: none · updated: unknown" })
  expect(reads).toBe(2)
  expect(secretsCard(store)?.status).toBe("active")
  expect(secretsCard(store)?.body).toBeUndefined()
})

test("optional secret bindings and reconnect metadata survive without leaking unexpected credential fields", async () => {
  const wire = { setup_script: "PRIVATE_SETUP", env: [{ name: "PRIVATE_ENV", value: "PRIVATE_ENV_VALUE" }], secrets: [
    { name: "OMITTED", value: "PRIVATE_BYTES" },
    { name: "NULL_BINDINGS", hosts: null, match_headers: null, updated_at: "" },
    { name: "RECONNECT", hosts: ["api.example.test"], match_headers: ["authorization"], updated_at: "2026-09-28T00:00:00Z", reconnect_required: true, token: "PRIVATE_BYTES" }
  ] }
  const { store, controller } = await freshController(undefined, { fetchImpl: async () => json(200, wire) })
  await ready(store)
  const outcome = await controller.commands.runForAgent("secrets.list")
  expect(outcome).toEqual({ status: "executed", value: "Secrets · will/flows\nOMITTED · hosts: none · headers: none · updated: unknown\nNULL_BINDINGS · hosts: none · headers: none · updated: unknown\nRECONNECT · hosts: api.example.test · headers: authorization · updated: 2026-09-28T00:00:00Z" })
  expect(secretsCard(store)?.payload.secrets).toEqual([
    { name: "OMITTED", hosts: [], matchHeaders: [], updatedAt: null },
    { name: "NULL_BINDINGS", hosts: [], matchHeaders: [], updatedAt: null },
    { name: "RECONNECT", hosts: ["api.example.test"], matchHeaders: ["authorization"], updatedAt: "2026-09-28T00:00:00Z", reconnect: true }
  ])
  const persisted = JSON.stringify((await store.eventHistory()).events)
  for (const privateText of ["PRIVATE_BYTES", "PRIVATE_SETUP", "PRIVATE_ENV", "PRIVATE_ENV_VALUE"]) expect(persisted).not.toContain(privateText)
})


test("a same-owner held network rejection remains an exact visible failure", async () => {
  const reply = heldResponse()
  const entered = Promise.withResolvers<void>()
  const { store, controller } = await freshController(undefined, { fetchImpl: async () => { entered.resolve(); return reply.promise } })
  await ready(store)
  const reading = track(controller.commands.run("secrets.list"))
  await bounded(entered.promise)
  reply.reject(new Error("provider transport failed"))
  const failure = "The agent environment for will/flows couldn't be read — the platform didn't answer."
  expect(await bounded(reading)).toEqual({ status: "failed", error: failure })
  expect(store.collections.cards.get("secrets-will/flows")).toMatchObject({ status: "error", loading: false, body: failure })
  expect(JSON.stringify((await store.eventHistory()).events)).toContain(failure)
})
