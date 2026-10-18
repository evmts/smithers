import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"
import type { AppBootstrap, RuntimeCapability } from "@smthrs/rpc/AppBootstrap"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ControllerTestProvider } from "./ControllerContext"
import { createAppController, type AppController } from "./state/AppController"
import { createAppStore } from "./state/AppStore"
import { memoryStorage, signupProfileFetch, silentAgent, waitFor } from "./state/TestFixtures"
import { TranscriptMessage } from "./TranscriptMessage"

GlobalRegistrator.register()
const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT
reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
const roots = new Set<Root>()
const controllers = new Set<AppController>()

afterEach(async () => {
  act(() => { for (const root of roots) root.unmount() })
  roots.clear()
  document.body.textContent = ""
  for (const controller of controllers) await controller.dispose()
  controllers.clear()
  if (clipboardDescriptor === undefined) delete (navigator as { clipboard?: Clipboard }).clipboard
  else Object.defineProperty(navigator, "clipboard", clipboardDescriptor)
})

afterAll(async () => {
  for (let tick = 0; tick < 3; tick += 1) await new Promise(resolve => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

const setClipboard = (clipboard: Pick<Clipboard, "writeText"> | undefined): void => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard })
}

const mount = async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, silentAgent)
  controllers.add(controller)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  roots.add(root)
  act(() => root.render(
    <ControllerTestProvider controller={controller}>
      <TranscriptMessage entry={{ kind: "message", message: {
        id: "copy-test", role: "smithers", text: "A message to copy", status: "complete", createdAt: 1, ordinal: 1
      } }} />
    </ControllerTestProvider>
  ))
  return { button: host.querySelector<HTMLButtonElement>('[data-flow="chat.copy-message"]')!, store }
}

const settle = async (): Promise<void> => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}

test("Copy message stays unchanged when the clipboard is unavailable", async () => {
  setClipboard(undefined)
  const { button, store } = await mount()
  expect(button.getAttribute("aria-label")).toBe("Copy message")
  act(() => button.click())
  expect(button.getAttribute("aria-label")).toBe("Copy message")
  await act(async () => { await waitFor(() => [...store.collections.toasts.values()].some(toast => toast.status === "failed" && toast.detail.includes("The copy didn't go through"))) })
  expect([...store.collections.toasts.values()].some(toast => toast.status === "failed" && toast.detail.includes("The copy didn't go through"))).toBe(true)
  expect(button.getAttribute("aria-label")).toBe("Copy message")
  expect(button.title).toBe("Copy message")
  expect(button.textContent).not.toContain("Copied")
})

test("Copy message shows Copied only after the clipboard write succeeds", async () => {
  let finishWrite!: () => void
  let writtenText = ""
  setClipboard({ writeText: text => {
    writtenText = text
    return new Promise<void>(resolve => { finishWrite = resolve })
  } })
  const { button } = await mount()
  act(() => button.click())
  await settle()
  expect(writtenText).toBe("A message to copy")
  expect(button.getAttribute("aria-label")).toBe("Copy message")
  await act(async () => { finishWrite(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(button.getAttribute("aria-label")).toBe("Copied")
  expect(button.title).toBe("Copied")
  expect(button.textContent).toContain("Copied")
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1250)) })
  expect(button.getAttribute("aria-label")).toBe("Copy message")
})

test("Copy message stays unchanged when the browser refuses the write", async () => {
  setClipboard({ writeText: async () => { throw Object.assign(new Error("permission denied"), { name: "NotAllowedError" }) } })
  const { button, store } = await mount()
  act(() => button.click())
  expect(button.getAttribute("aria-label")).toBe("Copy message")
  await act(async () => { await waitFor(() => [...store.collections.toasts.values()].some(toast => toast.status === "failed" && toast.detail.includes("The copy didn't go through"))) })
  expect([...store.collections.toasts.values()].some(toast => toast.status === "failed" && toast.detail.includes("The copy didn't go through"))).toBe(true)
  expect(button.getAttribute("aria-label")).toBe("Copy message")
  expect(button.textContent).not.toContain("Copied")
})

test("an older clipboard result cannot confirm a newer pending copy", async () => {
  const writes: Array<() => void> = []
  setClipboard({ writeText: () => new Promise<void>(resolve => { writes.push(resolve) }) })
  const { button } = await mount()
  act(() => button.click())
  await settle()
  act(() => button.click())
  await settle()
  expect(writes).toHaveLength(2)
  await act(async () => { writes[0]!(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(button.getAttribute("aria-label")).toBe("Copy message")
  await act(async () => { writes[1]!(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(button.getAttribute("aria-label")).toBe("Copied")
})

test("an older confirmation timer cannot clear a newer confirmation", async () => {
  const resetCallbacks: Array<() => void> = []
  const originalSetTimeout = window.setTimeout
  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (timeout === 1200 && typeof handler === "function") {
      resetCallbacks.push(() => handler(...args))
      return 0
    }
    return originalSetTimeout(handler, timeout, ...args)
  }) as typeof window.setTimeout
  try {
    setClipboard({ writeText: async () => {} })
    const { button } = await mount()
    act(() => button.click())
    await settle()
    expect(button.getAttribute("aria-label")).toBe("Copied")
    act(() => button.click())
    await settle()
    expect(resetCallbacks).toHaveLength(2)
    act(() => resetCallbacks[0]!())
    expect(button.getAttribute("aria-label")).toBe("Copied")
    act(() => resetCallbacks[1]!())
    expect(button.getAttribute("aria-label")).toBe("Copy message")
  } finally {
    window.setTimeout = originalSetTimeout
  }
})

test("an answer offers Make TODO and Save to wiki through the shared flows", async () => {
  const h = await mount()
  const make = document.querySelector<HTMLButtonElement>('[data-flow="todo.new"]')!
  const save = document.querySelector<HTMLButtonElement>('[data-flow="wiki.save"]')!
  expect(make.textContent).toBe("Make TODO")
  expect(save.textContent).toBe("Save to wiki")
  act(() => make.click())
  await settle()
  await waitFor(() => [...h.store.collections.cards.values()].some(card => card.kind === "draft" && card.payload.prompt === "A message to copy"))
  act(() => save.click())
  await settle()
  await waitFor(() => [...h.store.collections.cards.values()].some(card => card.kind === "flow-form"))
  const form = [...h.store.collections.cards.values()].find(card => card.kind === "flow-form")!
  expect(form.kind).toBe("flow-form")
  if (form.kind === "flow-form") {
    expect(form.payload.given.text).toBe("A message to copy")
    expect(form.payload.fields.map(field => field.name)).toEqual(["name"])
  }
})

/*
 * The answer footer on a real host (#4031).
 *
 * Production reproduced this on UI10a: every completed reply, down to a
 * one-word one, ended in a disabled Make TODO and the sentence `/todo.new is
 * not available on this origin yet.` beside Save to wiki. These tests render a
 * completed answer through the same View over the capability list the hosted
 * origin actually serves, so the footer's words are asserted, not inferred from
 * the binding helper.
 */

/** The capability list `https://smithers.sh/api/bootstrap` serves: no `install`, so no /api/todos family. */
const HOSTED: ReadonlyArray<RuntimeCapability> = [
  "identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select",
  "cloud", "cloud.terminal", "billing.balance", "billing.overview", "billing.plans", "billing.portal", "billing.checkout"
]

const bootstrapOf = (capabilities: ReadonlyArray<RuntimeCapability>): AppBootstrap => ({
  apiVersion: 1, host: "cloud", version: "test", buildSha: "0061790946c765d241205ba9721fabc5c923234b",
  capabilities: [...capabilities], authFlow: "redirect", sandbox: null
})

/** A host whose /api/todos is unmounted and whose Wiki answers plue's feature gate. */
const answerHost = async (capabilities: ReadonlyArray<RuntimeCapability>) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const profile = signupProfileFetch(async (input, init) => {
    const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, "https://smithers.sh").pathname
    const method = init?.method ?? "GET"
    if (path.startsWith("/api/todos")) return new Response("404 page not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    if (path.endsWith("/wiki") && method === "POST") {
      return Response.json({ code: "forbidden", class: "permission", fault: "user", message: "feature not available" }, { status: 403 })
    }
    if (path.endsWith("/navigation/index")) return Response.json({ pages: [], folders: [], tags: [] })
    return new Response("{}", { status: 404 })
  })
  const controller = createAppController(store, silentAgent, { fetchImpl: profile.fetchImpl, bootstrap: bootstrapOf(capabilities) })
  controllers.add(controller)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "owner/repo", org: "owner", name: "repo", ownerKind: "user", head: null }] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/repo" }).isPersisted.promise
  return { store, controller }
}

/** One real completed answer, rendered by the View the transcript uses. */
const renderAnswer = (controller: AppController, text = "Yes."): HTMLElement => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  roots.add(root)
  act(() => root.render(
    <ControllerTestProvider controller={controller}>
      <TranscriptMessage entry={{ kind: "message", message: {
        id: "answer", role: "smithers", text, status: "complete", createdAt: 1, ordinal: 1
      } }} />
    </ControllerTestProvider>
  ))
  return host
}

const ORIGIN_SENTENCE = "is not available on this origin yet."

test("a completed answer on the hosted bootstrap offers only the shortcut this host runs, and says nothing about the one it does not", async () => {
  const h = await answerHost(HOSTED)
  const host = renderAnswer(h.controller)
  // The reply itself is untouched, even at one word.
  expect(host.textContent).toContain("Yes.")
  // No disabled Make TODO, and none of its implementation prose anywhere in the answer.
  expect(host.querySelector('[data-flow="todo.new"]')).toBeNull()
  expect(host.textContent).not.toContain(ORIGIN_SENTENCE)
  expect(host.textContent).not.toContain("Make TODO")
  expect(host.querySelector(".code-action-reason")).toBeNull()
  // The supported shortcut is there, enabled, and the only one.
  const footer = host.querySelector(".message-answer-actions")!
  expect(footer).not.toBeNull()
  expect([...footer.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Save to wiki"])
  const save = host.querySelector<HTMLButtonElement>('[data-flow="wiki.save"]')!
  expect(save.disabled).toBe(false)
  // Keyboard-usable: a focusable button, not an aria-hidden or tab-skipped one.
  save.focus()
  expect(document.activeElement).toBe(save)
  expect(save.getAttribute("aria-hidden")).toBeNull()
  expect(save.tabIndex).toBe(0)
  // And it dispatches the same flow exactly once.
  act(() => save.click())
  await settle()
  await waitFor(() => [...h.store.collections.cards.values()].filter(card => card.kind === "flow-form").length === 1)
  const forms = [...h.store.collections.cards.values()].filter(card => card.kind === "flow-form")
  expect(forms).toHaveLength(1)
  const form = forms[0]!
  if (form.kind === "flow-form") expect(form.payload.given.text).toBe("Yes.")
  // The explicit door keeps the honest refusal the footer stopped repeating.
  expect(await h.controller.runCommandForResult("todo.new", "Yes."))
    .toMatchObject({ status: "unavailable", reason: "/todo.new is not available on this origin yet." })
})

test("an install's bootstrap offers both answer shortcuts, each enabled and with no sentence beside it", async () => {
  const h = await answerHost([...HOSTED, "install"])
  const host = renderAnswer(h.controller)
  const footer = host.querySelector(".message-answer-actions")!
  expect([...footer.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Make TODO", "Save to wiki"])
  for (const button of footer.querySelectorAll("button")) expect((button as HTMLButtonElement).disabled).toBe(false)
  expect(host.textContent).not.toContain(ORIGIN_SENTENCE)
  expect(host.querySelector(".code-action-reason")).toBeNull()
  // The supported TODO door still drafts through the one shared flow, once.
  const make = host.querySelector<HTMLButtonElement>('[data-flow="todo.new"]')!
  act(() => make.click())
  await settle()
  await waitFor(() => [...h.store.collections.cards.values()].filter(card => card.kind === "draft").length === 1)
  expect([...h.store.collections.cards.values()].filter(card => card.kind === "draft")).toHaveLength(1)
})

test("a completed answer on an origin that runs neither shortcut has no action container at all", async () => {
  const h = await answerHost(HOSTED)
  // This origin's own Wiki gate refuses the save, which withdraws the family here.
  await h.controller.submitCommand({ name: "wiki.save", actor: "user", payload: { name: "Queue guide", text: "Yes." } })
  await waitFor(() => h.store.session().wikiSaves?.[0]?.state === "failed", 5_000)
  expect(h.controller.commands.find("wiki.save")).toBeUndefined()
  const host = renderAnswer(h.controller)
  expect(host.textContent).toContain("Yes.")
  // Nothing to offer is no footer, never an empty container or two sentences.
  expect(host.querySelector(".message-answer-actions")).toBeNull()
  expect(host.querySelectorAll('[data-flow="todo.new"], [data-flow="wiki.save"]')).toHaveLength(0)
  expect(host.textContent).not.toContain(ORIGIN_SENTENCE)
  // Copy stays where it was: the answer keeps the actions that are not doors.
  expect(host.querySelector('[data-flow="chat.copy-message"]')).not.toBeNull()
  // Both withdrawn doors still answer an explicit request truthfully.
  expect(await h.controller.runCommandForResult("wiki.save", "Queue guide"))
    .toMatchObject({ status: "unavailable", reason: "/wiki.save is not available on this origin yet." })
})
