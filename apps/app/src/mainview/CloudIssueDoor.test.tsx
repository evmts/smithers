/*
 * The Cloud issue-creation door, and the diagnostic door beside it, through
 * the real App: what a signed-in Smithers Cloud person reads when they type
 * the name the product itself told them to type.
 *
 * `/issue.new` is GitHub's door. On Smithers Cloud it refuses with its own
 * sentence — "Use /issues.create on Smithers Cloud."
 * (flows/entries/subjects.ts `CLOUD_ISSUE_DOOR`) — because a Cloud issue row
 * is not the install's GitHub App issue identity. `issues.create` is the door
 * that sentence names, it is `in-card` with no card that presses it, and the
 * `/` listing therefore carries no row for it. The overlay read those empty
 * rows as "There is no /issues.create flow", so the one act the refusal named
 * answered that it did not exist, while Enter on the same draft would have
 * opened its form (Composer.tsx `outright`). `/debug.errors`, hidden by
 * declaration and promised to every identity with no repository or sign-in,
 * answered the same denial.
 *
 * The declared behaviour of each door is unchanged and asserted here as it
 * stands: the form law on a bare invocation, the Cloud POST a confirmed
 * title writes, the install's refusal BEFORE the form, and the private
 * conversation `--kind` mapping.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { StorageApi } from "@tanstack/db"
import { afterAll, afterEach, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ControllerTestProvider } from "./ControllerContext"
import type { RuntimeCapability } from "@smthrs/rpc/AppBootstrap"
import type { AgentPort } from "./runtime/AgentPort"
import type { AppController as AppControllerType, AppServices } from "./state/AppController"
import { createAppController } from "./state/AppController"
import type { Card } from "./state/AppState"
import type { AppStore } from "./state/AppStore"
import { createAppStore } from "./state/AppStore"

GlobalRegistrator.register()

afterAll(async () => {
  for (let tick = 0; tick < 3; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})

const mounted: Array<() => void> = []
afterEach(() => { while (mounted.length > 0) mounted.pop()?.() })

const memoryStorage = (): StorageApi => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key)
  }
}

const silentAgent: AgentPort = {
  available: false,
  startTurn: async () => ({ status: "error", message: "unavailable" }),
  cancelTurn: async () => {},
  subscribe: () => () => {}
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

interface View {
  readonly controller: AppControllerType
  readonly store: AppStore
  readonly host: HTMLElement
  readonly act: (change: () => void) => Promise<void>
}

/** A signed-in Smithers Cloud session with ONE repository, so the target resolves without an argument. */
const mount = async (
  services: AppServices = {},
  capabilities: ReadonlyArray<RuntimeCapability> = ["identity", "cloud"]
): Promise<View> => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, silentAgent, {
    fetchImpl: async () => json(404, { status: "error", message: "no stub" }),
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: [...capabilities], authFlow: "redirect", sandbox: null },
    ...services
  })
  store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null })
  store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null }] })
  store.dispatch({ type: "repo.selected", actor: "user", id: "will/flows" })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
  mounted.push(() => { flushSync(() => root.unmount()); controller.dispose(); host.remove() })
  const act = async (change: () => void): Promise<void> => {
    flushSync(change)
    await new Promise((resolve) => setTimeout(resolve, 0))
    flushSync(() => {})
  }
  await act(() => {})
  return { controller, store, host, act }
}

const textarea = (host: HTMLElement): HTMLTextAreaElement | null => host.querySelector<HTMLTextAreaElement>("textarea")

const refusalLine = (host: HTMLElement): string | undefined =>
  host.querySelector<HTMLElement>('[data-testid="palette-refusal"]')?.textContent ?? undefined

const press = async (view: View, key: string): Promise<void> => {
  await view.act(() => {
    textarea(view.host)?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
}

const formCard = (store: AppStore, flow: string): Extract<Card, { kind: "flow-form" }> | undefined => {
  const card: Card | undefined = [...store.collections.cards.values()]
    .find((row) => row.kind === "flow-form" && row.payload.flow === flow)
  return card === undefined ? undefined : card as Extract<Card, { kind: "flow-form" }>
}

test("the door /issue.new's Cloud refusal names is one the overlay admits exists", async () => {
  const view = await mount()
  // The sentence the person is given, from the door that owns the refusal.
  expect(await view.controller.commands.run("issue.new")).toMatchObject({
    status: "failed", error: "Use /issues.create on Smithers Cloud."
  })
  expect(formCard(view.store, "issue.new")).toBeUndefined()

  await view.act(() => view.controller.changeDraft("/issues.create"))
  /*
   * The registry resolves it and the human listing still carries no row for
   * it — the door stays `in-card`, as .specs/product/mvp.md §Appendix B
   * keeps it. The overlay has to answer for both facts at once.
   */
  expect(view.controller.commands.find("issues.create")).toBeDefined()
  expect(view.controller.slashTree("issues.create")).toEqual([])
  const note = refusalLine(view.host)
  expect(note).not.toContain("There is no")
  expect(note).toContain("/issues.create")
  expect(note).toContain("Press Enter to run it.")

  // And Enter is the act that line promises: the form law, not silence.
  await press(view, "Enter")
  expect(formCard(view.store, "issues.create")).toMatchObject({ payload: { via: "user" } })
  expect(formCard(view.store, "issues.create")!.payload.fields.map((field) => field.name)).toContain("title")
})

test("a name no registry resolves keeps its own sentence", async () => {
  const view = await mount()
  await view.act(() => view.controller.changeDraft("/no-such-command"))
  expect(refusalLine(view.host)).toBe("There is no /no-such-command flow. Type / to see everything Smithers can do.")
  await view.act(() => view.controller.changeDraft("/issu"))
  // A prefix that the listing answers is not a missing door.
  expect(refusalLine(view.host)).toBeUndefined()
  /*
   * The line promises Enter, and a draft that carries more than the name is
   * the ordinary submit path instead, so the promise is not made there.
   */
  await view.act(() => view.controller.changeDraft("/issues.create "))
  expect(refusalLine(view.host)).toBeUndefined()
})

test("the diagnostic door every identity is promised is not denied either", async () => {
  const view = await mount()
  await view.act(() => view.controller.changeDraft("/debug.errors"))
  expect(view.controller.slashTree("debug.errors")).toEqual([])
  expect(refusalLine(view.host)).toContain("/debug.errors")
  expect(refusalLine(view.host)).not.toContain("There is no")
  /*
   * And the syntax the overlay was denying answers: `--source` and `--limit`
   * are the door's own declared filters, and its answer is a transcript line
   * stating the bound of what it retained — there is no Errors card to wait
   * for. The read itself (its filters, its redaction, and that it needs
   * neither sign-in nor a repository) is pinned by state/Diagnostics.test.ts.
   */
  const before = view.store.collections.cards.size
  expect(await view.controller.commands.run("debug.errors", "--source network --limit 10")).toMatchObject({ status: "executed" })
  expect(view.store.collections.cards.size).toBe(before)
  expect([...view.store.collections.messages.values()].some((message) =>
    message.text.includes("Empty results do not prove no errors occurred."))).toBe(true)
})

test("the door the overlay now admits writes the Cloud issue it names, and nothing GitHub's", async () => {
  const calls: Array<string> = []
  const bodies: Array<unknown> = []
  const view = await mount({
    fetchImpl: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, "https://app.test")
      const method = (init?.method ?? "GET").toUpperCase()
      calls.push(`${method} ${url.pathname}`)
      const created = { id: 900, number: 9, title: 'Fix the "flaky" retry, please', body: "", state: "open", labels: [], assignees: [],
        author: { id: 3, login: "will" }, milestone_id: null, comment_count: 0,
        created_at: "2026-10-15T09:00:00Z", updated_at: "2026-10-15T09:00:00Z", closed_at: null }
      if (method === "POST" && url.pathname === "/api/repos/will/flows/issues") {
        bodies.push(JSON.parse(String(init?.body ?? "{}")))
        return json(200, created)
      }
      if (method === "GET" && url.pathname === "/api/repos/will/flows/issues/9") return json(200, created)
      if (method === "GET" && url.pathname === "/api/repos/will/flows/issues/9/comments") return json(200, [])
      return json(404, { status: "error", message: "no stub" })
    }
  })
  // A title carrying quoted punctuation, and the repository spelled out.
  expect(await view.controller.commands.run("issues.create", 'Fix the "flaky" retry, please will/flows')).toMatchObject({ status: "executed" })
  expect(bodies).toEqual([expect.objectContaining({ title: 'Fix the "flaky" retry, please' })])
  // The Cloud tracker's route, never GitHub's POST /api/issues.
  expect(calls.filter((call) => call.startsWith("POST "))).toEqual(["POST /api/repos/will/flows/issues"])

  // The private conversation mapping is the same door's `--kind`, unchanged.
  bodies.length = 0
  expect(await view.controller.commands.run("issues.create", "Ask the assistant will/flows --kind conversation")).toMatchObject({ status: "executed" })
  expect(bodies).toEqual([expect.objectContaining({ title: "Ask the assistant", kind: "chat" })])

  /*
   * A door the overlay admits is still not a door the model may walk through:
   * the write stays the person's, asked once. The confirmation's own round
   * trip (its args, and the repository it keeps across navigation) is pinned
   * by state/seams/IssuesSeam.test.ts.
   */
  bodies.length = 0
  const asked = await view.controller.commands.submit({ name: "issues.create", payload: { title: "Agent asks" }, actor: "agent" })
  expect(asked).toMatchObject({ status: "executed", value: expect.stringContaining("asked the user to confirm") })
  expect(bodies).toEqual([])
  expect([...view.store.collections.messages.values()].filter((message) => message.action?.flow === "issues.create")).toHaveLength(1)
})

/*
 * On an install this door writes the repository's own GitHub issue, through
 * the install's canonical durable create (POST /api/issues, the writer
 * `/issue.new` uses). It used to answer "Use /issue.new on this install."
 * before the form, because the Cloud create addressed a Smithers tracker the
 * install has none of (#4030). The form law holds: a missing title is asked
 * for, and the write that leaves is the install's, never the Cloud route.
 */
test("an install writes its own GitHub issue through this door", async () => {
  const writes: Array<string> = []
  const view = await mount({
    fetchImpl: async (input, init) => {
      const url = new URL(String(input), "https://app.test")
      if ((init?.method ?? "GET").toUpperCase() === "POST") writes.push(url.pathname)
      if (url.pathname === "/api/issues") return json(202, { kind: "requested", operationId: "op-1" })
      if (url.pathname === "/api/issues/requests/op-1") return json(200, { state: "accepted" })
      return json(404, { status: "error", message: "no stub" })
    }
  }, ["identity", "cloud", "install"])
  // A bare line asks for the title it is missing, as the Cloud origin does.
  expect(await view.controller.commands.run("issues.create")).toMatchObject({ status: "form", flow: "issues.create" })
  expect(writes).toEqual([])
  expect(await view.controller.commands.submit({ name: "issues.create", payload: { title: "Legacy issue" }, actor: "user" })).toMatchObject({ status: "executed" })
  // The install's own door, never the Cloud tracker's same-numbered row.
  expect(writes).toEqual(["/api/issues"])
})
