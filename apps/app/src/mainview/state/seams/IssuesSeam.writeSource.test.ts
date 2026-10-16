import type { StorageApi } from "@tanstack/db"
import { describe, expect, test } from "bun:test"

import type { AgentPort } from "../../runtime/AgentPort"
import { createAppController } from "../AppController"
import type { AppServices } from "../AppController"
import type { Card } from "../AppState"
import { createAppStore } from "../AppStore"
import { flowArgs } from "../../flows/FlowArgs"
import { payloadFor } from "../../flows/SlashPayload"
import { stateActions } from "../../cards/IssueThread"
import type { CommandOutcome } from "../../flows/Commands"

/*
 * Which tracker an issue WRITE addresses (#4022).
 *
 * A connected GitHub repository carries its own GitHub issues beside the
 * Smithers Cloud tracker's, and the two number independently: `#6` names two
 * different objects. Every write used to address `/api/repos/{o}/{r}/issues`
 * unconditionally, so closing or commenting from a GitHub-source card changed
 * — or 404ed on — the same-numbered Cloud row, and `/issues.create` reported a
 * Cloud number as if it were GitHub's canonical one. That is exactly how a
 * Cloud-only write passed for GitHub proof on 2026-10-15: `/issues.create`
 * read back "#6" while `roninjin10/e2e-verify#6` upstream was an unrelated
 * closed auto-PR test.
 *
 * These drive the real command path against stubbed HTTP routes and assert on
 * the requests that did and did not leave: no live GitHub write happens here.
 */

const memoryStorage = (): StorageApi => {
  const data = new Map<string, string>()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) }
}

const unavailableAgent: AgentPort = {
  available: false,
  startTurn: async () => ({ status: "error", message: "unavailable" }),
  cancelTurn: async () => {},
  subscribe: () => () => {}
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

type Answer = Response | ((request: Request) => Response | Promise<Response>)

/** Route stub keyed "METHOD /pathname"; every request is recorded in `calls`. */
const backend = (routes: Record<string, Answer>, calls: string[]): AppServices => ({
  fetchImpl: async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, "https://app.test")
    const method = (init?.method ?? "GET").toUpperCase()
    calls.push(`${method} ${url.pathname}`)
    const answer = routes[`${method} ${url.pathname}`]
    if (answer === undefined) return json(404, { status: "error", code: "not_found", message: "not found" })
    return typeof answer === "function" ? answer(new Request(url.toString(), init)) : answer.clone()
  }
})

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

const controllerFor = async (routes: Record<string, Answer>) => {
  const calls: string[] = []
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, backend(routes, calls))
  store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null })
  store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null }] })
  await settled()
  return { store, controller, calls }
}

/* GitHub's own issue shape off the source read (multi src/smithersCloud/githubIssues.ts). */
const wireGithubIssue = (number: number) => ({
  id: number * 1000, number, title: `Upstream bug ${number}`, body: "Seen on main.", state: "open",
  user: { login: "octo" }, labels: [{ name: "bug", color: "d73a4a" }], assignees: [], comments: 0,
  html_url: `https://github.com/will/flows/issues/${number}`,
  created_at: "2026-08-09T09:00:00Z", updated_at: "2026-08-10T09:00:00Z"
})

/* Plue's issue shape off the Smithers Cloud tracker (multi src/smithersCloud/issues.ts). */
const wireCloudIssue = (number: number, overrides: Record<string, unknown> = {}) => ({
  id: number * 100, number, title: `Cloud row ${number}`, body: "Filed in Smithers.", state: "open",
  labels: [], assignees: [], author: { id: 3, login: "ana" }, milestone_id: null, comment_count: 0,
  created_at: "2026-08-10T09:00:00Z", updated_at: "2026-08-11T09:00:00Z", closed_at: null, ...overrides
})

const GITHUB_LIST = "GET /api/user/github-repos/will/flows/issues"
const GITHUB_COMMENTS = "GET /api/user/github-repos/will/flows/issues/6/comments"
const CLOUD_ISSUE = "GET /api/repos/will/flows/issues/6"
const CLOUD_COMMENTS = "GET /api/repos/will/flows/issues/6/comments"

/** The GitHub-source routes that mount `issue-github-will/flows-6`. */
const githubSixRoutes = (): Record<string, Answer> => ({
  [GITHUB_LIST]: json(200, [wireGithubIssue(6)]),
  [GITHUB_COMMENTS]: json(200, [])
})

/** The Cloud-tracker routes that mount `issue-will/flows-6`. */
const cloudSixRoutes = (): Record<string, Answer> => ({
  [CLOUD_ISSUE]: json(200, wireCloudIssue(6)),
  [CLOUD_COMMENTS]: json(200, [])
})

const issueCard = (store: Awaited<ReturnType<typeof controllerFor>>["store"], id: string): Extract<Card, { kind: "issue" }> => {
  const card = store.collections.cards.get(id)
  if (card?.kind !== "issue") throw new Error(`Expected issue card ${id}, got ${card?.kind ?? "nothing"}`)
  return card
}

/** The refusal a door answered; anything else is the test's own failure. */
const refusal = (outcome: CommandOutcome): string => {
  if (outcome.status !== "failed") throw new Error(`Expected a refusal, got ${outcome.status}`)
  return outcome.error
}

/** The value a door answered. */
const answer = (outcome: CommandOutcome): string => {
  if (outcome.status !== "executed") throw new Error(`Expected an answer, got ${outcome.status}`)
  return outcome.value ?? ""
}

/** Every write request that left, as "METHOD /pathname". */
const writes = (calls: ReadonlyArray<string>): ReadonlyArray<string> =>
  calls.filter((call) => !call.startsWith("GET "))

describe("issue writes resolve their tracker", () => {
  test("a GitHub-source card's close never reaches the Smithers Cloud row of the same number", async () => {
    const patched: Array<unknown> = []
    const { store, controller, calls } = await controllerFor({
      ...githubSixRoutes(),
      ...cloudSixRoutes(),
      "PATCH /api/repos/will/flows/issues/6": async (request) => { patched.push(await request.json()); return json(200, wireCloudIssue(6, { state: "closed" })) }
    })
    expect((await controller.commands.run("issues.view", "6 will/flows --source github")).status).toBe("executed")
    expect(issueCard(store, "issue-github-will/flows-6").payload.source).toBe("github")

    const outcome = await controller.commands.run("issues.close", "6")
    expect(outcome.status).toBe("failed")
    expect(refusal(outcome)).toContain("GitHub issue in will/flows")
    expect(refusal(outcome)).toContain("nothing was sent")
    // The Cloud row is a DIFFERENT issue: no write may reach it.
    expect(patched).toEqual([])
    expect(writes(calls)).toEqual([])
    // And the GitHub card still reads open: nothing was refreshed from the wrong source.
    expect(issueCard(store, "issue-github-will/flows-6").payload.state).toBe("open")
  })

  test("a GitHub-source card's comment never posts to the Smithers Cloud row of the same number", async () => {
    const posted: Array<unknown> = []
    const { controller, calls } = await controllerFor({
      ...githubSixRoutes(),
      "POST /api/repos/will/flows/issues/6/comments": async (request) => { posted.push(await request.json()); return json(201, { id: 31 }) }
    })
    expect((await controller.commands.run("issues.view", "6 will/flows --source github")).status).toBe("executed")

    const outcome = await controller.commands.run("issues.comment", "6 please look")
    expect(outcome.status).toBe("failed")
    expect(refusal(outcome)).toContain("GitHub issue in will/flows")
    expect(posted).toEqual([])
    expect(writes(calls)).toEqual([])
  })

  test("--source smithers-cloud still writes the Cloud row while a GitHub card of the same number is open", async () => {
    const patched: Array<unknown> = []
    const { store, controller } = await controllerFor({
      ...githubSixRoutes(),
      ...cloudSixRoutes(),
      "PATCH /api/repos/will/flows/issues/6": async (request) => { patched.push(await request.json()); return json(200, wireCloudIssue(6, { state: "closed" })) }
    })
    const viewed = await controller.commands.run("issues.view", "6 will/flows --source github")
    expect(viewed.status).toBe("executed")
    expect(answer(viewed)).toContain("will/flows · GitHub #6")

    // The explicit choice is honoured: this is the Cloud row, not GitHub's.
    expect((await controller.commands.run("issues.close", "6 will/flows --source smithers-cloud")).status).toBe("executed")
    expect(patched).toEqual([{ state: "closed" }])
    /*
     * One pane holds one surface, so the Cloud read replaces the GitHub one
     * in place (PreparedView paneTarget). What must never happen is the
     * GitHub row's title or state surviving a write that never touched it.
     */
    const open = [...store.collections.cards.values()].filter((card) => card.kind === "issue")
    expect(open.length).toBe(1)
    expect(open[0]).toMatchObject({ title: "Issue #6 · will/flows" })
    expect(issueCard(store, open[0]!.id).payload.source).toBeUndefined()
    expect(issueCard(store, open[0]!.id).payload.title).toBe("Cloud row 6")
  })

  test("the Cloud row stays the target when its own card is open beside the GitHub one", async () => {
    const patched: Array<unknown> = []
    const { controller } = await controllerFor({
      ...githubSixRoutes(),
      ...cloudSixRoutes(),
      "PATCH /api/repos/will/flows/issues/6": async (request) => { patched.push(await request.json()); return json(200, wireCloudIssue(6, { state: "closed" })) }
    })
    expect((await controller.commands.run("issues.view", "6 will/flows --source github")).status).toBe("executed")
    expect((await controller.commands.run("issues.view", "6 will/flows")).status).toBe("executed")

    // A Cloud row the person has open exists, so a bare close is its act.
    expect((await controller.commands.run("issues.close", "6")).status).toBe("executed")
    expect(patched).toEqual([{ state: "closed" }])
  })

  test("a private conversation is never addressed as a GitHub issue", async () => {
    const posted: Array<unknown> = []
    const { store, controller, calls } = await controllerFor({
      "GET /api/repos/will/flows/issues/9": json(200, wireCloudIssue(9, { kind: "chat", visibility: "private", title: "Chat" })),
      "GET /api/repos/will/flows/issues/9/comments": json(200, []),
      "POST /api/repos/will/flows/issues/9/comments": async (request) => { posted.push(await request.json()); return json(201, { id: 41 }) }
    })
    expect((await controller.commands.run("issues.view", "9 will/flows")).status).toBe("executed")
    expect(issueCard(store, "issue-will/flows-9").payload.kind).toBe("chat")

    const outcome = await controller.commands.run("issues.comment", "9 secret plan --source github")
    expect(outcome.status).toBe("failed")
    expect(refusal(outcome)).toContain("private conversation")
    expect(refusal(outcome)).toContain("never posted to GitHub")
    expect(posted).toEqual([])
    expect(writes(calls)).toEqual([])
  })

  test("issues.create --source github sends nothing and never invents a Cloud issue in its place", async () => {
    const posted: Array<unknown> = []
    const { controller, calls } = await controllerFor({
      "POST /api/repos/will/flows/issues": async (request) => { posted.push(await request.json()); return json(201, { number: 6 }) }
    })
    const outcome = await controller.commands.run("issues.create", "Upstream regression will/flows --source github")
    expect(outcome.status).toBe("failed")
    expect(refusal(outcome)).toContain("would be a GitHub issue in will/flows")
    expect(posted).toEqual([])
    expect(writes(calls)).toEqual([])
  })

  test("a Cloud write names the tracker its number belongs to", async () => {
    const { store, controller } = await controllerFor({
      "POST /api/repos/will/flows/issues": json(201, { number: 6 }),
      ...cloudSixRoutes()
    })
    // The card the create mounts says which tracker holds #6, and so does the
    // value an agent reads back — "will/flows · #6" alone read as GitHub's.
    const created = await controller.commands.run("issues.create", "A brand new idea")
    expect(created.status).toBe("executed")
    const open = [...store.collections.cards.values()].filter((card) => card.kind === "issue")
    expect(open.length).toBe(1)
    const read = await controller.commands.run("issues.view", "6 will/flows")
    expect(answer(read)).toContain("will/flows · Smithers Cloud #6")
    expect(answer(read)).not.toContain("GitHub #6")
  })

  test("a create whose refresh fails still names the tracker it wrote", async () => {
    const { controller } = await controllerFor({
      "POST /api/repos/will/flows/issues": json(201, { number: 6 }),
      "GET /api/repos/will/flows/issues/6": json(500, { status: "error", message: "unavailable" })
    })
    const outcome = await controller.commands.run("issues.create", "A brand new idea")
    expect(outcome.status).toBe("failed")
    expect(refusal(outcome)).toContain("Issue #6 was created in will/flows's Smithers Cloud tracker")
  })

  test("a GitHub-source card's state buttons carry their source through the command line", () => {
    const card: Extract<Card, { kind: "issue" }> = {
      id: "issue-github-will/flows-6", kind: "issue", title: "GitHub issue #6 · will/flows", status: "active",
      createdAt: 0, ordinal: 1,
      payload: { repo: "will/flows", number: 6, source: "github", title: "Upstream bug 6", state: "open", author: "octo", issueBody: "", labels: [], comments: [] }
    }
    expect(stateActions(card).map((act) => act.args)).toEqual(["6 will/flows --source github"])
    expect(payloadFor("issues.close", "6 will/flows --source github")).toEqual({ payload: { number: 6, repo: "will/flows", source: "github" } })
    expect(flowArgs("issues.comment", { number: 6, repo: "will/flows", text: "hi", source: "github" }))
      .toBe(JSON.stringify({ number: 6, repo: "will/flows", text: "hi", source: "github" }))
    expect(payloadFor("issues.comment", JSON.stringify({ number: 6, repo: "will/flows", text: "hi", source: "github" })))
      .toEqual({ payload: { number: 6, repo: "will/flows", text: "hi", source: "github" } })
  })

  /*
   * A host that serves both `install` and `cloud` (compose/bootstrap.go)
   * offers these Cloud doors beside the install's own. The install DOES write
   * its repository's GitHub issues — through its App doors, the durable
   * writer in services/install_issue_comment.go — so the refusal names the
   * door that works instead of claiming no writer exists.
   */
  test("on an install the refusal names the install's own GitHub writer", async () => {
    const calls: string[] = []
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, {
      ...backend({ "GET /api/issues": json(200, []) }, calls),
      bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", authFlow: "redirect", sandbox: null, capabilities: ["identity", "cloud", "install"] }
    })
    store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null })
    store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null }] })
    await settled()

    expect(refusal(await controller.commands.run("issues.comment", "6 please look will/flows"))).toBe("Use /issue.comment on this install.")
    expect(writes(calls)).toEqual([])
  })

  test("an unknown source is refused, never guessed", () => {
    for (const line of ["6 will/flows --source gitlab", "6 will/flows --source GitHub"]) {
      expect(payloadFor("issues.close", line)).toEqual({ error: "Choose GitHub or Smithers Cloud as the issue source" })
    }
  })
})
