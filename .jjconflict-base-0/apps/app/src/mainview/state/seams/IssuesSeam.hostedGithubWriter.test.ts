import type { StorageApi } from "@tanstack/db"
import { describe, expect, test } from "bun:test"

import { createAppController } from "../AppController"
import type { AppServices } from "../AppController"
import type { Card } from "../AppState"
import { createAppStore } from "../AppStore"
import { silentAgent } from "../TestFixtures"

/*
 * The hosted (multitenant) origin's ordinary GitHub issue workflow (#4030).
 *
 * The install wrote its one bound repository's GitHub issues through the
 * canonical durable writer; a hosted origin had NO writer at all, so every
 * GitHub-source act there answered one sentence and sent nothing. The acts now
 * address the repository itself, under the repo-scoped GitHub family
 * `/api/repos/{owner}/{repo}/github/issues…`, which is a DIFFERENT tracker
 * from `/api/repos/{owner}/{repo}/issues` beside it.
 *
 * The assertions are the requests that did and did not leave, and the key each
 * carried. No live GitHub write happens here: the acts reach stubbed routes.
 */

const REPO = "will/flows"

const memoryStorage = (): StorageApi => {
  const data = new Map<string, string>()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) }
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const accepted = (): Response =>
  json(202, { operationId: "op-1", requestId: "k", kind: "requested", state: "accepted", acceptedAt: "2026-10-16T13:00:00Z" })

type Answer = Response | (() => Response | Promise<Response>)
type Sent = { readonly method: string; readonly path: string; readonly key: string | null; readonly body: unknown }

const githubIssue = (number: number, state = "open") => ({
  number, title: `Upstream bug ${number}`, body: "Seen on main.", state,
  html_url: `https://github.com/${REPO}/issues/${number}`, user: { login: "octo" },
  labels: [], assignees: [], comments: 1,
  created_at: "2026-10-05T09:00:00Z", updated_at: "2026-10-05T10:00:00Z"
})

const githubComment = (id: number) => ({
  id, body: "Keep it short.", user: { login: "smithers[bot]" }, created_at: "2026-10-05T11:00:00Z"
})

/*
 * A hosted app: a Smithers Cloud session with no install capability, one
 * repository, and the repository's GitHub-source issue reads answered. Every
 * non-GET request is recorded with the idempotency key it carried.
 */
const hostedApp = async (answers: Record<string, Answer> = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: REPO, org: "will", ownerKind: "user", name: "flows", head: null }] }).isPersisted.promise
  const sent: Sent[] = []
  const services: AppServices = {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", authFlow: "redirect", sandbox: null, capabilities: ["identity", "cloud", "github"] },
    fetchImpl: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "https://app.test")
      const method = (init?.method ?? "GET").toUpperCase()
      const key = new Headers(init?.headers).get("Idempotency-Key")
      if (method !== "GET") sent.push({ method, path: url.pathname, key, body: typeof init?.body === "string" ? JSON.parse(init.body) : null })
      const answer = answers[`${method} ${url.pathname}`]
      if (answer !== undefined) return typeof answer === "function" ? await answer() : answer.clone()
      if (url.pathname === `/api/user/github-repos/${REPO}/issues`) return json(200, [githubIssue(6)])
      if (url.pathname === `/api/user/github-repos/${REPO}/issues/6/comments`) return json(200, [githubComment(5)])
      return json(404, { status: "error", code: "not_found", message: "not found" })
    }
  }
  const controller = createAppController(store, silentAgent, services)
  return { store, controller, sent }
}

/** The one GitHub-source issue card the read mounted. */
const githubCard = (store: Awaited<ReturnType<typeof hostedApp>>["store"]): Extract<Card, { kind: "issue" }> => {
  const card = [...store.collections.cards.values()].find((row) => row.kind === "issue" && row.payload.source === "github")
  if (card?.kind !== "issue") throw new Error("Expected a GitHub-source issue card")
  return card
}

/** Open the GitHub-source card for #6 so later acts read their source off it. */
const viewGitHubSix = async (controller: Awaited<ReturnType<typeof hostedApp>>["controller"]) => {
  const viewed = await controller.runCommandForResult("issues.view", `6 ${REPO} --source github`)
  expect(viewed).toMatchObject({ status: "executed" })
}

describe("a hosted origin writes the repository's own GitHub tracker", () => {
  test("a close leaves for the repo-scoped GitHub door and acknowledges the admission only", async () => {
    const { controller, sent } = await hostedApp({ [`POST /api/repos/${REPO}/github/issues/6/close`]: accepted })
    await viewGitHubSix(controller)
    const outcome = await controller.runCommandForResult("issues.close", `6 ${REPO}`)
    expect(outcome).toMatchObject({ status: "executed" })
    expect(outcome.status === "executed" && outcome.value).toContain("requested")
    // Nothing claims GitHub closed it: the write has not happened yet.
    expect(outcome.status === "executed" && outcome.value).not.toContain("is now closed")
    expect(sent.map((row) => [row.method, row.path])).toEqual([["POST", `/api/repos/${REPO}/github/issues/6/close`]])
    expect(sent[0]!.key).toBeTruthy()
  })

  test("a reopen is its own door, so a close can never arrive as a reopen", async () => {
    const { controller, sent } = await hostedApp({ [`POST /api/repos/${REPO}/github/issues/6/reopen`]: accepted })
    await viewGitHubSix(controller)
    expect(await controller.runCommandForResult("issues.reopen", `6 ${REPO}`)).toMatchObject({ status: "executed" })
    expect(sent.map((row) => row.path)).toEqual([`/api/repos/${REPO}/github/issues/6/reopen`])
  })

  test("repeating the same act replays one operation; a different act is its own", async () => {
    const { controller, sent } = await hostedApp({
      [`POST /api/repos/${REPO}/github/issues/6/close`]: accepted,
      [`POST /api/repos/${REPO}/github/issues/6/reopen`]: accepted
    })
    await viewGitHubSix(controller)
    await controller.runCommandForResult("issues.close", `6 ${REPO}`)
    await controller.runCommandForResult("issues.close", `6 ${REPO}`)
    await controller.runCommandForResult("issues.reopen", `6 ${REPO}`)
    expect(sent).toHaveLength(3)
    expect(sent[0]!.key).toBe(sent[1]!.key)
    expect(sent[2]!.key).not.toBe(sent[0]!.key)
  })

  test("a comment posts to the repo-scoped GitHub comment door", async () => {
    const { controller, sent } = await hostedApp({ [`POST /api/repos/${REPO}/github/issues/6/comments`]: accepted })
    await viewGitHubSix(controller)
    expect(await controller.runCommandForResult("issues.comment", `6 please look ${REPO}`)).toMatchObject({ status: "executed" })
    expect(sent).toEqual([{ method: "POST", path: `/api/repos/${REPO}/github/issues/6/comments`, key: sent[0]!.key, body: { body: "please look" } }])
  })

  test("an edit of a GitHub comment goes to the comment's own door, by its recorded id", async () => {
    const { store, controller, sent } = await hostedApp({ [`PATCH /api/repos/${REPO}/github/issues/comments/5`]: accepted })
    await viewGitHubSix(controller)
    expect(githubCard(store).payload.comments[0]!.id).toBe(5)
    const outcome = await controller.editIssueComment(6, 5, "Shorter still", REPO)
    expect(typeof outcome === "object" && outcome !== null && "value" in outcome && outcome.value).toContain("requested")
    expect(sent).toEqual([{ method: "PATCH", path: `/api/repos/${REPO}/github/issues/comments/5`, key: sent[0]!.key, body: { body: "Shorter still" } }])
  })

  test("GitHub keeps its comments: a delete is refused and sends nothing", async () => {
    const { controller, sent } = await hostedApp()
    await viewGitHubSix(controller)
    expect(await controller.deleteIssueComment(6, 5, REPO)).toContain("GitHub keeps its comments")
    expect(sent).toEqual([])
  })

  test("fixed and verified are Smithers Cloud stages and are never sent as a GitHub close", async () => {
    const { controller, sent } = await hostedApp({ [`POST /api/repos/${REPO}/github/issues/6/close`]: accepted })
    await viewGitHubSix(controller)
    for (const stage of ["fixed", "verified"] as const) {
      const answer = await controller.setIssueState(6, stage, REPO)
      expect(typeof answer === "string" && answer).toContain("Smithers Cloud stage")
    }
    expect(sent).toEqual([])
  })

  test("a server failure is the server's own sentence, with no route or origin in it", async () => {
    const { controller } = await hostedApp({
      [`POST /api/repos/${REPO}/github/issues/6/close`]: () =>
        json(403, { code: "permission", class: "permission", message: "Write access to this repository is required" })
    })
    await viewGitHubSix(controller)
    const outcome = await controller.runCommandForResult("issues.close", `6 ${REPO}`)
    expect(outcome.status).toBe("failed")
    const error = outcome.status === "failed" ? outcome.error : ""
    expect(error).toContain("Write access to this repository is required")
    for (const leak of ["/api/", "install_issue", "github-repos", "Worker", "writer", "operationId"]) expect(error).not.toContain(leak)
  })

  test("a close whose reply never arrives keeps its key, so asking again resumes one operation", async () => {
    let fail = true
    const { controller, sent } = await hostedApp({
      [`POST /api/repos/${REPO}/github/issues/6/close`]: () => {
        if (fail) throw new Error("socket closed")
        return accepted()
      }
    })
    await viewGitHubSix(controller)
    const unknown = await controller.runCommandForResult("issues.close", `6 ${REPO}`)
    expect(unknown.status).toBe("failed")
    expect(unknown.status === "failed" && unknown.error).toContain("status unknown")
    fail = false
    expect(await controller.runCommandForResult("issues.close", `6 ${REPO}`)).toMatchObject({ status: "executed" })
    expect(sent).toHaveLength(2)
    expect(sent[1]!.key).toBe(sent[0]!.key)
  })

  test("a private conversation is never addressed as a GitHub issue, whatever a command asks", async () => {
    const { controller, sent } = await hostedApp({
      [`GET /api/repos/${REPO}/issues/9`]: json(200, {
        id: 900, number: 9, kind: "chat", visibility: "private", title: "Chat", body: "Private.", state: "open",
        labels: [], assignees: [], author: { id: 3, login: "ana" }, milestone_id: null, comment_count: 0,
        created_at: "2026-08-10T09:00:00Z", updated_at: "2026-08-11T09:00:00Z", closed_at: null
      }),
      [`GET /api/repos/${REPO}/issues/9/comments`]: json(200, []),
      [`POST /api/repos/${REPO}/github/issues/9/comments`]: accepted
    })
    expect(await controller.runCommandForResult("issues.view", `9 ${REPO}`)).toMatchObject({ status: "executed" })
    const outcome = await controller.runCommandForResult("issues.comment", "9 secret plan --source github")
    expect(outcome.status).toBe("failed")
    expect(outcome.status === "failed" && outcome.error).toContain("private conversation")
    expect(sent).toEqual([])
  })
})
