import type { StorageApi } from "@tanstack/db"
import { describe, expect, test } from "bun:test"

import type { AgentPort } from "../../runtime/AgentPort"
import { createAppController } from "../AppController"
import type { AppServices } from "../AppController"
import type { Card, CloudRepository } from "../AppState"
import { createAppStore } from "../AppStore"
import { parseRepo } from "./RepositoriesSeam"

/*
 * Which tracker an UNLABELLED issue number addresses (#4030, the remaining
 * half of the hosted GitHub issue workflow).
 *
 * Lane 64 gave the hosted Cloud origin a real GitHub issue writer, but a bare
 * `/issues.close 6` on an imported GitHub repository still meant the Smithers
 * Cloud row, because the app's repository rows carried no source at all
 * (`CloudRepository` was `id|org|ownerKind|name|head|catalog|summary`). The
 * person had to add `--source github` to every act, and a Cloud-only success
 * read as though GitHub had done it.
 *
 * The repository now ANSWERS which tracker its issues live in. The server
 * resolves it from the repository's own GitHub binding — the sync registry's
 * current binding, else the ready import bound to this exact repository
 * (db.ListRepositoryGitHubSources, services/user.go `issueTrackersOf`) — and
 * the inventory carries it as `issue_tracker`. Nothing here guesses from a
 * display name, a number or a summary.
 *
 * Every expectation drives the real command path over stubbed routes and
 * asserts on the requests that did and did not leave. No live GitHub request
 * is made.
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

/** A signed-in controller whose one repository declares `tracker`, or declares none. */
const controllerFor = async (routes: Record<string, Answer>, tracker?: CloudRepository["issueTracker"]) => {
  const calls: string[] = []
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, backend(routes, calls))
  store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null })
  store.dispatch({
    type: "repositories.loaded",
    actor: "system",
    repositories: [{ id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null, ...(tracker === undefined ? {} : { issueTracker: tracker }) }]
  })
  await settled()
  return { store, controller, calls }
}

const wireGithubIssue = (number: number) => ({
  id: number * 1000, number, title: `Upstream bug ${number}`, body: "Seen on main.", state: "open",
  user: { login: "octo" }, labels: [{ name: "bug", color: "d73a4a" }], assignees: [], comments: 0,
  html_url: `https://github.com/will/flows/issues/${number}`,
  created_at: "2026-08-09T09:00:00Z", updated_at: "2026-08-10T09:00:00Z"
})

const wireCloudIssue = (number: number, overrides: Record<string, unknown> = {}) => ({
  id: number * 100, number, title: `Cloud row ${number}`, body: "Filed in Smithers.", state: "open",
  labels: [], assignees: [], author: { id: 3, login: "ana" }, milestone_id: null, comment_count: 0,
  created_at: "2026-08-10T09:00:00Z", updated_at: "2026-08-11T09:00:00Z", closed_at: null, ...overrides
})

const writes = (calls: ReadonlyArray<string>): ReadonlyArray<string> =>
  calls.filter((call) => !call.startsWith("GET "))

const issueCards = (store: Awaited<ReturnType<typeof controllerFor>>["store"]): ReadonlyArray<Extract<Card, { kind: "issue" }>> =>
  [...store.collections.cards.values()].flatMap((card) => card.kind === "issue" ? [card] : [])

describe("the repository answers which tracker an unlabelled issue number means", () => {
  test("an imported GitHub repository's bare close reaches GitHub, and never the Cloud row of the same number", async () => {
    const patched: Array<unknown> = []
    const closed: Array<string> = []
    const { controller, calls } = await controllerFor({
      "GET /api/repos/will/flows/issues/6": json(200, wireCloudIssue(6)),
      "GET /api/repos/will/flows/issues/6/comments": json(200, []),
      "PATCH /api/repos/will/flows/issues/6": async (request) => { patched.push(await request.json()); return json(200, wireCloudIssue(6, { state: "closed" })) },
      "POST /api/repos/will/flows/github/issues/6/close": async (request) => {
        closed.push(request.headers.get("Idempotency-Key") ?? "")
        return json(202, { operationId: "op-close-6", requestId: "k", kind: "requested", state: "accepted", acceptedAt: "2026-10-16T13:00:00Z" })
      }
    }, "github")

    // No `--source github`, no GitHub-source card open: the ordinary act.
    const outcome = await controller.commands.run("issues.close", "6")
    expect(outcome.status).toBe("executed")
    expect(writes(calls)).toEqual(["POST /api/repos/will/flows/github/issues/6/close"])
    expect(patched).toEqual([])
    expect(closed[0]).not.toBe("")
  })

  test("an imported GitHub repository's bare comment reaches GitHub, and never the Cloud row of the same number", async () => {
    const posted: Array<unknown> = []
    const sent: Array<unknown> = []
    const { controller, calls } = await controllerFor({
      "POST /api/repos/will/flows/issues/6/comments": async (request) => { posted.push(await request.json()); return json(201, { id: 31 }) },
      "POST /api/repos/will/flows/github/issues/6/comments": async (request) => {
        sent.push(await request.json())
        return json(202, { operationId: "op-comment-6", requestId: "k", kind: "requested", state: "accepted", acceptedAt: "2026-10-16T13:00:00Z" })
      }
    }, "github")

    expect((await controller.commands.run("issues.comment", "6 please look")).status).toBe("executed")
    expect(sent).toEqual([{ body: "please look" }])
    expect(posted).toEqual([])
    expect(writes(calls)).toEqual(["POST /api/repos/will/flows/github/issues/6/comments"])
  })

  test("an imported GitHub repository's bare view opens GitHub's issue, not the Cloud row of the same number", async () => {
    const { store, controller } = await controllerFor({
      "GET /api/user/github-repos/will/flows/issues": json(200, [wireGithubIssue(6)]),
      "GET /api/user/github-repos/will/flows/issues/6/comments": json(200, []),
      "GET /api/repos/will/flows/issues/6": json(200, wireCloudIssue(6)),
      "GET /api/repos/will/flows/issues/6/comments": json(200, [])
    }, "github")

    expect((await controller.commands.run("issues.view", "6")).status).toBe("executed")
    const open = issueCards(store)
    expect(open.length).toBe(1)
    expect(open[0]!.payload.source).toBe("github")
    expect(open[0]!.payload.title).toBe("Upstream bug 6")
  })

  test("a Cloud-native repository keeps its own tracker", async () => {
    const patched: Array<unknown> = []
    const { controller, calls } = await controllerFor({
      "GET /api/repos/will/flows/issues/6": json(200, wireCloudIssue(6)),
      "GET /api/repos/will/flows/issues/6/comments": json(200, []),
      "PATCH /api/repos/will/flows/issues/6": async (request) => { patched.push(await request.json()); return json(200, wireCloudIssue(6, { state: "closed" })) }
    }, "smithers-cloud")

    expect((await controller.commands.run("issues.close", "6")).status).toBe("executed")
    expect(patched).toEqual([{ state: "closed" }])
    expect(writes(calls)).toEqual(["PATCH /api/repos/will/flows/issues/6"])
  })

  test("a repository whose tracker this server does not answer keeps the Cloud reading it always had", async () => {
    const patched: Array<unknown> = []
    const { controller, calls } = await controllerFor({
      "GET /api/repos/will/flows/issues/6": json(200, wireCloudIssue(6)),
      "GET /api/repos/will/flows/issues/6/comments": json(200, []),
      "PATCH /api/repos/will/flows/issues/6": async (request) => { patched.push(await request.json()); return json(200, wireCloudIssue(6, { state: "closed" })) }
    })

    expect((await controller.commands.run("issues.close", "6")).status).toBe("executed")
    expect(patched).toEqual([{ state: "closed" }])
    expect(writes(calls)).toEqual(["PATCH /api/repos/will/flows/issues/6"])
  })

  test("an explicit --source smithers-cloud still beats the repository's GitHub tracker", async () => {
    const patched: Array<unknown> = []
    const { controller, calls } = await controllerFor({
      "GET /api/repos/will/flows/issues/6": json(200, wireCloudIssue(6)),
      "GET /api/repos/will/flows/issues/6/comments": json(200, []),
      "PATCH /api/repos/will/flows/issues/6": async (request) => { patched.push(await request.json()); return json(200, wireCloudIssue(6, { state: "closed" })) }
    }, "github")

    expect((await controller.commands.run("issues.close", "6 will/flows --source smithers-cloud")).status).toBe("executed")
    expect(patched).toEqual([{ state: "closed" }])
    expect(writes(calls)).toEqual(["PATCH /api/repos/will/flows/issues/6"])
  })

  test("a recorded private conversation stays Cloud-private on an imported GitHub repository", async () => {
    const { store, controller, calls } = await controllerFor({
      "POST /api/repos/will/flows/issues": async (request) => {
        const body = await request.json() as Record<string, unknown>
        return json(201, wireCloudIssue(6, { title: body.title, kind: "chat" }))
      },
      "GET /api/repos/will/flows/issues/6": json(200, wireCloudIssue(6, { kind: "chat" })),
      "GET /api/repos/will/flows/issues/6/comments": json(200, [])
    }, "github")

    // A conversation is never GitHub's, whatever the repository declares.
    expect((await controller.commands.run("issues.create", "standup --kind conversation")).status).toBe("executed")
    const conversation = issueCards(store).find((card) => card.payload.kind === "chat")
    expect(conversation).toBeDefined()
    expect(calls).not.toContain("POST /api/repos/will/flows/github/issues")

    // And asking for it on GitHub is refused, not crossed.
    const refused = await controller.commands.run("issues.comment", "6 ping will/flows --source github")
    expect(refused.status).toBe("failed")
    expect(writes(calls).filter((call) => call.includes("/github/"))).toEqual([])
  })

  test("the tracker is read off the wire only as the closed pair the server states", () => {
    const row = (tracker: unknown) => parseRepo({ full_name: "will/flows", owner: { login: "will" }, name: "flows", default_bookmark: "main", issue_tracker: tracker })
    expect(row("github")?.issueTracker).toBe("github")
    expect(row("smithers-cloud")?.issueTracker).toBe("smithers-cloud")
    // An unfamiliar word, a null and an absent field all mean "not answered".
    expect(row("GitHub")?.issueTracker).toBeUndefined()
    expect(row("linear")?.issueTracker).toBeUndefined()
    expect(row(null)?.issueTracker).toBeUndefined()
    expect(parseRepo({ full_name: "will/flows", owner: { login: "will" }, name: "flows" })?.issueTracker).toBeUndefined()
  })
})

/*
 * Running one of the repository's own declared issue transitions (M-47).
 *
 * The declaration — which labels move, and whether a person has to make the
 * move — lives in the repository's committed `.smithers/factory.json` and is
 * read and enforced on the server. The client therefore sends the
 * transition's ID and nothing else: these cases pin that nothing about the
 * move can be chosen here, that the act reaches the repository's GitHub
 * tracker and never its Smithers Cloud rows, and that one act is said once
 * under its own idempotency key.
 */
describe("a declared issue transition", () => {
  test("sends one keyed act to the repository's own GitHub tracker, with no label or actor in it", async () => {
    const sent: Array<{ readonly path: string; readonly key: string; readonly body: string | null }> = []
    const { controller, calls } = await controllerFor({
      "POST /api/repos/will/flows/github/issues/6/transitions/accept": async (request) => {
        sent.push({ path: new URL(request.url).pathname, key: request.headers.get("Idempotency-Key") ?? "", body: await request.text() || null })
        return json(202, { operationId: "op-accept-6", requestId: "k", kind: "requested", state: "accepted", acceptedAt: "2026-10-16T13:00:00Z" })
      }
    }, "github")

    const outcome = await controller.commands.run("issues.transition", "6 accept")
    expect(outcome.status).toBe("executed")
    expect(sent.length).toBe(1)
    expect(sent[0]!.path).toBe("/api/repos/will/flows/github/issues/6/transitions/accept")
    // No body at all: a request can name neither a label nor an actor.
    expect(sent[0]!.body).toBeNull()
    expect(sent[0]!.key).not.toBe("")
    // And nothing addressed the Smithers Cloud tracker beside it.
    expect(writes(calls)).toEqual(["POST /api/repos/will/flows/github/issues/6/transitions/accept"])

    // Repeating the act replays the one admitted operation under its own key.
    expect((await controller.commands.run("issues.transition", "6 accept")).status).toBe("executed")
    expect(sent.length).toBe(2)
    expect(sent[1]!.key).toBe(sent[0]!.key)
    // A DIFFERENT transition is a different act, so it carries its own key.
    await controller.commands.run("issues.transition", "6 park")
    expect(sent.filter((row) => row.path.endsWith("/accept")).length).toBe(2)
  })

  test("a transition id the server could never declare is refused before any request", async () => {
    const { controller, calls } = await controllerFor({}, "github")
    for (const id of ["Accept", "-accept", "accept!", ""]) {
      const outcome = await controller.commands.run("issues.transition", `6 ${id}`)
      expect(outcome.status).not.toBe("executed")
    }
    expect(writes(calls)).toEqual([])
  })

  test("a recorded private conversation is never moved on GitHub", async () => {
    const { store, controller, calls } = await controllerFor({
      "POST /api/repos/will/flows/issues": async (request) => {
        const body = await request.json() as Record<string, unknown>
        return json(201, wireCloudIssue(6, { title: body.title, kind: "chat" }))
      },
      "GET /api/repos/will/flows/issues/6": json(200, wireCloudIssue(6, { kind: "chat" })),
      "GET /api/repos/will/flows/issues/6/comments": json(200, [])
    }, "github")
    expect((await controller.commands.run("issues.create", "standup --kind conversation")).status).toBe("executed")
    expect(issueCards(store).some((card) => card.payload.kind === "chat")).toBe(true)

    const refused = await controller.commands.run("issues.transition", "6 accept")
    expect(refused.status).toBe("failed")
    expect(writes(calls).filter((call) => call.includes("/transitions/"))).toEqual([])
  })

  test("a repository whose name is not owner/name has no transition door to address", async () => {
    const calls: string[] = []
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, backend({}, calls))
    store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null })
    store.dispatch({
      type: "repositories.loaded",
      actor: "system",
      repositories: [{ id: "flows", org: "", ownerKind: "user", name: "flows", head: null, issueTracker: "github" }]
    })
    await settled()
    const outcome = await controller.commands.run("issues.transition", "6 accept flows")
    expect(outcome.status).not.toBe("executed")
    expect(writes(calls)).toEqual([])
  })
})
