/*
 * Repository-owned notification policy (M-47, mvp.md §6.17, #4026) through the
 * paths it really runs on: the declared Dispatcher rule read off the contents
 * route, the policy flow launched through the ordinary workflow gateway
 * envelope (Plan → Approval.Submit → Run → run-summary), and the TODO notice
 * seam that delivers the toast. No hand-built graph and no second notification
 * engine stands in for any of them.
 */
import { expect, test } from "bun:test"
import {
  NOTIFICATION_POLICY_EVENT,
  NotificationPolicyDecisionSchema,
  notificationPolicyDefault,
  notificationPolicyRecord,
  notificationPolicyResult
} from "@smthrs/rpc/NotificationPolicy"
import type { NotificationPolicyEvent, NotificationPolicyRequest } from "@smthrs/rpc/NotificationPolicy"
import { fixtures } from "../../../../../../packages/rpc/test/fixtures/Todo"
import { createAppStore } from "../AppStore"
import { memoryStorage, settle, waitFor } from "../TestFixtures"
import type { SeamContext } from "../seams/SeamContext"
import { createTodoSeam } from "../seams/TodoSeam"
import { createGatewaySeam } from "./gateway"
import { createNotificationPolicyRouter } from "./notificationPolicy"

const REPO = "maya/app"
const MAYA = { login: "maya", name: "Maya", avatar_url: fixtures.needs_you.model.owner.avatar_url }
/** Ben is on the branch; the default policy therefore tells him (mvp.md §6.4). */
const onBranch = { ...fixtures.needs_you.model, owner: MAYA }
/** The same branch, reaching review: an owner-only notice under §6.4. */
const working = { ...fixtures.working.model, owner: MAYA }
const reviewing = { ...fixtures.in_review.model, owner: MAYA }

type Answer =
  | { readonly kind: "declared"; readonly decision?: unknown; readonly status?: string; readonly output?: string }
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "ambiguous" }

const projectionFor = (answer: Answer) => ({
  on: answer.kind === "none" ? [{ event: "change.opened", flow: "review" }]
    : answer.kind === "ambiguous"
    ? [{ event: NOTIFICATION_POLICY_EVENT, flow: "who" }, { event: NOTIFICATION_POLICY_EVENT, flow: "other" }]
    : [{ event: NOTIFICATION_POLICY_EVENT, flow: "who-is-told", description: "Choose who is told" }],
  flows: [{ id: "who-is-told", description: "Choose who is told", summary: null, featured: false,
    kind: "ts" as const, path: ".smithers/flows/who-is-told/flow.ts", capabilities: [], model: null, modelInvocable: false }]
})

/** The workspace double: the real relay envelope, one scripted policy run. */
const workspace = (answer: Answer) => {
  const launches: Array<{ readonly flowId: string; readonly input: unknown; readonly idempotencyKey: unknown }> = []
  const http: SeamContext["http"] = async (url, init) => {
    if (url.endsWith("/contents/.smithers/factory.json")) {
      if (answer.kind === "unreadable") return new Response("", { status: 500 })
      return Response.json({ content: JSON.stringify(projectionFor(answer)), encoding: "utf8" })
    }
    if (url.endsWith("/api/workflow/rpc")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { procedure: string; payload: Record<string, unknown> }
      if (body.procedure === "Plan") {
        launches.push({ flowId: String(body.payload.flowId), input: body.payload.input,
          idempotencyKey: body.payload.idempotencyKey })
        return Response.json({ ok: true, payload: { planId: "plan-1", digest: "digest-1", envelope: {} } })
      }
      if (body.procedure === "Approval.Submit") {
        return Response.json({ ok: true, payload: { decision: { _tag: "Accepted" } } })
      }
      if (body.procedure === "Run") return Response.json({ ok: true, payload: { runId: "run-1" } })
      if (body.procedure === "Projection.Snapshot") {
        const status = answer.kind === "declared" ? answer.status ?? "completed" : "completed"
        const output = answer.kind === "declared"
          ? answer.output ?? JSON.stringify(answer.decision ?? { recipients: [] })
          : "{}"
        return Response.json({ ok: true, payload: { cursor: { projection: "run-summary", runId: "run-1", value: 1 },
          rows: [{ runId: "run-1", flowId: "who-is-told", status, createdAt: 1, updatedAt: 2, verdict: status,
            diagnosis: "", finalOutput: output, turns: 0, calls: 0, callsFailed: 0, editsAttempted: 0,
            editsSucceeded: 0, inputTokens: 0, outputTokens: 0 }] } })
      }
    }
    return Response.json([], { status: 200 })
  }
  return { http, launches }
}

const harness = async (answer: Answer, login = "ben") => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login,
    provider: "github", admin: false, scopesPlain: null }).isPersisted.promise
  const box = workspace(answer)
  let disposed = false
  const finalizers: Array<() => void> = []
  const ctx: SeamContext = {
    store, dispatch: store.dispatch, baseUrl: "https://app.test", actor: () => "user",
    nextOrdinal: store.nextOrdinal, isDisposed: () => disposed,
    http: (url, init) => url.endsWith("/api/todos") && !init?.method
      ? Promise.resolve(Response.json([], { status: 200 })) : box.http(url, init),
    resolveToast: () => {}
  }
  const gateway = createGatewaySeam({ baseUrl: "https://app.test", bindingFor: () => ({ workspaceId: "box-1" }),
    fetch: (url, init) => box.http(url, init) as Promise<Response>, errorMessageOf: async (_r, fallback) => fallback })
  const router = createNotificationPolicyRouter(ctx, { gateway, bindingFor: () => ({ workspaceId: "box-1" }),
    repoFor: () => REPO, pollMs: 1, attempts: 20 })
  const route = (event: NotificationPolicyEvent, current: () => boolean = () => true) =>
    router.route(event, { owner: "maya", candidates: ["maya", "ben"], defaults: ["maya", "ben"] }, current)
  const seam = createTodoSeam(ctx, { debounceMs: 1, notificationPolicy: router.route,
    onDispose: (stop) => finalizers.push(stop) })
  const notices = (prefix = "todo.needs-you.") =>
    [...store.collections.toasts.values()].filter((toast) => toast.key.startsWith(prefix))
  return { store, seam, notices, launches: box.launches, router, route,
    close: () => { disposed = true; for (const stop of finalizers) stop() } }
}

test("the declared repository policy changes who is told, through the real workflow gateway path", async () => {
  const h = await harness({ kind: "declared", decision: { recipients: ["maya"] } })
  try {
    await h.seam.applyTodoProjection(12, onBranch)
    await waitFor(() => h.launches.length === 1)
    expect(h.launches[0]).toMatchObject({ flowId: "who-is-told" })
    const request = h.launches[0]!.input as NotificationPolicyRequest
    // Identity only: no title, prompt or body of the work crosses into the policy run.
    expect(Object.keys(request).sort()).toEqual(["candidates", "defaults", "event", "owner", "repo"])
    expect(request.owner).toBe("maya")
    expect(request.candidates).toEqual(["maya", "ben"])
    expect(request.event).toEqual({ kind: "needs_you", entryId: "todo.needs-you.12.wait-question-1", todo: 12 })
    await settle()
    // Maya alone is told; Ben is on the branch and the built-in default would have told him.
    expect(h.notices()).toEqual([])
  } finally { h.close() }
})

test("a policy naming a person without access withholds that recipient and never grants it", async () => {
  const h = await harness({ kind: "declared", decision: { recipients: ["mallory", "ben"] } })
  try {
    const outcome = await h.router.route({ kind: "failed", entryId: "todo.failed.12", todo: 12 },
      { owner: "maya", candidates: ["maya", "ben"], defaults: ["maya"] }, () => true)
    expect(outcome.recipients).toEqual(["ben"])
    expect(outcome.withheld).toEqual(["mallory"])
    expect(outcome.stamp).toEqual({ source: "policy", withheld: 1 })
  } finally { h.close() }
})

test("a failed policy run falls back to the default, records why, and still delivers", async () => {
  const h = await harness({ kind: "declared", status: "failed" })
  try {
    await h.seam.applyTodoProjection(12, onBranch)
    await waitFor(() => h.notices().length === 1)
    expect(h.notices()[0]).toMatchObject({ audience: { member: "ben",
      policy: { source: "default", reason: "policy-failed" } } })
  } finally { h.close() }
})

test("a malformed decision falls back to the default and says the answer was not a decision", async () => {
  const h = await harness({ kind: "declared", output: JSON.stringify({ recipients: ["ben"], note: "ghp_secret" }) })
  try {
    const outcome = await h.route({ kind: "merged", entryId: "todo.merged.12", todo: 12 })
    expect(outcome.recipients).toEqual(["maya", "ben"])
    expect(outcome.stamp).toEqual({ source: "default", reason: "policy-malformed" })
  } finally { h.close() }
})

test("an unreadable declaration and an ambiguous one both keep the default and name the refusal", async () => {
  for (const [answer, reason] of [[{ kind: "unreadable" } as const, "policy-unavailable"],
    [{ kind: "ambiguous" } as const, "policy-ambiguous"]] as const) {
    const h = await harness(answer)
    try {
      const outcome = await h.route({ kind: "in_review", entryId: "todo.in_review.12", todo: 12 })
      expect(outcome.recipients).toEqual(["maya", "ben"])
      expect(outcome.stamp).toEqual({ source: "default", reason })
      expect(h.launches).toEqual([])
    } finally { h.close() }
  }
})

test("no declared policy keeps the built-in default, unstamped, and starts no run", async () => {
  const h = await harness({ kind: "none" })
  try {
    await h.seam.applyTodoProjection(12, onBranch)
    await waitFor(() => h.notices().length === 1)
    expect(h.notices()[0]!.audience?.policy).toBeUndefined()
    expect(h.launches).toEqual([])
  } finally { h.close() }
})

test("a policy answer that arrives after the account changed delivers nothing", async () => {
  const h = await harness({ kind: "declared", decision: { recipients: ["ben"] } })
  try {
    let current = true
    const answer = h.route({ kind: "needs_you", entryId: "todo.needs-you.12.late", todo: 12 }, () => current)
    current = false
    const outcome = await answer
    expect(outcome.recipients).toEqual([])
    expect(outcome.stamp).toEqual({ source: "default", reason: "policy-superseded" })
  } finally { h.close() }
})

test("a retired account's late policy answer is never delivered or persisted on its event", async () => {
  const h = await harness({ kind: "declared", decision: { recipients: ["ben"] } })
  try {
    await h.seam.applyTodoProjection(12, onBranch)
    await waitFor(() => h.launches.length === 1)
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "dana",
      provider: "github", admin: false, scopesPlain: null }).isPersisted.promise
    await settle()
    await settle()
    expect([...h.store.collections.toasts.values()].filter((toast) => toast.audience?.member === "ben")).toEqual([])
  } finally { h.close() }
})

test("a review the default keeps to its owner reaches a branch reader when the policy says so", async () => {
  // The owner-only kinds are the ones §6.4 keeps narrowest, so this is where a
  // repository taking the decision is most visible.
  const told = await harness({ kind: "declared", decision: { recipients: ["ben"] } })
  try {
    await told.seam.applyTodoProjection(12, working)
    await told.seam.applyTodoProjection(12, reviewing)
    await waitFor(() => told.notices("todo.in_review.").length === 1)
    expect(told.notices("todo.in_review.")[0]).toMatchObject({ audience: { member: "ben", kind: "in_review",
      policy: { source: "policy" } } })
  } finally { told.close() }
  const quiet = await harness({ kind: "declared", decision: { recipients: ["maya"] } })
  try {
    await quiet.seam.applyTodoProjection(12, working)
    await quiet.seam.applyTodoProjection(12, reviewing)
    await waitFor(() => quiet.launches.length === 1)
    await settle()
    expect(quiet.notices("todo.in_review.")).toEqual([])
  } finally { quiet.close() }
})

test("the decision is bounded typed ids in the app's own order, and nothing else", async () => {
  const h = await harness({ kind: "declared" })
  try {
    // The app's order, not the policy's: a decision cannot reorder a stack.
    const reordered = notificationPolicyResult(
      { repo: REPO, event: { kind: "failed", entryId: "e" }, owner: "maya", candidates: ["maya", "ben"], defaults: ["maya"] },
      { recipients: ["ben", "maya"] })
    expect(reordered.recipients).toEqual(["maya", "ben"])
    // A plain built-in default records nothing, so no existing notice changes.
    expect(notificationPolicyRecord(notificationPolicyDefault(
      { repo: REPO, event: { kind: "failed", entryId: "e" }, owner: "maya", candidates: ["maya"], defaults: ["maya"] }
    ))).toBeUndefined()
    // Over the bound, and a recipient that is not a login, are not decisions.
    for (const broken of [
      { recipients: Array.from({ length: 51 }, (_, index) => `member${index}`) },
      { recipients: ["not a login"] },
      { recipients: "ben" },
      "ben"
    ]) {
      expect(NotificationPolicyDecisionSchema.safeParse(broken).success).toBe(false)
    }
    expect(h.launches).toEqual([])
  } finally { h.close() }
})
