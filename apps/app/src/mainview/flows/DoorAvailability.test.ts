import { expect, test } from "bun:test"
import type { AppBootstrap, RuntimeCapability } from "@smthrs/rpc/AppBootstrap"
import type { AgentPort } from "../runtime/AgentPort"
import { createAppController } from "../state/AppController"
import { createAppStore } from "../state/AppStore"
import { memoryStorage, signupProfileFetch, waitFor } from "../state/TestFixtures"
import { answerActions } from "./AnswerActions"
import { createDoorLedger, doorFamilyAbsent, doorState } from "./DoorAvailability"
import { absentDoor, nameOf } from "./registry"

/*
 * The two answer doors may not be offered where the host serves neither
 * (#3887). The guard that renders them lived in `AnswerActions` before this,
 * but `todo.new` and `wiki.save` declared no `hosts` and no `runtime`, so
 * `Commands.available` admitted them on every host and the guard could never
 * fire — a disabled renderer with nothing to disable. These tests read the real
 * availability source instead of handing a made-up boolean to that renderer:
 * the bootstrap production actually serves, the declaration's own `door`, and
 * the refusal this origin itself answered.
 */

/** The capability list `https://smithers.sh/api/bootstrap` served on 2026-10-14 (build 0061790946c7). */
const HOSTED: ReadonlyArray<RuntimeCapability> = [
  "identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select",
  "cloud", "cloud.terminal", "billing.balance", "billing.overview", "billing.plans", "billing.portal", "billing.checkout"
]

const bootstrapOf = (capabilities: ReadonlyArray<RuntimeCapability>, host: AppBootstrap["host"] = "cloud"): AppBootstrap => ({
  apiVersion: 1, host, version: "test", buildSha: "0061790946c765d241205ba9721fabc5c923234b",
  capabilities: [...capabilities], authFlow: "redirect", sandbox: null
})

test("the TODO family's availability is the install row the host that mounts it emits, and the Wiki's is never read off `cloud`", () => {
  const hosted = bootstrapOf(HOSTED)
  // compose/router.go mounts /todos* under IsSingleOwner; compose/bootstrap.go emits `install` from that same condition.
  expect(doorState("todo", { bootstrap: hosted })).toBe("absent")
  expect(doorState("todo", { bootstrap: bootstrapOf([...HOSTED, "install"]) })).toBe("served")
  /*
   * `wiki: true` is a real backend implementation. No bootstrap row states the
   * flag, so a loaded bootstrap alone says NOTHING about the Wiki: unknown is
   * offered, and only the gate's own answer withdraws the door.
   */
  expect(doorState("wiki", { bootstrap: hosted })).toBe("unknown")
  expect(doorFamilyAbsent("wiki", { bootstrap: hosted })).toBe(false)
})

test("a bootstrap that has not loaded is honest loading, never absence", () => {
  expect(doorState("todo", {})).toBe("unknown")
  expect(doorState("wiki", {})).toBe("unknown")
  expect(doorFamilyAbsent("todo", {})).toBe(false)
  expect(doorFamilyAbsent(undefined, { bootstrap: bootstrapOf([]) })).toBe(false)
})

test("a refusal this origin answered is the strongest statement about its own routes, and is per family", () => {
  const ledger = createDoorLedger()
  expect(ledger.absent("wiki")).toBe(false)
  ledger.record("wiki")
  ledger.record("wiki")
  expect(ledger.absent("wiki")).toBe(true)
  expect(ledger.absent("todo")).toBe(false)
  const evidence = { bootstrap: bootstrapOf([...HOSTED, "install"]), refused: ledger.absent }
  expect(doorState("wiki", evidence)).toBe("absent")
  // The install still serves TODOs: one family's refusal says nothing about the other.
  expect(doorState("todo", evidence)).toBe("served")
  // No bootstrap yet and a refused family: the wire outranks a document that has not arrived.
  expect(doorState("wiki", { refused: ledger.absent })).toBe("absent")
})

test("a design build's seeded door is admitted, and `seeded` is never read to refuse one", () => {
  const ledger = createDoorLedger()
  ledger.record("todo")
  expect(doorState("todo", { bootstrap: bootstrapOf(HOSTED), seeded: true })).toBe("served")
  expect(doorState("todo", { bootstrap: bootstrapOf(HOSTED), seeded: true, refused: ledger.absent })).toBe("served")
  // #3865: the hosted app serves `cloud` with the fixture off, so `seeded: false` decides nothing by itself.
  expect(doorState("wiki", { bootstrap: bootstrapOf(HOSTED), seeded: false })).toBe("unknown")
})

test("an absent door family is a door this origin could grow, never the native app's", () => {
  const hosted = bootstrapOf(HOSTED)
  expect(absentDoor({ summary: "", door: "todo" }, hosted)).toBe("origin")
  expect(absentDoor({ summary: "", door: "todo" }, hosted, undefined, true)).toBeUndefined()
  expect(absentDoor({ summary: "", door: "wiki" }, hosted)).toBeUndefined()
  expect(absentDoor({ summary: "", door: "wiki" }, hosted, () => true)).toBe("origin")
})

const unavailable: AgentPort = {
  available: false, startTurn: async () => ({ status: "error", message: "unavailable" }), cancelTurn: async () => {}, subscribe: () => () => {}
}

/*
 * A real controller over a real bootstrap. The host answers exactly what
 * `https://smithers.sh` answered ROOT: `/api/todos` is 404 `text/plain` because
 * the family is not mounted, and the Wiki's POST is plue's gate envelope.
 */
const host = async (capabilities: ReadonlyArray<RuntimeCapability> | undefined, options: { readonly wiki?: "gate" | "served" } = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: Array<{ path: string; method: string }> = []
  const profile = signupProfileFetch(async (input, init) => {
    const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, "https://smithers.sh").pathname
    const method = init?.method ?? "GET"
    if (path.startsWith("/api/todos")) {
      calls.push({ path, method })
      // chi's NotFound: plumbing with no contract with this product.
      return new Response("404 page not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    }
    if (path.endsWith("/wiki") && method === "POST") {
      calls.push({ path, method })
      return options.wiki === "served"
        ? Response.json({ id: 42, slug: "page", title: "Page", path: "Page.md", revision: 1,
          author: { id: 1, login: "ben" }, created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z" })
        // plue's gate body, field for field (middleware/feature_flag.go, pkg/errors registry CodeForbidden).
        : Response.json({ code: "forbidden", class: "permission", fault: "user", message: "feature not available" }, { status: 403 })
    }
    if (path.endsWith("/navigation/index")) return Response.json({ pages: [], folders: [], tags: [] })
    return new Response("{}", { status: 404 })
  })
  const controller = createAppController(store, unavailable, {
    fetchImpl: profile.fetchImpl, ...(capabilities === undefined ? {} : { bootstrap: bootstrapOf(capabilities) })
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "owner/repo", org: "owner", name: "repo", ownerKind: "user", head: null }] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/repo" }).isPersisted.promise
  return { store, controller, calls }
}

const todoFamily = (controller: Awaited<ReturnType<typeof host>>["controller"]): ReadonlyArray<string> =>
  controller.commands.entries().map(nameOf).filter(name => name === "todo" || name.startsWith("todo."))

const doors = (controller: Awaited<ReturnType<typeof host>>["controller"]) =>
  answerActions(() => {}, "# Answer\n\nKeep the queue", controller.commands)
    .actions.map(action => ({ label: action.label, reason: action.disabled?.reason }))

test("on the bootstrap the hosted origin serves, the whole /api/todos family is withdrawn and Make TODO opens no form and writes nothing", async () => {
  const h = await host(HOSTED)
  try {
    expect(todoFamily(h.controller)).toEqual([])
    // The local Draft's own dismissal reaches no route, so it is not a door.
    expect(h.controller.commands.entries().map(nameOf)).toContain("draft.discard")
    expect(h.controller.commands.find("todo.new")).toBeUndefined()
    expect(h.controller.commands.explainAbsent("todo.new"))
      .toEqual({ door: "origin", reason: "/todo.new is not available on this origin yet." })
    expect(doors(h.controller)).toEqual([
      { label: "Make TODO", reason: "/todo.new is not available on this origin yet." },
      // The Wiki is unknown here, not absent: wiki=true is a real implementation.
      { label: "Save to wiki", reason: undefined }
    ])
    /*
     * The direct door, which an answer button cannot be the only guard for: a
     * submit is answered `unavailable` with the catalog's sentence, and nothing
     * reaches `/api/todos` — no form, no request, no idempotency key spent.
     */
    const outcome = await h.controller.submitCommand({ name: "todo.new", actor: "user", payload: { text: "Keep the queue" } })
    expect(outcome).toMatchObject({ status: "unavailable", reason: "/todo.new is not available on this origin yet." })
    expect(await h.controller.runCommandForResult("todo.new", "Keep the queue"))
      .toMatchObject({ status: "unavailable", reason: "/todo.new is not available on this origin yet." })
    /*
     * And what the person READS on that direct press is the same sentence. The
     * generic "This action is no longer available" names neither the door nor
     * the reason, and it was the one answer a declared-but-undoored flow could
     * still be pressed into.
     */
    expect(h.store.collections.toasts.get("toast-command.unavailable.todo.new")?.title)
      .toBe("/todo.new is not available on this origin yet.")
    expect(h.calls.filter(call => call.path.startsWith("/api/todos") && call.method !== "GET")).toEqual([])
  } finally { await h.controller.dispose() }
})

test("the typed name is out of the slash menu but still has an honest answer, so Enter cannot be silence", async () => {
  /*
   * The Composer's exact-name branch (`Composer.tsx`): a withdrawn flow is not
   * a listed row, so the menu is empty and `find` misses it. It used to stop
   * there and Enter did nothing at all. These are the reads that branch makes.
   */
  const h = await host(HOSTED)
  try {
    expect(h.controller.commands.find("todo.new")).toBeUndefined()
    expect(h.controller.commands.explainAbsent("todo.new")?.reason).toBe("/todo.new is not available on this origin yet.")
    // And the dispatch that branch now makes says it, through the one run path.
    expect(await h.controller.runCommandForResult("todo.new"))
      .toMatchObject({ status: "unavailable", reason: "/todo.new is not available on this origin yet." })
    // A host that serves the family answers the same branch with the flow itself.
    const served = await host([...HOSTED, "install"])
    try {
      expect(served.controller.commands.find("todo.new")).toBeDefined()
      expect(served.controller.commands.explainAbsent("todo.new")).toBeUndefined()
    } finally { await served.controller.dispose() }
  } finally { await h.controller.dispose() }
})

test("a name no host declares keeps the generic answer, so the honest refusal is not spread over typos", async () => {
  const h = await host(HOSTED)
  try {
    expect(await h.controller.runCommandForResult("todo.nwe")).toEqual({ status: "unknown-command" })
    expect(h.store.collections.toasts.get("toast-command.unavailable.todo.nwe")?.title)
      .toBe("This action is no longer available")
  } finally { await h.controller.dispose() }
})

test("the install's bootstrap keeps every TODO door, and both answer doors stay offered", async () => {
  const h = await host([...HOSTED, "install"])
  try {
    expect(todoFamily(h.controller)).toContain("todo.new")
    expect(todoFamily(h.controller)).toContain("todo.drop")
    expect(h.controller.commands.explainAbsent("todo.new")).toBeUndefined()
    expect(doors(h.controller)).toEqual([
      { label: "Make TODO", reason: undefined },
      { label: "Save to wiki", reason: undefined }
    ])
  } finally { await h.controller.dispose() }
})

test("before any bootstrap answers, both answer doors stay offered", async () => {
  const h = await host(undefined)
  try {
    expect(doors(h.controller)).toEqual([
      { label: "Make TODO", reason: undefined },
      { label: "Save to wiki", reason: undefined }
    ])
  } finally { await h.controller.dispose() }
})

test("a host whose install row promises TODOs but whose router answers 404 withdraws the family on its own answer", async () => {
  /*
   * The bootstrap's `install` row is the mount condition's near-twin, not the
   * mount itself: `compose/router.go` also wants `extras.Mythical != nil`. So
   * the row ADMITS the door and the origin's own answer still outranks it —
   * belt as well as braces, and the reason the seam records what it classified
   * (seams/TodoSeam `todo_route_absent`, flows/DoorAvailability.ts).
   */
  const h = await host([...HOSTED, "install"])
  try {
    expect(h.controller.commands.find("todo.new")).toBeDefined()
    // `todo.new` with no card drafts locally; the draft's Commit is the write.
    expect(await h.controller.submitCommand({ name: "todo.new", actor: "user", payload: { text: "Keep the queue", title: "Overnight verification queue" } }))
      .toMatchObject({ status: "executed" })
    const draft = [...h.store.collections.cards.values()].find(row => row.kind === "draft")!
    await h.controller.submitCommand({ name: "form.set", actor: "user", payload: { cardId: draft.id, field: "acceptance", value: '["The queue is read"]' } })
    await h.controller.submitCommand({ name: "todo.new", actor: "user", display: "Commit", payload: { cardId: draft.id } })
    const posted = () => h.calls.filter(call => call.path.startsWith("/api/todos") && call.method === "POST")
    await waitFor(() => posted().length === 1, 5_000)
    // chi's NotFound is the router's own statement that it never mounted the family.
    await waitFor(() => h.controller.commands.find("todo.new") === undefined, 5_000)
    expect(todoFamily(h.controller)).toEqual([])
    expect(doors(h.controller)[0]).toEqual({ label: "Make TODO", reason: "/todo.new is not available on this origin yet." })
    // The Wiki said nothing here, so its door is untouched by the TODO router's answer.
    expect(doors(h.controller)[1]).toEqual({ label: "Save to wiki", reason: undefined })
    const again = await h.controller.submitCommand({ name: "todo.new", actor: "user", payload: { text: "Second try" } })
    expect(again).toMatchObject({ status: "unavailable", reason: "/todo.new is not available on this origin yet." })
    expect(posted().length).toBe(1)
  } finally { await h.controller.dispose() }
})

test("once this origin's Wiki gate has refused a save, Save to wiki is withdrawn everywhere and a second press writes nothing", async () => {
  const h = await host(HOSTED, { wiki: "gate" })
  try {
    expect(doors(h.controller)[1]).toEqual({ label: "Save to wiki", reason: undefined })
    await h.controller.submitCommand({ name: "wiki.save", actor: "user", payload: { name: "Overnight verification queue guide", text: "# Answer\n\nKeep the queue" } })
    await waitFor(() => h.store.session().wikiSaves?.[0]?.state === "failed", 5_000)
    expect(h.store.session().wikiSaves?.[0]?.error).toBe("The Wiki is not available on this Smithers host.")
    const posted = h.calls.filter(call => call.method === "POST" && call.path.endsWith("/wiki")).length
    expect(posted).toBe(1)
    expect(h.controller.commands.find("wiki.save")).toBeUndefined()
    expect(h.controller.commands.explainAbsent("wiki.save"))
      .toEqual({ door: "origin", reason: "/wiki.save is not available on this origin yet." })
    expect(doors(h.controller)[1]).toEqual({ label: "Save to wiki", reason: "/wiki.save is not available on this origin yet." })
    const again = await h.controller.submitCommand({ name: "wiki.save", actor: "user", payload: { name: "Second try", text: "# Answer\n\nKeep the queue" } })
    expect(again).toMatchObject({ status: "unavailable", reason: "/wiki.save is not available on this origin yet." })
    expect(h.calls.filter(call => call.method === "POST" && call.path.endsWith("/wiki")).length).toBe(posted)
  } finally { await h.controller.dispose() }
})

/*
 * The repository Wiki family, as `entries/wiki.ts` declares it. Every one of
 * these reaches `/api/repos/{owner}/{repo}/wiki*`, which is gated as a whole.
 */
const WIKI_FAMILY = ["wiki.cloud", "wiki.cloud.open", "wiki.cloud.new", "wiki.cloud.rename",
  "wiki.cloud.delete", "wiki.history", "wiki.attach", "wiki.sync"] as const

/* The notes doors act on this page's own documents, and `wiki.create` asks the Mythical stack. */
const WIKI_NOTES = ["wiki", "wiki.pane", "wiki.open", "wiki.new-note", "wiki.select", "wiki.create"] as const

test("the gate's verdict withdraws the whole repository Wiki family, not only the answer button, and leaves the notes doors alone", async () => {
  const h = await host(HOSTED, { wiki: "gate" })
  try {
    for (const name of [...WIKI_FAMILY, ...WIKI_NOTES]) expect(h.controller.commands.find(name)).toBeDefined()
    await h.controller.submitCommand({ name: "wiki.save", actor: "user", payload: { name: "Overnight verification queue guide", text: "# Answer\n\nKeep the queue" } })
    await waitFor(() => h.store.session().wikiSaves?.[0]?.state === "failed", 5_000)
    /*
     * One refusal settles the family. Withdrawing only the answer button left
     * `/wiki.cloud.new` as a typed door into the same gate: a Create form a
     * person fills in and a PATCH/PUT that can only answer `forbidden`.
     */
    for (const name of WIKI_FAMILY) {
      expect(h.controller.commands.find(name)).toBeUndefined()
      expect(h.controller.commands.explainAbsent(name))
        .toEqual({ door: "origin", reason: `/${name} is not available on this origin yet.` })
    }
    // The page's own notes are not the server's Wiki and keep working.
    for (const name of WIKI_NOTES) expect(h.controller.commands.find(name)).toBeDefined()
    const sent = h.calls.length
    expect(await h.controller.submitCommand({ name: "wiki.cloud.new", actor: "user", payload: { title: "Overnight verification queue" } }))
      .toMatchObject({ status: "unavailable", reason: "/wiki.cloud.new is not available on this origin yet." })
    expect(await h.controller.runCommandForResult("wiki.cloud.new", "Overnight verification queue"))
      .toMatchObject({ status: "unavailable", reason: "/wiki.cloud.new is not available on this origin yet." })
    expect(h.calls.length).toBe(sent)
  } finally { await h.controller.dispose() }
})

test("an origin whose Wiki is enabled keeps every repository Wiki door after a save", async () => {
  const h = await host(HOSTED, { wiki: "served" })
  try {
    await h.controller.submitCommand({ name: "wiki.save", actor: "user", payload: { name: "Queue guide", text: "# Answer\n\nKeep the queue" } })
    await waitFor(() => h.store.session().wikiSaves?.[0]?.state === "completed", 5_000)
    for (const name of [...WIKI_FAMILY, ...WIKI_NOTES]) {
      expect(h.controller.commands.find(name)).toBeDefined()
      expect(h.controller.commands.explainAbsent(name)).toBeUndefined()
    }
  } finally { await h.controller.dispose() }
})

test("a Cloud origin whose Wiki is enabled keeps the door and its save completes", async () => {
  const h = await host(HOSTED, { wiki: "served" })
  try {
    await h.controller.submitCommand({ name: "wiki.save", actor: "user", payload: { name: "Queue guide", text: "# Answer\n\nKeep the queue" } })
    await waitFor(() => h.store.session().wikiSaves?.[0]?.state === "completed", 5_000)
    expect(h.store.session().wikiSaves?.[0]?.error).toBeUndefined()
    expect(h.controller.commands.find("wiki.save")).toBeDefined()
    expect(doors(h.controller)[1]).toEqual({ label: "Save to wiki", reason: undefined })
  } finally { await h.controller.dispose() }
})
