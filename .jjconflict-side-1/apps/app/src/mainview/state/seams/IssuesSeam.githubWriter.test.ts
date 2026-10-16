import { expect, test } from "bun:test"
import { createAppController } from "../AppController"
import type { Card } from "../AppState"
import { createAppStore } from "../AppStore"
import { memoryStorage, signupProfileFetch, silentAgent } from "../TestFixtures"
import { installFixture } from "./InstallFixtures.test-support"

/*
 * The install's ordinary GitHub issue workflow (#4030 / M-47): create,
 * comment, edit, close and reopen leave for the install's OWN doors — the
 * canonical durable writer in services/install_issue_comment.go — and never
 * for the Smithers Cloud tracker at the same number.
 *
 * Before this, every one of these acts addressed /api/repos/{o}/{r}/issues:
 * a close from a GitHub card changed (or 404ed on) a DIFFERENT issue, and
 * /issues.create answered with a Cloud number as though GitHub had given it.
 * Root read back "#6" on 2026-10-15 while that repository's GitHub #6 was an
 * unrelated closed auto-PR test.
 *
 * The assertions are the requests that did and did not leave, with the
 * idempotency key each carried: no live GitHub write happens here.
 */
const REPO = "local-owner/demo"

const githubIssue = (number: number, state = "open") => ({
  number, title: `Upstream bug ${number}`, body: "Seen on main.", state,
  html_url: `https://github.com/${REPO}/issues/${number}`, user: { login: "octo" },
  labels: [], assignees: [], comments: 1, created_at: "2026-10-05T09:00:00Z", updated_at: "2026-10-05T10:00:00Z"
})

type Sent = { readonly method: string; readonly path: string; readonly key: string | null; readonly body: unknown }

/** An install's app, recording every non-GET request with its idempotency key. */
const installApp = async (answers: Record<string, Response | (() => Response)> = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "alice", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: REPO, org: "local-owner", ownerKind: "user", name: "demo", head: null }] }).isPersisted.promise
  const install = { ...installFixture(), repository: { owner: "local-owner", name: "demo" }, repositories: [REPO] }
  const sent: Sent[] = []
  const controller = createAppController(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", authFlow: "redirect", sandbox: null, capabilities: ["identity", "install"] },
    fetchImpl: signupProfileFetch(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "https://app.test")
      const method = init?.method ?? "GET"
      const key = new Headers(init?.headers).get("Idempotency-Key")
      if (method !== "GET") sent.push({ method, path: url.pathname, key, body: typeof init?.body === "string" ? JSON.parse(init.body) : null })
      const answer = answers[`${method} ${url.pathname}`]
      if (answer !== undefined) return typeof answer === "function" ? answer() : answer.clone()
      if (url.pathname === "/api/install") return Response.json(install)
      if (url.pathname === "/api/issues") return Response.json([githubIssue(6)])
      if (url.pathname === "/api/issues/6") return Response.json({ issue: githubIssue(6), comments: [{ id: 5, body: "Keep it short.", user: { login: "smithers[bot]" }, created_at: "2026-10-05T11:00:00Z" }] })
      return new Response("", { status: 404 })
    }).fetchImpl
  })
  return { store, controller, sent }
}

const accepted = () => Response.json({ kind: "requested", operationId: "op-1", state: "accepted" }, { status: 202 })

/** The one issue card the read mounted, wherever the pane put it. */
const issueCard = (store: Awaited<ReturnType<typeof installApp>>["store"]): Extract<Card, { kind: "issue" }> => {
  const card = [...store.collections.cards.values()].find((row) => row.kind === "issue")
  if (card?.kind !== "issue") throw new Error("Expected an issue card")
  return card
}

test("a close on an install leaves for its own GitHub door, never the Cloud tracker", async () => {
  const { controller, sent } = await installApp({ "POST /api/issues/6/close": accepted })
  const outcome = await controller.runCommandForResult("issues.close", `6 ${REPO}`)
  expect(outcome).toMatchObject({ status: "executed" })
  expect(outcome.status === "executed" && outcome.value).toContain("requested")
  expect(sent.map(row => [row.method, row.path])).toEqual([["POST", "/api/issues/6/close"]])
  expect(sent[0]!.key).toBeTruthy()
  // Nothing claims GitHub closed it: the admission is acknowledged, not the write.
  expect(outcome.status === "executed" && outcome.value).not.toContain("is now closed")
})

test("a reopen is its own door, so a close can never arrive as a reopen", async () => {
  const { controller, sent } = await installApp({ "POST /api/issues/6/reopen": accepted })
  expect(await controller.runCommandForResult("issues.reopen", `6 ${REPO}`)).toMatchObject({ status: "executed" })
  expect(sent.map(row => row.path)).toEqual(["/api/issues/6/reopen"])
})

test("repeating the same act replays one operation; a different act is its own", async () => {
  const { controller, sent } = await installApp({ "POST /api/issues/6/close": accepted, "POST /api/issues/6/reopen": accepted })
  await controller.runCommandForResult("issues.close", `6 ${REPO}`)
  await controller.runCommandForResult("issues.close", `6 ${REPO}`)
  await controller.runCommandForResult("issues.reopen", `6 ${REPO}`)
  expect(sent).toHaveLength(3)
  expect(sent[0]!.key).toBe(sent[1]!.key)
  expect(sent[2]!.key).not.toBe(sent[0]!.key)
})

test("a comment on an install posts to its own GitHub comment door", async () => {
  const { controller, sent } = await installApp({ "POST /api/issues/6/comments": accepted })
  const outcome = await controller.runCommandForResult("issues.comment", `6 please look ${REPO}`)
  expect(outcome).toMatchObject({ status: "executed" })
  expect(sent).toEqual([{ method: "POST", path: "/api/issues/6/comments", key: sent[0]!.key, body: { body: "please look" } }])
  // The same comment twice is one operation; a different text is its own.
  await controller.runCommandForResult("issues.comment", `6 please look ${REPO}`)
  await controller.runCommandForResult("issues.comment", `6 and again ${REPO}`)
  expect(sent[1]!.key).toBe(sent[0]!.key)
  expect(sent[2]!.key).not.toBe(sent[0]!.key)
})

test("/issue.comment on an install writes GitHub instead of refusing", async () => {
  const { controller, sent } = await installApp({ "POST /api/issues/6/comments": accepted })
  expect(await controller.runCommandForResult("issue.comment", "#6 please look")).toMatchObject({ status: "executed" })
  expect(sent.map(row => row.path)).toEqual(["/api/issues/6/comments"])
})

test("an edit of a GitHub comment goes to the comment's own door, by its recorded id", async () => {
  const { store, controller, sent } = await installApp({ "PATCH /api/issues/comments/5": accepted })
  expect(await controller.runCommandForResult("issue", "#6")).toMatchObject({ status: "executed" })
  expect(issueCard(store).payload.comments[0]!.id).toBe(5)
  const outcome = await controller.editIssueComment(6, 5, "Shorter still", REPO)
  expect(typeof outcome === "object" && outcome !== null && "value" in outcome && outcome.value).toContain("requested")
  expect(sent).toEqual([{ method: "PATCH", path: "/api/issues/comments/5", key: sent[0]!.key, body: { body: "Shorter still" } }])
})

test("GitHub keeps its comments: a delete is refused and sends nothing", async () => {
  const { controller, sent } = await installApp()
  expect(await controller.runCommandForResult("issue", "#6")).toMatchObject({ status: "executed" })
  expect(await controller.deleteIssueComment(6, 5, REPO)).toContain("GitHub keeps its comments")
  expect(sent).toEqual([])
})

test("fixed and verified are Smithers Cloud stages and are never sent as a GitHub close", async () => {
  const { controller, sent } = await installApp({ "POST /api/issues/6/close": accepted })
  for (const stage of ["fixed", "verified"] as const) {
    const answer = await controller.setIssueState(6, stage, REPO)
    expect(typeof answer === "string" && answer).toContain("Smithers Cloud stage")
  }
  expect(sent).toEqual([])
})

test("a server failure is the server's own sentence, with no route or origin in it", async () => {
  const { controller } = await installApp({
    "POST /api/issues/6/close": () => Response.json({ code: "github_unavailable", class: "infra", message: "Could not reach GitHub" }, { status: 503 })
  })
  const outcome = await controller.runCommandForResult("issues.close", `6 ${REPO}`)
  expect(outcome.status).toBe("failed")
  const error = outcome.status === "failed" ? outcome.error : ""
  // The act, its subject and the status — and no route, origin or writer.
  expect(error).toContain("Could not close issue #6 in local-owner/demo (503)")
  for (const leak of ["/api/", "install_issue", "github-repos", "Worker", "writer", "operationId"]) expect(error).not.toContain(leak)
})

test("a close whose reply never arrives keeps its key, so asking again resumes one operation", async () => {
  let fail = true
  const { controller, sent } = await installApp({
    "POST /api/issues/6/close": () => { if (fail) throw new Error("socket closed"); return Response.json({ kind: "requested", operationId: "op-1" }, { status: 202 }) }
  })
  const unknown = await controller.runCommandForResult("issues.close", `6 ${REPO}`)
  expect(unknown.status).toBe("failed")
  expect(unknown.status === "failed" && unknown.error).toContain("status unknown")
  fail = false
  expect(await controller.runCommandForResult("issues.close", `6 ${REPO}`)).toMatchObject({ status: "executed" })
  expect(sent).toHaveLength(2)
  expect(sent[1]!.key).toBe(sent[0]!.key)
})

test("issues.create on an install opens a GitHub issue through the durable create", async () => {
  const { controller, sent } = await installApp({
    "POST /api/issues": () => Response.json({ kind: "requested", operationId: "op-create" }, { status: 202 }),
    "GET /api/issues/requests/op-create": () => Response.json({ state: "accepted" })
  })
  const outcome = await controller.runCommandForResult("issues.create", `Upstream regression ${REPO}`)
  expect(outcome).toMatchObject({ status: "executed" })
  expect(sent.map(row => [row.method, row.path])).toEqual([["POST", "/api/issues"]])
  expect(sent[0]!.body).toEqual({ title: "Upstream regression", body: "" })
  // No Cloud issue is invented in its place, and no Cloud number is read back.
  expect(outcome.status === "executed" && outcome.value).not.toContain("#")
})
