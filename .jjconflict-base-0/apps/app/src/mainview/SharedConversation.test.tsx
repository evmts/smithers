import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, expect, test } from "bun:test"
import { MessageScrollerProvider } from "@smthrs/ui"
import { renderToStaticMarkup } from "react-dom/server"
import { ControllerContext } from "./ControllerContext"
import { SharedConversation } from "./SharedConversation"
import type { AppController } from "./state/AppController"
import type { Card } from "./state/AppState"
import { createAppStore } from "./state/AppStore"
import { memoryStorage } from "./state/TestFixtures"
import { SharedConversationSchema, type SharedConversationSeam } from "./state/seams/SharedConversationSeam"

GlobalRegistrator.register()
afterAll(async () => { await GlobalRegistrator.unregister() })
const card = (id: string, title: string): Card => ({ id, kind: "browser", title, status: "active", createdAt: 0, ordinal: 0,
  payload: { url: "https://example.com/", finalUrl: null, status: 200, frameable: true, blockReason: null } })

test("shared cards retain their first position, latest record, and one owner across local and shared rows", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = { store, runCommand: () => {}, runCommandForResult: async () => undefined } as unknown as AppController
  const conversation = SharedConversationSchema.parse({ id: "main", entries: [
    { id: "first", author: 1, authorLogin: "maya", runId: "run-1", prompt: "first", state: "completed", frames: [
      { type: "delta", runId: "run-1", kind: "text", text: "Before the card" },
      { type: "card", runId: "run-1", card: card("page", "Before") },
      { type: "delta", runId: "run-1", kind: "text", text: "After the card" },
      { type: "card", runId: "foreign-run", card: card("foreign", "Foreign") }
    ] },
    { id: "second", author: 1, authorLogin: "maya", runId: "run-2", prompt: "second", state: "completed", frames: [
      { type: "card", runId: "run-2", card: card("page", "After") },
      { type: "card", runId: "run-2", card: card("other", "Other page") }
    ] }
  ] })
  const source = { get: () => ({ conversation }), subscribe: () => () => {} } as unknown as SharedConversationSeam
  try {
    const render = (localCardIds?: ReadonlySet<string>) => renderToStaticMarkup(<ControllerContext value={controller}><MessageScrollerProvider><SharedConversation source={source} localCardIds={localCardIds} /></MessageScrollerProvider></ControllerContext>)
    const html = render()
    expect(html.match(/data-testid="card-page"/g)).toHaveLength(1)
    expect(html).toContain("After")
    expect(html).not.toContain('>Before<')
    expect(html.indexOf("Before the card")).toBeLessThan(html.indexOf('data-testid="card-page"'))
    expect(html.indexOf("After the card")).toBeGreaterThan(html.indexOf('data-testid="card-page"'))
    expect(html).not.toContain("Foreign")
    expect(html.indexOf('data-testid="card-page"')).toBeLessThan(html.indexOf('data-testid="card-other"'))
    const local = render(new Set(["page"]))
    expect(local).not.toContain('data-testid="card-page"')
    expect(local).toContain('data-testid="card-other"')
  } finally { await store.dispose?.() }
})

for (const cell of [
  { state: "completed", text: "Retry policy in retry.ts", actions: true },
  { state: "running", text: "Partial answer", actions: false },
  { state: "failed", text: "Partial failure", actions: false },
  { state: "completed", text: "   ", actions: false }
]) test(`shared answer actions: ${cell.state} ${JSON.stringify(cell.text)}`, async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = { store, runCommand: () => {}, runCommandForResult: async () => undefined } as unknown as AppController
  const conversation = SharedConversationSchema.parse({ id: "main", entries: [{
    id: "answer", author: 2, authorLogin: "ben", runId: "run-answer", prompt: "Where?", state: cell.state,
    frames: [{ type: "delta", runId: "run-answer", kind: "text", text: cell.text }]
  }] })
  const source = { get: () => ({ conversation }), subscribe: () => () => {} } as unknown as SharedConversationSeam
  try {
    const html = renderToStaticMarkup(<ControllerContext value={controller}><MessageScrollerProvider><SharedConversation source={source} /></MessageScrollerProvider></ControllerContext>)
    expect(html.includes("Make TODO")).toBe(cell.actions)
    expect(html.includes("Save to wiki")).toBe(cell.actions)
    expect(html.includes('class="message-answer-actions"')).toBe(cell.actions)
  } finally { await store.dispose?.() }
})

/*
 * The capacity failure production turn 83bca322 actually produced: five
 * host_no_capacity generations over 206.8 s, no provider start and no text.
 * The typed outcome, not the producer's sentence, has to choose the words a
 * person reads first, and the producer's words stay behind Details.
 */
const turnOf = (fields: Record<string, unknown>) => SharedConversationSchema.parse({ id: "main", entries: [{
  id: "capacity", author: 3, authorLogin: "ben", runId: "run-capacity", prompt: "Short reply please",
  startedAt: Date.now() - 206_802, ...fields
}] })
/* The viewer defaults to the turn's own author, as in the production turn. */
const renderShared = async (conversation: ReturnType<typeof SharedConversationSchema.parse>, viewer = "ben") => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: viewer, admin: false, scopesPlain: null }).isPersisted.promise
  const controller = { store, runCommand: () => {}, runCommandForResult: async () => undefined } as unknown as AppController
  const source = { get: () => ({ conversation }), subscribe: () => () => {} } as unknown as SharedConversationSeam
  try {
    return renderToStaticMarkup(<ControllerContext value={controller}><MessageScrollerProvider><SharedConversation source={source} /></MessageScrollerProvider></ControllerContext>)
  } finally { await store.dispose?.() }
}
const CAPACITY_WORDS = "Every model host is busy right now. Nothing in this conversation was lost; send the message again in a moment."

test("a turn with no committed output says it is waiting for a host, not working", async () => {
  const waiting = await renderShared(turnOf({ state: "running", frames: [] }))
  expect(waiting).toContain('data-turn-elapsed="waiting"')
  expect(waiting).toContain("Waiting for a model host")
  expect(waiting).not.toContain("Working for")
  // The same turn once a host answers: the honest line becomes the working one.
  const working = await renderShared(turnOf({ state: "running", frames: [{ runId: "run-capacity", type: "delta", kind: "text", text: "Here it is" }] }))
  expect(working).toContain('data-turn-elapsed="working"')
  expect(working).toContain("Working for")
  expect(working).not.toContain("Waiting for a model host")
})

/*
 * The projection shares a turn's reasoning and tool frames with its author
 * alone (packages/backend/internal/chat/shared.go sharedFrame), so another
 * member watching a turn that is reasoning or running tools sees no frames at
 * all. Reading that as "no model host has answered" would tell them a host is
 * idle while one is working; their line keeps the elapsed work it always had.
 */
test("another member's turn with nothing shared yet still says it is working", async () => {
  const html = await renderShared(turnOf({ state: "running", frames: [] }), "maya")
  expect(html).toContain('data-turn-elapsed="working"')
  expect(html).toContain("Working for")
  expect(html).not.toContain("Waiting for a model host")
})

test("a terminal capacity refusal names the busy fleet first and keeps the producer's words in Details", async () => {
  const html = await renderShared(turnOf({ state: "failed", finishedAt: Date.now(), frames: [
    { runId: "run-capacity", type: "done", code: "host_no_capacity", error: CAPACITY_WORDS }
  ] }))
  expect(html).toContain("Every model host is busy. Nothing here was lost; send it again in a moment.")
  expect(html).toContain('data-failure="HostNoCapacity"')
  expect(html).not.toContain("Smithers could not finish that")
  // The producer's sentence stays raw detail inside the disclosure, wrapped.
  expect(html).toContain(CAPACITY_WORDS)
  expect(html.indexOf("<details>")).toBeLessThan(html.indexOf(CAPACITY_WORDS))
  expect(html).toContain('class="failure-detail"')
  expect(html).toContain('data-turn-elapsed="failed"')
})

test("an outcome this build cannot classify keeps the generic sentence", async () => {
  const html = await renderShared(turnOf({ state: "failed", finishedAt: Date.now(), frames: [
    { runId: "run-capacity", type: "delta", kind: "text", text: "Partial answer" },
    { runId: "run-capacity", type: "done", error: "upstream closed the stream" }
  ] }))
  expect(html).toContain("Smithers could not finish that. Not your fault.")
  expect(html).toContain('data-failure="SharedTurnFailed"')
  expect(html).not.toContain("Every model host is busy")
  // Partial text a failed turn did produce is still the answer it gave.
  expect(html).toContain("Partial answer")
})

test("a cancelled turn keeps its stop line and raises no failure", async () => {
  const html = await renderShared(turnOf({ state: "cancelled", finishedAt: Date.now() - 200_000, frames: [
    { runId: "run-capacity", type: "done", reason: "cancelled" }
  ] }))
  expect(html).toContain('data-turn-elapsed="cancelled"')
  expect(html).toContain("Stopped after")
  expect(html).not.toContain("failure-notice")
  expect(html).not.toContain("Every model host is busy")
})
