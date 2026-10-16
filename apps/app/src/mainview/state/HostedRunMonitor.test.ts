/*
 * Hosted run monitoring: `/monitor`, `/runs`, `/run` and `/run.inspect` on the
 * deployed app.
 *
 * [#4032](https://github.com/smithersai/smithers/issues/4032): on UI282d3e59
 * `/monitor` closed the palette and left NOTHING — no card, no empty state, no
 * durable result. `listRunMonitors` answered from the DESIGN WORLD twice: once
 * before the read (`!installHost && !services.live`) and once after it
 * (`!runs && !installHost`), and the hosted app runs that second branch,
 * because it is a real backend with the fixture OFF. A refused read therefore
 * looped over a disabled world, upserted no card and resolved the notice as a
 * SUCCESS with no words in it.
 *
 * The fixture is the deployed composition, not a convenient one: the hosted
 * bootstrap (`cloud`, no `install`), `designFixture: false`, and the live
 * channel the real boot always passes (ControllerBoot.client.ts). The last two
 * tests pin the two compositions either side of it — a host with no channel at
 * all, and the explicit design fixture.
 */
import { expect, test } from "bun:test"
import type { MonitorCard } from "@smthrs/rpc/MonitorCard"
import type { TopicSnapshot } from "../runtime/LiveChannel"
import { createAppStore } from "./AppStore"
import { scopedControllers } from "./ControllerTestScope"
import { memoryStorage, silentAgent } from "./TestFixtures"

const controllerFor = scopedControllers()

/** The deployed hosted app's own bootstrap: cloud, no install. */
const hosted = {
  apiVersion: 1 as const, host: "cloud" as const, version: "test", buildSha: "test",
  capabilities: ["identity" as const, "agent" as const, "cloud" as const, "github" as const],
  authFlow: "redirect" as const, sandbox: null
}

/** The channel the real boot always composes, with nothing on its topics yet. */
const quietChannel = { subscribe: () => () => {}, getSnapshot: (): TopicSnapshot | undefined => undefined }

const row = (id: string, title: string, state: MonitorCard["state"]) => ({
  id, title, state, flow: "todo", version: "digest",
  attempts: [], waits: [], tokens: 0, time_s: 0, cost_usd: 0, engine: []
})
const runningRun = row("box-1:run-7", "Ship the monitor", "running")
const finishedRun = row("box-1:run-6", "Earlier run", "done")

const settle = async (holds: () => boolean) => {
  for (let count = 0; count < 300 && !holds(); count++) await new Promise(resolve => setTimeout(resolve, 5))
}
const pathOf = (input: unknown): string => new URL(String(input), "https://app.test").pathname

type Fetching = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/*
 * The repository the hosted reader has selected, and the index THAT
 * repository answers. A hosted run belongs to one repository, so the backend
 * takes the repository from the route and judges this actor's `read`
 * permission on it; the account-wide `/api/runs` index resolves a single-owner
 * INSTALL binding, which is why asking it on a multi-user deployment refused
 * every hosted reader (#4032).
 */
const REPO = "owner/app"
const INDEX = "/api/repos/owner/app/monitors"

const selectRepository = async (store: Awaited<ReturnType<typeof createAppStore>>, repo = REPO) => {
  const [org, name] = repo.split("/")
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: repo, org: org!, name: name!, ownerKind: "user", head: null }] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: repo }).isPersisted.promise
}

const hostedController = async (fetchImpl: Fetching, live: typeof quietChannel | null = quietChannel, repo: string | null = REPO) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = controllerFor(store, silentAgent, {
    bootstrap: hosted, designFixture: false, toastDebounceMs: 0,
    ...(live ? { live } : {}), fetchImpl: fetchImpl as never
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "member", admin: false, scopesPlain: null }).isPersisted.promise
  if (repo !== null) await selectRepository(store, repo)
  return { store, controller }
}

for (const name of ["monitor", "runs"] as const) test(`hosted /${name} reads the account's own runs and presents each one`, async () => {
  const requests: string[] = []
  const { store, controller } = await hostedController(async (input, init) => {
    const path = pathOf(input)
    requests.push(`${init?.method ?? "GET"} ${path}`)
    return path === INDEX ? Response.json([runningRun, finishedRun]) : Response.json({}, { status: 404 })
  })
  // The door acknowledges before its read, exactly as the install's does.
  expect(await controller.commands.submit({ name, actor: "user", payload: {} })).toMatchObject({ status: "executed", value: "Requested" })
  await settle(() => store.collections.cards.has("run:box-1:run-6"))
  expect(store.collections.cards.get("run:box-1:run-7")?.title).toBe("Ship the monitor")
  expect(store.collections.cards.get("run:box-1:run-6")?.title).toBe("Earlier run")
  // One read of the server's own index. Listing never creates or wakes anything.
  expect(requests.filter(line => line.endsWith(` ${INDEX}`))).toEqual([`GET ${INDEX}`])
  expect(requests.filter(line => !line.startsWith("GET "))).toEqual([])
})

test("hosted /monitor joins a list read already in flight instead of asking twice", async () => {
  const requests: string[] = []
  let resolveList!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { resolveList = resolve })
  const { store, controller } = await hostedController(async input => {
    const path = pathOf(input)
    requests.push(path)
    return path === INDEX ? pending : Response.json({}, { status: 404 })
  })
  expect(await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })).toMatchObject({ value: "Requested" })
  expect(await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })).toMatchObject({ value: "Requested" })
  resolveList(Response.json([runningRun]))
  await settle(() => store.collections.cards.has("run:box-1:run-7"))
  expect(requests.filter(path => path === INDEX)).toEqual([INDEX])
})

test("a hosted account with no runs gets a durable answer, not a silent palette", async () => {
  const { store, controller } = await hostedController(async input =>
    pathOf(input) === INDEX ? Response.json([]) : Response.json({}, { status: 404 }))
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  await settle(() => [...store.collections.messages.values()].some(message => message.text === "No runs yet."))
  expect([...store.collections.messages.values()].map(message => message.text)).toContain("No runs yet.")
  expect([...store.collections.cards.values()].filter(card => card.kind === "run")).toEqual([])
})

/*
 * The branch that produced the reported silence. A 503 on the hosted app ran
 * `!runs && !installHost`, iterated a disabled world, upserted nothing and
 * returned `true`: a check mark for an act with no result and no reason.
 */
test("a hosted list the server refuses says so durably and never claims the account has no runs", async () => {
  const { store, controller } = await hostedController(async () =>
    Response.json({ ok: false, code: "run_unavailable", error: { code: "run_unavailable", message: "Run unavailable" } }, { status: 503 }))
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  await settle(() => store.collections.toasts.get("toast-monitor.list")?.status === "failed")
  expect(store.collections.toasts.get("toast-monitor.list")).toMatchObject({ status: "failed", detail: "Runs unavailable" })
  const texts = [...store.collections.messages.values()].map(message => message.text)
  expect(texts).not.toContain("No runs yet.")
  // The notice is transient, so the refusal is in the transcript too.
  expect(texts).toContain("Runs unavailable")
  expect([...store.collections.cards.values()].filter(card => card.kind === "run")).toEqual([])
})

test("a hosted list refused for want of a session asks for one in words a person can act on", async () => {
  const { store, controller } = await hostedController(async input =>
    pathOf(input) === INDEX
      ? Response.json({ error: { message: "unauthorized" } }, { status: 401 })
      : Response.json({}, { status: 404 }))
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  await settle(() => store.collections.toasts.get("toast-monitor.list")?.status === "failed")
  expect([...store.collections.messages.values()].map(message => message.text)).toContain("Sign in to read your runs.")
})

/*
 * What the deployed index actually answered. Root's native authenticated
 * same-origin read of `/api/runs` on UI282/backend4b came back with the
 * registered `permission` code rather than an array
 * (diagnostics/root-native-hosted-runs-index-20261016.json), because that
 * route resolves an INSTALL repository binding. The reader is owed that, in
 * words, from the code on the wire — not a generic outage, and certainly not
 * "No runs yet."
 */
test("the deployed index's permission refusal is read off its code, whatever status carries it", async () => {
  for (const status of [403, 503] as const) {
    const { store, controller } = await hostedController(async input =>
      pathOf(input) === INDEX
        ? Response.json({ ok: false, code: "permission", error: { code: "permission", message: "install permission policy refused the operation" } }, { status })
        : Response.json({}, { status: 404 }))
    await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
    await settle(() => store.collections.toasts.get("toast-monitor.list")?.status === "failed")
    const texts = [...store.collections.messages.values()].map(message => message.text)
    expect(texts).toContain("This account cannot read these runs.")
    expect(texts).not.toContain("No runs yet.")
    // The upstream's own prose never becomes the sentence.
    expect(texts.join(" ")).not.toContain("install permission policy")
  }
})

/*
 * A run belongs to one repository. The monitor's reads are stamped with the
 * selected repository as well as the account, so a run read under one selection
 * is not vouched for under another: the stale card refuses instead of opening
 * the wrong run.
 */
test("a run read under one repository is refused under another, and returns when it is selected again", async () => {
  const monitor = { ...runningRun, attempts: [{ n: 1, run_id: "box-1:run-7", state: "running", graph: [], steps: [], phases: [] }] }
  const { store, controller } = await hostedController(async input =>
    pathOf(input) === "/api/repos/owner/first/monitors/box-1%3Arun-7" ? Response.json(monitor) : Response.json({}, { status: 404 }), null)
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: "owner/first", org: "owner", name: "first", ownerKind: "user", head: null },
    { id: "owner/second", org: "owner", name: "second", ownerKind: "user", head: null }
  ] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/first" }).isPersisted.promise
  await controller.commands.submit({ name: "run", actor: "user", payload: { id: "box-1:run-7" } })
  const stop = controller.runMonitors!.subscribe("box-1:run-7", () => {})
  await settle(() => controller.runMonitors!.get("box-1:run-7").model !== undefined)
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/second" }).isPersisted.promise
  expect(controller.runMonitors!.get("box-1:run-7")).toEqual({ error: "Run unavailable" })
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/first" }).isPersisted.promise
  expect(controller.runMonitors!.get("box-1:run-7").model?.title).toBe("Ship the monitor")
  stop()
})

test("a hosted list whose answer this build cannot read keeps the gap visible", async () => {
  const { store, controller } = await hostedController(async input =>
    pathOf(input) === INDEX ? Response.json({ runs: "later" }) : Response.json({}, { status: 404 }))
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  await settle(() => store.collections.toasts.get("toast-monitor.list")?.status === "failed")
  const texts = [...store.collections.messages.values()].map(message => message.text)
  expect(texts).not.toContain("No runs yet.")
  expect(texts).toContain("This app could not read the runs answer.")
})

test("a hosted list the account changed under is dropped, never shown and never called empty", async () => {
  let resolveList!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { resolveList = resolve })
  const { store, controller } = await hostedController(async input =>
    pathOf(input) === INDEX ? pending : Response.json({}, { status: 404 }))
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  await settle(() => store.collections.toasts.get("toast-monitor.list")?.status === "running")
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "other", admin: false, scopesPlain: null }).isPersisted.promise
  resolveList(Response.json([runningRun]))
  await new Promise(resolve => setTimeout(resolve, 80))
  expect([...store.collections.cards.values()].filter(card => card.kind === "run")).toEqual([])
  expect([...store.collections.messages.values()].map(message => message.text)).not.toContain("No runs yet.")
})

/*
 * Inspect on the hosted app. The monitor's journal and replay reads were
 * gated on `installHost`, so the hosted Journal tab wrote the selection and
 * read nothing; the run topic remains the authority that the read is allowed.
 */
test("hosted inspect opens the run and reads its journal from the authoritative route", async () => {
  const monitor = {
    ...runningRun,
    attempts: [{ n: 1, run_id: "box-1:run-7", state: "running", graph: [], steps: [], phases: [] }]
  }
  const reads: string[] = []
  let snapshot: TopicSnapshot | undefined
  let notify: (() => void) | undefined
  const { store, controller } = await hostedController(async input => {
    const path = `${pathOf(input)}${new URL(String(input), "https://app.test").search}`
    if (path.startsWith(`${INDEX}/`)) {
      reads.push(path)
      return Response.json({ ...monitor, journal: [{ seq: 1, at: "2026-10-16T00:00:00Z", type: "step_started", text: "started" }], replay: { at: 1, last: 1 } })
    }
    return Response.json({}, { status: 404 })
  }, { subscribe: (_topic: string, listen: () => void) => { notify = listen; return () => { notify = undefined } }, getSnapshot: () => snapshot } as never)
  expect(await controller.commands.submit({ name: "run.inspect", actor: "user", payload: { id: "box-1:run-7" } })).toMatchObject({ status: "executed" })
  expect(store.collections.cards.get("run:box-1:run-7")?.kind).toBe("run")
  const stop = controller.runMonitors!.subscribe("box-1:run-7", () => {})
  // The topic grants the read and carries the monitor; no HTTP read yet.
  snapshot = { topic: "run:box-1:run-7", data: monitor }
  notify?.()
  expect(controller.runMonitors!.get("box-1:run-7").model?.title).toBe("Ship the monitor")
  expect(reads).toEqual([])
  // Opening the Journal tab reads the journal, which the install-only gate skipped.
  await controller.commands.submit({ name: "runs.trace.view", actor: "user",
    payload: { runId: "box-1:run-7", view: "timeline", state: { tab: "journal" } } })
  await settle(() => reads.length > 0)
  expect(reads).toEqual([`${INDEX}/box-1%3Arun-7/trace`])
  await settle(() => controller.runMonitors!.get("box-1:run-7").model?.journal !== undefined)
  expect(controller.runMonitors!.get("box-1:run-7").model?.journal?.[0]?.text).toBe("started")
  stop()
})

test("a hosted run whose topic refuses shows that refusal, never a blank card", async () => {
  let snapshot: TopicSnapshot | undefined
  let notify: (() => void) | undefined
  const { controller } = await hostedController(async () => Response.json({}, { status: 404 }),
    { subscribe: (_topic: string, listen: () => void) => { notify = listen; return () => { notify = undefined } }, getSnapshot: () => snapshot } as never)
  await controller.commands.submit({ name: "run", actor: "user", payload: { id: "box-1:run-7" } })
  const stop = controller.runMonitors!.subscribe("box-1:run-7", () => {})
  snapshot = { topic: "run:box-1:run-7", error: "forbidden" }
  notify?.()
  expect(controller.runMonitors!.get("box-1:run-7")).toEqual({ error: "Run unavailable" })
  stop()
})

/*
 * A host that composes no live channel at all. There is no topic to grant
 * anything, so the authenticated read is the authority: it answers, or it
 * refuses, and neither is a skeleton. Reopening the card reads again, which
 * is how progress, failure and completion arrive without a feed.
 */
test("with no live channel the authenticated read is the authority, and reopening re-reads", async () => {
  const monitor = {
    ...runningRun,
    attempts: [{ n: 1, run_id: "box-1:run-7", state: "running", graph: [], steps: [], phases: [] }]
  }
  const reads: string[] = []
  const { controller } = await hostedController(async input => {
    const path = pathOf(input)
    if (path === `${INDEX}/box-1%3Arun-7`) { reads.push(path); return Response.json(monitor) }
    return Response.json({}, { status: 404 })
  }, null)
  await controller.commands.submit({ name: "run", actor: "user", payload: { id: "box-1:run-7" } })
  const stop = controller.runMonitors!.subscribe("box-1:run-7", () => {})
  await settle(() => controller.runMonitors!.get("box-1:run-7").model !== undefined)
  expect(controller.runMonitors!.get("box-1:run-7").model?.title).toBe("Ship the monitor")
  stop()
  const again = controller.runMonitors!.subscribe("box-1:run-7", () => {})
  await settle(() => reads.length > 1)
  expect(reads.length).toBeGreaterThan(1)
  again()
})

test("with no live channel a run the repository does not serve refuses in words", async () => {
  const { controller } = await hostedController(async () =>
    Response.json({ ok: false, code: "run_not_found", error: { code: "run_not_found", message: "Run unavailable" } }, { status: 404 }), null)
  await controller.commands.submit({ name: "run", actor: "user", payload: { id: "other-box:run-1" } })
  const stop = controller.runMonitors!.subscribe("other-box:run-1", () => {})
  await settle(() => controller.runMonitors!.get("other-box:run-1").error !== undefined)
  expect(controller.runMonitors!.get("other-box:run-1")).toMatchObject({ error: "Run unavailable" })
  expect(controller.runMonitors!.get("other-box:run-1").model).toBeUndefined()
  stop()
})

/*
 * The actual fix for the deployed app. `/api/runs` authorizes `monitor` and
 * then resolves an INSTALL repository binding (`ReadInstallRepositoryBinding`),
 * which a multi-user deployment has none of — root's native authenticated read
 * came back `code: "permission"` for that reason. The hosted app must ask the
 * repository's own index instead, and must not ask the install's at all.
 */
test("the hosted index is the selected repository's own, never the install's account-wide one", async () => {
  const requests: string[] = []
  const { store, controller } = await hostedController(async input => {
    const path = pathOf(input)
    requests.push(path)
    return path === INDEX ? Response.json([runningRun, finishedRun]) : Response.json({}, { status: 404 })
  })
  expect(await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })).toMatchObject({ value: "Requested" })
  await settle(() => store.collections.cards.has("run:box-1:run-6"))
  expect(requests).toContain(INDEX)
  expect(requests).not.toContain("/api/runs")
})

/*
 * No repository, no question. This host serves runs per repository, so an
 * unpicked selection is neither an empty account nor an outage — and it is
 * certainly not a reason to ask the install index, which would refuse.
 */
test("a hosted reader who has selected no repository is asked to pick one, not told the account is empty", async () => {
  const requests: string[] = []
  const { store, controller } = await hostedController(async input => {
    requests.push(pathOf(input))
    return Response.json({}, { status: 404 })
  }, quietChannel, null)
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  await settle(() => store.collections.toasts.get("toast-monitor.list")?.status === "failed")
  const texts = [...store.collections.messages.values()].map(message => message.text)
  expect(texts).toContain("Select a repository to read its runs.")
  expect(texts).not.toContain("No runs yet.")
  expect(requests.filter(path => path.includes("runs") || path.includes("monitors"))).toEqual([])
  expect([...store.collections.cards.values()].filter(card => card.kind === "run")).toEqual([])
})

/*
 * The selection is part of the read. A second repository is a second question,
 * not a join onto the first repository's answer, and the first repository's
 * rows must never be presented as the second's.
 */
test("selecting another repository asks that repository's index, and joins no earlier read", async () => {
  const requests: string[] = []
  const { store, controller } = await hostedController(async input => {
    const path = pathOf(input)
    requests.push(path)
    if (path === INDEX) return Response.json([runningRun])
    if (path === "/api/repos/owner/other/monitors") return Response.json([finishedRun])
    return Response.json({}, { status: 404 })
  })
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  await settle(() => store.collections.cards.has("run:box-1:run-7"))
  await selectRepository(store, "owner/other")
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  await settle(() => store.collections.cards.has("run:box-1:run-6"))
  expect(requests.filter(path => path.includes("/monitors"))).toEqual([INDEX, "/api/repos/owner/other/monitors"])
})

/*
 * A repository whose name this build cannot put in a path is no source. The
 * read is built from the selection alone, shape-checked, so nothing a name
 * carries can aim it anywhere else.
 */
test("a selection this build cannot address asks nothing and says which act is missing", async () => {
  const requests: string[] = []
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = controllerFor(store, silentAgent, {
    bootstrap: hosted, designFixture: false, toastDebounceMs: 0, live: quietChannel,
    fetchImpl: (async (input: RequestInfo | URL) => { requests.push(pathOf(input)); return Response.json({}, { status: 404 }) }) as never
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "member", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "owner/a b", org: "owner", name: "a b", ownerKind: "user", head: null }] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/a b" }).isPersisted.promise
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  await settle(() => store.collections.toasts.get("toast-monitor.list")?.status === "failed")
  expect([...store.collections.messages.values()].map(message => message.text)).toContain("Select a repository to read its runs.")
  expect(requests.filter(path => path.includes("/monitors"))).toEqual([])
})

test("the explicit design fixture still answers from its own world and reads nothing", async () => {
  const requests: string[] = []
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = controllerFor(store, silentAgent, {
    designFixture: true, toastDebounceMs: 0,
    fetchImpl: async input => { requests.push(pathOf(input)); return Response.json({}, { status: 404 }) }
  })
  await controller.commands.submit({ name: "monitor", actor: "user", payload: {} })
  expect([...store.collections.cards.values()].filter(card => card.kind === "run").length).toBeGreaterThan(0)
  expect(requests.filter(path => path === INDEX)).toEqual([])
  expect(controller.runMonitors).toBeUndefined()
})
