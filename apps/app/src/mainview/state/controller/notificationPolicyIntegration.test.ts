/*
 * The integration boundaries of the repository notification policy (M-47,
 * mvp.md §6.17, #4026) that its own unit suite does not reach: a REAL repository
 * switch under one signed-in identity, a REAL throwing policy boundary, the
 * `handling.quiet` flag the contract decodes, a policy run that never answers,
 * and a wait that resolves while the policy is still deciding.
 *
 * Every fence here is the real one: the real `AppStore` with two real loaded
 * repositories and a real `repo.selected`, the real `resolveTargetRepo` the
 * router resolves its repository through (no `repoFor` override), the real
 * `createGatewaySeam` relay envelope, the real `createTodoSeam` delivery, and
 * the real raised surfaces — `railNotices` for the HUD and
 * `createFailureController` for the browser notice. No hand-built graph and no
 * `current = false` boolean stands in for any of them.
 */
import { afterEach, expect, test } from "bun:test"
import { fixtures } from "../../../../../../packages/rpc/test/fixtures/Todo"
import { railNotices } from "../../ShellRail"
import { ToastSchema } from "../AppState"
import { createAppStore } from "../AppStore"
import { loadBox, memoryStorage, settle, unavailableAgent, waitFor } from "../TestFixtures"
import type { SeamContext } from "../seams/SeamContext"
import { createTodoSeam } from "../seams/TodoSeam"
import { createControllerContext } from "./context"
import { createFailureController } from "./failures"
import { createGatewaySeam } from "./gateway"
import { createNotificationPolicyRouter } from "./notificationPolicy"
import { NOTIFICATION_POLICY_EVENT } from "@smthrs/rpc/NotificationPolicy"
import { gatewayBindingFor } from "../RepoContext"

const HOME = "maya/app"
const AWAY = "maya/other"
const MAYA = { login: "maya", name: "Maya", avatar_url: fixtures.needs_you.model.owner.avatar_url }
/** Owner Maya, Ben on the branch: the viewer is a reader and not the owner. */
const onBranch = { ...fixtures.needs_you.model, owner: MAYA }
const working = { ...fixtures.working.model, owner: MAYA }
const reviewing = { ...fixtures.in_review.model, owner: MAYA }
/** The same card with its one wait answered. */
const answered = { ...onBranch, state: "working" as const, waits: [] }

const projection = {
  on: [{ event: NOTIFICATION_POLICY_EVENT, flow: "who-is-told", description: "Choose who is told" }],
  flows: [{ id: "who-is-told", description: "Choose who is told", summary: null, featured: false,
    kind: "ts" as const, path: "flows/who-is-told/flow.ts", capabilities: [], model: null, modelInvocable: false }]
}

const summaryRow = (output: string, status = "completed") => ({
  ok: true,
  payload: { cursor: { projection: "run-summary", runId: "run-1", value: 1 },
    rows: [{ runId: "run-1", flowId: "who-is-told", status, createdAt: 1, updatedAt: 2, verdict: status,
      diagnosis: "", finalOutput: output, turns: 0, calls: 0, callsFailed: 0, editsAttempted: 0,
      editsSucceeded: 0, inputTokens: 0, outputTokens: 0 }] }
})

interface Box {
  /** Hold every run-summary read until the test releases it. */
  readonly hold?: boolean
  /** Never answer a run-summary read at all: a hung policy. */
  readonly hang?: boolean
  readonly decision?: unknown
}

/** The workspace double: the real relay envelope, one scripted policy run. */
const workspace = (box: Box) => {
  const launches: Array<{ readonly repo: string; readonly flowId: string }> = []
  let release: (() => void) | undefined
  const held = box.hold === true ? new Promise<void>((resolve) => { release = resolve }) : undefined
  const http: SeamContext["http"] = async (url, init) => {
    if (url.includes("/contents/.smithers/factory.json")) {
      return Response.json({ content: JSON.stringify(projection), encoding: "utf8" })
    }
    if (url.endsWith("/api/workflow/rpc")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { repo: string; procedure: string; payload: Record<string, unknown> }
      if (body.procedure === "Plan") {
        launches.push({ repo: body.repo, flowId: String(body.payload.flowId) })
        return Response.json({ ok: true, payload: { planId: "plan-1", digest: "digest-1", envelope: {} } })
      }
      if (body.procedure === "Approval.Submit") return Response.json({ ok: true, payload: { decision: { _tag: "Accepted" } } })
      if (body.procedure === "Run") return Response.json({ ok: true, payload: { runId: "run-1" } })
      if (body.procedure === "Projection.Snapshot") {
        if (box.hang === true) return await new Promise<Response>(() => {})
        if (held !== undefined) await held
        return Response.json(summaryRow(JSON.stringify(box.decision ?? { recipients: ["ben"] })))
      }
    }
    return Response.json([], { status: 200 })
  }
  return { http, launches, release: () => release?.() }
}

const originals = new Map(["window", "document", "Notification"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
afterEach(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})
/** The real browser notice surface, as controller/notifications.test.ts mounts it. */
const browser = () => {
  const notices: Array<{ readonly title: string; readonly tag: unknown }> = []
  class RecordedNotification {
    static permission = "granted"
    static requestPermission() { return Promise.resolve("denied" as const) }
    onclick: (() => void) | null = null
    constructor(readonly title: string, readonly options: NotificationOptions) { notices.push({ title, tag: options.tag }) }
    close() {}
  }
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: { isSecureContext: true, matchMedia: () => ({ matches: false }), focus() {} } },
    document: { configurable: true, value: { hidden: true, documentElement: { dataset: {} } } },
    Notification: { configurable: true, value: RecordedNotification }
  })
  return notices
}

/**
 * One signed-in identity, two real loaded repositories, one selected: the
 * router resolves its repository through the real store exactly as
 * AppController wires it.
 */
const harness = async (box: Box, options: {
  readonly bindingThrows?: boolean
  readonly deadlineMs?: number
  readonly mountBrowser?: boolean
} = {}) => {
  const notices = options.mountBrowser === true ? browser() : []
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben",
    provider: "github", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: HOME, org: "maya", ownerKind: "user", name: "app", head: null },
    { id: AWAY, org: "maya", ownerKind: "user", name: "other", head: null }
  ] }).isPersisted.promise
  await loadBox(store, HOME, "0b0c0d0e-0000-4000-8000-00000000000a")
  await loadBox(store, AWAY, "0b0c0d0e-0000-4000-8000-00000000000b")
  await store.dispatch({ type: "repo.selected", actor: "user", id: HOME }).isPersisted.promise
  const controller = options.mountBrowser === true ? createControllerContext(store, unavailableAgent, {}) : undefined
  if (controller) {
    controller.commands = { submit: async () => ({ status: "executed" }) } as unknown as typeof controller.commands
    createFailureController(controller)
  }
  const bay = workspace(box)
  let disposed = false
  const reported: string[] = []
  const finalizers: Array<() => void> = []
  const ctx: SeamContext = {
    store, dispatch: store.dispatch, baseUrl: "https://app.test", actor: () => "user",
    nextOrdinal: store.nextOrdinal, isDisposed: () => disposed,
    http: (url, init) => url.endsWith("/api/todos") && !init?.method
      ? Promise.resolve(Response.json([], { status: 200 })) : bay.http(url, init),
    report: (subject) => reported.push(subject),
    resolveToast: () => {}
  }
  const gateway = createGatewaySeam({ baseUrl: "https://app.test", bindingFor: () => ({ workspaceId: "box-1" }),
    fetch: (url, init) => bay.http(url, init) as Promise<Response>, errorMessageOf: async (_r, fallback) => fallback })
  const router = createNotificationPolicyRouter(ctx, {
    gateway,
    // The production wiring: the store's own binding for the notice's repository.
    bindingFor: (repo) => {
      if (options.bindingThrows === true) throw new Error("box read failed for https://app.test/boxes?token=ghp_secret")
      return gatewayBindingFor(store, repo)
    },
    pollMs: 1,
    attempts: 20,
    ...(options.deadlineMs === undefined ? {} : { deadlineMs: options.deadlineMs })
  })
  const seam = createTodoSeam(ctx, { debounceMs: 1, notificationPolicy: router.route,
    onDispose: (stop) => finalizers.push(stop) })
  const toasts = (prefix?: string) => [...store.collections.toasts.values()]
    .filter((toast) => prefix === undefined || toast.key.startsWith(prefix))
  return {
    store, seam, router, toasts, notices, reported, launches: bay.launches, release: bay.release,
    rail: () => railNotices([...store.collections.toasts.values()], [], "ben"),
    switchRepo: () => store.dispatch({ type: "repo.selected", actor: "user", id: AWAY }).isPersisted.promise,
    close: async () => {
      disposed = true
      for (const stop of finalizers) stop()
      await controller?.dispose()
    }
  }
}

/* 1 — the repository fence the contract and the architecture note both promise. */

test("a policy answer that arrives after a real repository switch decides nothing", async () => {
  const h = await harness({ hold: true, decision: { recipients: ["ben"] } })
  try {
    await h.seam.applyTodoProjection(12, onBranch)
    await waitFor(() => h.launches.length === 1)
    expect(h.launches[0]).toEqual({ repo: HOME, flowId: "who-is-told" })
    // The same person, the same identity revision: only the active repository moved.
    await h.switchRepo()
    h.release()
    await settle(20)
    expect(h.toasts("todo.needs-you.")).toEqual([])
    // And no run was ever started against the repository the person moved to.
    expect(h.launches.map((launch) => launch.repo)).toEqual([HOME])
  } finally { await h.close() }
})

test("the repository fence names its own closed reason, not a policy decision", async () => {
  const h = await harness({ hold: true, decision: { recipients: ["ben"] } })
  try {
    const answer = h.router.route({ kind: "in_review", entryId: "todo.in_review.12", todo: 12 },
      { owner: "maya", candidates: ["maya", "ben"], defaults: ["maya"] }, () => true)
    await waitFor(() => h.launches.length === 1)
    await h.switchRepo()
    h.release()
    const outcome = await answer
    expect(outcome.recipients).toEqual([])
    expect(outcome.stamp).toEqual({ source: "default", reason: "policy-superseded" })
  } finally { await h.close() }
})

/* 2 — a throwing policy boundary must not widen the audience. */

test("a throwing policy boundary tells only the default audience, never a branch reader", async () => {
  const h = await harness({ decision: { recipients: ["ben"] } }, { bindingThrows: true })
  try {
    // in_review is owner-only under §6.4, and Ben is a branch reader, not the owner.
    await h.seam.applyTodoProjection(12, working)
    await h.seam.applyTodoProjection(12, reviewing)
    await settle(20)
    expect(h.toasts("todo.in_review.")).toEqual([])
  } finally { await h.close() }
})

test("the router answers a throwing workspace binding itself, with one closed reason", async () => {
  const h = await harness({}, { bindingThrows: true })
  try {
    const outcome = await h.router.route({ kind: "failed", entryId: "todo.failed.12", todo: 12 },
      { owner: "maya", candidates: ["maya", "ben"], defaults: ["maya"] }, () => true)
    expect(outcome.stamp).toEqual({ source: "default", reason: "policy-unavailable" })
    // Nothing of the throw reaches the notice: no prose, path, URL or credential.
    expect(JSON.stringify(outcome)).not.toContain("ghp_secret")
  } finally { await h.close() }
})

/* 3 — handling.quiet, which the contract decodes and the docs promise. */

test("a quiet decision keeps the notification record but raises no notice", async () => {
  const h = await harness({ decision: { recipients: ["ben"], handling: { quiet: true } } }, { mountBrowser: true })
  try {
    await h.seam.applyTodoProjection(12, onBranch)
    await waitFor(() => h.toasts("todo.needs-you.").length === 1)
    await settle(10)
    const record = h.toasts("todo.needs-you.")[0]!
    // The record is retained: the policy chose Ben and the notice says so.
    expect(record.audience).toMatchObject({ member: "ben", kind: "needs_you", quiet: true, policy: { source: "policy" } })
    // The HUD raises nothing and no browser notice fires.
    expect(h.rail()).toEqual([])
    expect(h.notices).toEqual([])
  } finally { await h.close() }
})

test("a decision that does not ask for quiet still raises the notice on both surfaces", async () => {
  const h = await harness({ decision: { recipients: ["ben"] } }, { mountBrowser: true })
  try {
    await h.seam.applyTodoProjection(12, onBranch)
    await waitFor(() => h.toasts("todo.needs-you.").length === 1)
    await settle(10)
    expect(h.toasts("todo.needs-you.")[0]!.audience?.quiet).toBeUndefined()
    expect(h.rail().map((notice) => notice.kind)).toEqual(["needs_you"])
    expect(h.notices.map((notice) => notice.tag)).toEqual(["todo.needs-you.12.wait-question-1"])
  } finally { await h.close() }
})

test("a notice stored before quiet existed still parses and still raises", async () => {
  // An added optional field is only free when nothing writes it to an old
  // row's bytes (AppEventStream.ts 36/37): `quiet` is absent on every stored
  // notice, the projector copies the audience it was given, and the raised
  // surfaces read the absence as "raise it".
  const legacy = ToastSchema.parse({
    id: "toast-todo.needs-you.9.q1", key: "todo.needs-you.9.q1", title: "T9 needs you", status: "running",
    detail: "", createdAt: 1, updatedAt: 1,
    audience: { member: "ben", entryId: "todo.needs-you.9.q1", kind: "needs_you", actorLabel: "Smithers",
      target: { flow: "todo", n: 9 } }
  })
  expect(legacy.audience?.quiet).toBeUndefined()
  expect(railNotices([legacy], [], "ben").map((notice) => notice.entry_id)).toEqual(["todo.needs-you.9.q1"])
})

/* 4 — the ten-second bound the honest-limits note claims. */

test("a policy whose run never answers still delivers the default, once, within its bound", async () => {
  const h = await harness({ hang: true }, { deadlineMs: 40 })
  try {
    await h.seam.applyTodoProjection(12, onBranch)
    await waitFor(() => h.toasts("todo.needs-you.").length === 1, 4_000)
    expect(h.toasts("todo.needs-you.")[0]).toMatchObject({
      audience: { member: "ben", policy: { source: "default", reason: "policy-failed" } }
    })
    await settle(40)
    // No second delivery, and no second run for the same notice.
    expect(h.toasts("todo.needs-you.").length).toBe(1)
    expect(h.launches.length).toBe(1)
  } finally { await h.close() }
})

/* 5 — a wait that resolves while the policy is deciding. */

test("a wait answered while the policy decides is not resurrected by the late answer", async () => {
  const h = await harness({ hold: true, decision: { recipients: ["ben"] } })
  try {
    await h.seam.applyTodoProjection(12, onBranch)
    await waitFor(() => h.launches.length === 1)
    // The person answered the wait before the repository's policy came back.
    await h.seam.applyTodoProjection(12, answered)
    h.release()
    await settle(20)
    expect(h.toasts("todo.needs-you.")).toEqual([])
  } finally { await h.close() }
})

test("a newer state supersedes the decision the old one was still waiting for", async () => {
  const h = await harness({ hold: true, decision: { recipients: ["ben", "maya"] } })
  try {
    await h.seam.applyTodoProjection(12, working)
    await h.seam.applyTodoProjection(12, reviewing)
    await waitFor(() => h.launches.length === 1)
    await h.seam.applyTodoProjection(12, { ...reviewing, state: "merged" as const })
    h.release()
    await settle(20)
    expect(h.toasts("todo.in_review.")).toEqual([])
  } finally { await h.close() }
})
