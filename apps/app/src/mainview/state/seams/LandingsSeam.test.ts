import { savedPullNavigationArgs } from "../../flows/PullNavigationPayload"
import type { StorageApi } from "@tanstack/db"
import { describe, expect, test } from "bun:test"

import type { AgentPort } from "../../runtime/AgentPort"
import { createAppController } from "../AppController"
import type { AppServices } from "../AppController"
import { createAppStore } from "../AppStore"
import type { AppStore } from "../AppStore"
import { createLandingsSeam, readLandingOptions } from "./LandingsSeam"
import type { SeamContext } from "./SeamContext"

/*
 * The landings seam through the real command path: controller.commands.run
 * drives prs.* exactly as buttons and slash do, the stubbed backend answers
 * the platform shapes (multi src/smithersCloud/landings.ts), and the
 * transcript cards state the truth. Landing QUEUES — the card state after a
 * land reads "queued", never a terminal claim.
 */

const memoryStorage = (): StorageApi => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key)
  }
}

const unavailableAgent: AgentPort = {
  available: false,
  startTurn: async () => ({ status: "error", message: "unavailable" }),
  cancelTurn: async () => {},
  subscribe: () => () => {}
}


const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const backend = (
  routes: Record<string, Response | ((request: Request) => Response | Promise<Response>)>
): AppServices => ({
  fetchImpl: async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const absolute = new URL(url, "https://app.test")
    const path = absolute.pathname + absolute.search
    if (path === "/api/repos/will/flows" && routes[path] === undefined) return json(200, { full_name: "will/flows" })
    for (const [route, answer] of Object.entries(routes)) {
      if (path === route || path.startsWith(`${route}?`)) {
        return typeof answer === "function"
          ? answer(new Request(absolute.toString(), init))
          : answer.clone()
      }
    }
    return json(404, { status: "error", message: `no stub for ${path}` })
  }
})

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

const signedIn = async (store: AppStore): Promise<void> => {
  store.dispatch({
    type: "identity.session.loaded",
    actor: "system",
    state: "signed-in",
    login: "will",
    admin: false,
    scopesPlain: null
  })
  await settled()
}

const reposChosen = async (store: AppStore): Promise<void> => {
  store.dispatch({
    type: "repositories.loaded",
    actor: "system",
    repositories: [{ id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null }]
  })
  await settled()
}

/** A signed-in controller watching exactly will/flows, over the given backend. */
const ready = async (services: AppServices) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, services)
  await signedIn(store)
  await reposChosen(store)
  return { store, controller }
}

/* ---- platform payload builders (the wire shapes multi's parsers accept) ---- */

const landing = (number: number, state: string) => ({
  number,
  title: `Wire the seam ${number}`,
  body: "The **stack** description.",
  state,
  author: { id: 7, login: "will" },
  change_ids: ["chg-a", "chg-b"],
  target_bookmark: "main",
  conflict_status: "clean",
  stack_size: 2,
  created_at: "2026-08-10T10:00:00.000Z",
  updated_at: "2026-08-11T10:00:00.000Z"
})

const reviewRow = (id: number, type: string, body: string) => ({
  id,
  landing_request_id: 3,
  reviewer_id: 9,
  type,
  body,
  state: "submitted",
  created_at: "2026-08-11T11:00:00.000Z",
  updated_at: "2026-08-11T11:00:00.000Z"
})

const statusRow = (id: number, context: string, status: string, createdAt: string) => ({
  id,
  repository_id: 1,
  change_id: "chg-b",
  commit_sha: null,
  context,
  status,
  description: "",
  target_url: "",
  workflow_run_id: null,
  created_at: createdAt,
  updated_at: createdAt
})

const LANDINGS = "/api/repos/will/flows/landings"
const STATUSES = "/api/repos/will/flows/commits/chg-b/statuses"

describe("landings seam — prs.list", () => {
  test.each(["run", "runForAgent"] as const)("surfaces the pr-list card from the platform answer, skipping malformed rows (%s)", async (door) => {
    const { store, controller } = await ready(
      backend({
        [LANDINGS]: json(200, [landing(3, "open"), { nonsense: true }, landing(4, "queued")])
      })
    )
    const outcome = await controller.commands[door]("pr", savedPullNavigationArgs("prs.list"))
    expect(outcome.status).toBe("executed")
    expect(outcome.status === "executed" ? outcome.value : undefined).toBe(
      "Pull requests · will/flows\n#3 Wire the seam 3 · open\n#4 Wire the seam 4 · queued"
    )
    await settled()
    const card = store.collections.cards.get("prs-will/flows")
    if (card === undefined || card.kind !== "pr-list") throw new Error("expected the pr-list card")
    expect(card.title).toBe("Pull requests · will/flows")
    expect(card.status).toBe("active")
    expect(card.payload.repo).toBe("will/flows")
    expect(card.payload.landings).toEqual([
      {
        number: 3,
        title: "Wire the seam 3",
        state: "open",
        author: "will",
        updatedAt: "2026-08-11T10:00:00.000Z"
      },
      {
        number: 4,
        title: "Wire the seam 4",
        state: "queued",
        author: "will",
        updatedAt: "2026-08-11T10:00:00.000Z"
      }
    ])
  })

  test("the agent receives an explicit empty PR list", async () => {
    const { controller } = await ready(backend({ [LANDINGS]: json(200, []) }))
    const outcome = await controller.commands.runForAgent("pr", savedPullNavigationArgs("prs.list"))
    expect(outcome.status).toBe("executed")
    expect(outcome.status === "executed" ? outcome.value : undefined).toBe("No pull requests in will/flows.")
  })

  test("a 500 answers what failed and whose fault it was, never the platform's words, and keeps the failed view visible", async () => {
    const { store, controller } = await ready(
      backend({ [LANDINGS]: json(500, { message: "the platform fell over" }) })
    )
    const outcome = await controller.commands.run("pr", savedPullNavigationArgs("prs.list"))
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") {
      expect(outcome.error).toBe("Pull requests for will/flows couldn't be listed. That's a bug in Smithers, not something you did.")
      expect(outcome.error).not.toContain("the platform fell over")
    }
    expect(store.collections.cards.get("prs-will/flows")).toMatchObject({ status: "error", loading: false })
  })

  test("with no loaded repository the answer is the missing-repository form", async () => {
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(
      store,
      unavailableAgent,
      backend({})
    )
    await signedIn(store)
    /* THE FORM LAW: the missing repository is asked for, never guessed (tutorial stage 3). */
    const outcome = await controller.commands.run("pr", savedPullNavigationArgs("prs.list"))
    expect(outcome.status).toBe("executed")
    const form = store.collections.cards.get("form-pr")
    expect(form?.kind).toBe("flow-form")
    if (form?.kind === "flow-form") expect(form.payload.fields.map(field => field.name)).toContain("repo")
  })
})

describe("landings seam — prs.view", () => {
  test.each(["run", "runForAgent"] as const)("surfaces the pr card with body, reviews, and newest-per-context checks (%s)", async (door) => {
    const { store, controller } = await ready(
      backend({
        [`${LANDINGS}/3`]: json(200, landing(3, "open")),
        [`${LANDINGS}/3/reviews`]: json(200, [reviewRow(1, "approve", "Ship it")]),
        [STATUSES]: json(200, [
          // created_at DESC with a context repeated across re-runs: the
          // NEWEST ci/test row (success) must win over the older pending.
          statusRow(2, "ci/test", "success", "2026-08-11T12:00:00.000Z"),
          statusRow(3, "ci/lint", "failure", "2026-08-11T12:00:00.000Z"),
          statusRow(1, "ci/test", "pending", "2026-08-11T09:00:00.000Z")
        ])
      })
    )
    // The card-row arg shape: "<number> <owner/repo>" through splitTrailingRepo.
    const outcome = await controller.commands[door]("pr", "3 will/flows")
    expect(outcome.status).toBe("executed")
    const value = outcome.status === "executed" ? outcome.value : undefined
    for (const text of ["will/flows", "#3 Wire the seam 3 · open", "will", "The **stack** description.", "approve", "Ship it", "ci/test · success", "ci/lint · failure"]) {
      expect(value).toContain(text)
    }
    expect(value).not.toContain("pending")
    await settled()
    const card = store.collections.cards.get("pr-will/flows-3")
    if (card === undefined || card.kind !== "pr") throw new Error("expected the pr card")
    expect(card.title).toBe("#3 Wire the seam 3 · will/flows")
    expect(card.payload).toEqual({
      repo: "will/flows",
      number: 3,
      title: "Wire the seam 3",
      state: "open",
      author: "will",
      prBody: "The **stack** description.",
      reviews: [{ author: null, type: "approve", reviewBody: "Ship it" }],
      checks: [
        { context: "ci/test", state: "success" },
        { context: "ci/lint", state: "failure" }
      ],
      baseBranch: "main",
      createdAt: "2026-08-10T10:00:00.000Z",
      readErrors: {
        commits: "Commits unavailable (no stub for /api/repos/will/flows/landings/3/changes?limit=20)",
        files: "Files unavailable (no stub for /api/repos/will/flows/landings/3/diff)"
      }
    })
  })

  test("reads the stack for the Commits and Files tabs: commits bottom → top, files merged by path, a patch only for a file one change touched", async () => {
    const change = (id: string, sha: string, description: string) => ({ change_id: id, commit_id: sha, description, author_name: "Will", timestamp: "2026-08-10T10:00:00.000Z" })
    const fileDiff = (path: string, additions: number, deletions: number, patch: string) => ({ path, change_type: "modified", additions, deletions, patch })
    const { store, controller } = await ready(
      backend({
        [`${LANDINGS}/3`]: json(200, landing(3, "open")),
        [`${LANDINGS}/3/reviews`]: json(200, []),
        [STATUSES]: json(200, []),
        [`${LANDINGS}/3/changes`]: json(200, [change("chg-a", "aaa111", "Add the logger\n\nbody"), change("chg-b", "bbb222", "Wire it")]),
        [`${LANDINGS}/3/diff`]: json(200, { changes: [
          { change_id: "chg-a", file_diffs: [fileDiff("src/log.ts", 10, 0, "@@ a"), fileDiff("src/server.ts", 2, 1, "@@ b")] },
          { change_id: "chg-b", file_diffs: [fileDiff("src/server.ts", 3, 0, "@@ c")] }
        ] })
      })
    )
    const outcome = await controller.commands.run("pr", "3 will/flows")
    expect(outcome.status).toBe("executed")
    const value = outcome.status === "executed" ? outcome.value : undefined
    expect(value).toContain("File: src/server.ts +5 −1")
    await settled()
    const card = store.collections.cards.get("pr-will/flows-3")
    if (card === undefined || card.kind !== "pr") throw new Error("expected the pr card")
    expect(card.payload.commits).toEqual([
      { changeId: "chg-a", commitId: "aaa111", message: "Add the logger\n\nbody", author: "Will", timestamp: "2026-08-10T10:00:00.000Z" },
      { changeId: "chg-b", commitId: "bbb222", message: "Wire it", author: "Will", timestamp: "2026-08-10T10:00:00.000Z" }
    ])
    expect(card.payload.files).toEqual([
      { path: "src/log.ts", status: "modified", additions: 10, deletions: 0, patch: "@@ a" },
      { path: "src/server.ts", status: "modified", additions: 5, deletions: 1 }
    ])
  })

  test("a network throw answers an honest string, never an exception", async () => {
    const { controller } = await ready({
      fetchImpl: async () => {
        throw new Error("socket dropped")
      }
    })
    const outcome = await controller.commands.run("pr", "3")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") {
      expect(outcome.error).toBe("The source of pull requests for will/flows couldn't be checked.")
    }
  })

  test("retry replaces failed section state without retaining another read's stale content", async () => {
    let attempt = 0
    const services = backend({
      [`${LANDINGS}/3`]: json(200, landing(3, "merged")),
      [`${LANDINGS}/3/reviews`]: json(200, []),
      [STATUSES]: json(200, []),
      [`${LANDINGS}/3/changes`]: () => attempt === 0
        ? json(404, { message: "change not found" })
        : json(200, [{ change_id: "chg-a", commit_id: "aaa111", description: "Retained commit", author_name: "Will", timestamp: "2026-08-10T10:00:00.000Z" }]),
      [`${LANDINGS}/3/diff`]: () => {
        attempt += 1
        return attempt === 1
          ? json(503, { message: "repo host unavailable" })
          : json(200, { changes: [{ change_id: "chg-a", file_diffs: [] }] })
      }
    })
    const { store, controller } = await ready(services)
    expect((await controller.commands.run("pr", "3 will/flows")).status).toBe("executed")
    await settled()
    let card = store.collections.cards.get("pr-will/flows-3")
    if (card?.kind !== "pr") throw new Error("expected the pr card")
    expect(card.payload.readErrors).toEqual({ commits: "Commits unavailable (change not found)", files: "Files unavailable (Read failed. Something on Smithers' side failed. Not your fault, and nothing your request could have changed.)" })
    expect(card.payload.readErrors?.files).not.toContain("repo host unavailable")
    expect(card.payload.commits).toBeUndefined()
    expect(card.payload.files).toBeUndefined()

    expect((await controller.commands.run("pr", "3 will/flows")).status).toBe("executed")
    await settled()
    card = store.collections.cards.get("pr-will/flows-3")
    if (card?.kind !== "pr") throw new Error("expected the pr card")
    expect(card.payload.readErrors).toBeUndefined()
    expect(card.payload.commits?.map(commit => commit.message)).toEqual(["Retained commit"])
    expect(card.payload.files).toEqual([])
  })
})

test("retired PR Land has no slash or agent door and sends no request", async () => {
  const writes: string[] = []
  const { controller } = await ready({ fetchImpl: async (input, init) => {
    if ((init?.method ?? "GET") !== "GET") writes.push(String(input))
    return json(404, {})
  } })
  try {
    expect(controller.commands.entries().some(entry => entry.declaredName === "prs.land")).toBe(false)
    expect((await controller.commands.run("prs.land", "3")).status).toBe("unknown-command")
    await controller.commands.executeForAgent({ name: "commands", arguments: JSON.stringify({ action: "execute", name: "prs.land", args: "3" }) })
    expect(writes).toEqual([])
  } finally { controller.dispose() }
})

describe("landings seam — prs.review", () => {
  const TIP_CHANGE = "/api/repos/will/flows/changes/chg-b"
  const tipChange = json(200, { change_id: "chg-b", commit_id: "c0ffee42" })

  test("posts the verdict and re-reads the card so it states the new truth", async () => {
    const posted: unknown[] = []
    const { store, controller } = await ready(
      backend({
        [`${LANDINGS}/3/reviews`]: async (request) => {
          if (request.method === "POST") {
            posted.push(await request.json())
            return json(201, reviewRow(2, "approve", ""))
          }
          return json(200, [reviewRow(2, "approve", "")])
        },
        [`${LANDINGS}/3`]: json(200, landing(3, "open")),
        [TIP_CHANGE]: tipChange,
        [STATUSES]: json(200, [])
      })
    )
    const outcome = await controller.commands.run("prs.review", "3 approve")
    expect(outcome.status).toBe("executed")
    expect(posted).toEqual([{ type: "approve", body: "", commit_id: "c0ffee42" }])
    await settled()
    const card = store.collections.cards.get("pr-will/flows-3")
    if (card === undefined || card.kind !== "pr") throw new Error("expected the pr card")
    expect(card.payload.reviews).toEqual([{ author: null, type: "approve", reviewBody: "" }])
  })

  test.each(["comment", "request-changes"])("%s pins the reviewed revision", async (type) => {
    const posted: unknown[] = []
    const { controller } = await ready(backend({
      [`${LANDINGS}/3`]: json(200, landing(3, "open")),
      [TIP_CHANGE]: tipChange,
      [`${LANDINGS}/3/reviews`]: async request => {
        if (request.method === "POST") {
          posted.push(await request.json())
          return json(201, reviewRow(2, type, "needs work"))
        }
        return json(200, [])
      },
      [STATUSES]: json(200, [])
    }))
    expect((await controller.commands.run("prs.review", `3 ${type} needs work`)).status).toBe("executed")
    expect(posted).toEqual([{ type: type.replace("-", "_"), body: "needs work", commit_id: "c0ffee42" }])
  })

  test("an unreadable review tip never posts an unpinned review", async () => {
    let posts = 0
    const { controller } = await ready(backend({
      [`${LANDINGS}/3`]: json(200, landing(3, "open")),
      [TIP_CHANGE]: json(503, { message: "tip unavailable" }),
      [`${LANDINGS}/3/reviews`]: () => { posts++; return json(201, {}) }
    }))
    const outcome = await controller.commands.run("prs.review", "3 comment needs work")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") {
      expect(outcome.error).toBe("The tip change chg-b of #3 couldn't be read. Something on Smithers' side failed. Not your fault, and nothing your request could have changed.")
      expect(outcome.error).not.toContain("tip unavailable")
    }
    expect(posts).toBe(0)
  })

  test("request-changes without text answers honestly before touching the wire", async () => {
    let touched = 0
    const { controller } = await ready({
      fetchImpl: async () => {
        touched += 1
        return json(404, { message: "should not be reached" })
      }
    })
    const before = touched
    const outcome = await controller.commands.run("prs.review", "3 request-changes")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") {
      expect(outcome.error).toBe("A request-changes review needs text: /prs.review 3 request-changes <why>")
    }
    expect(touched).toBe(before)
  })

  test("a 422 from the platform round-trips as the honest error", async () => {
    const { controller } = await ready(
      backend({
        [`${LANDINGS}/3`]: json(200, landing(3, "open")),
        [TIP_CHANGE]: tipChange,
        [`${LANDINGS}/3/reviews`]: json(422, { message: "body is required" })
      })
    )
    const outcome = await controller.commands.run("prs.review", "3 comment needs work")
    expect(outcome.status).toBe("failed")
    if (outcome.status === "failed") expect(outcome.error).toBe("body is required")
  })
})

test("PR detail bounds the model value while retaining the card body", async () => {
  const body = "large PR body ".repeat(2_000)
  const { store, controller } = await ready(backend({
    [`${LANDINGS}/3`]: json(200, { ...landing(3, "open"), body })
  }))
  const outcome = await controller.commands.runForAgent("pr", "3")
  expect(outcome.status).toBe("executed")
  const value = outcome.status === "executed" ? outcome.value : undefined
  expect(value).toContain("#3 Wire the seam 3 · open")
  expect(value).toContain("[truncated]")
  expect(value?.length).toBeLessThanOrEqual(16_000)
  const card = store.collections.cards.get("pr-will/flows-3")
  expect(card?.kind === "pr" ? card.payload.prBody : undefined).toBe(body)
})

describe("Review a PR source selection", () => {
  const cloudRepo = "/api/repos/will/flows"
  const githubPulls = "/api/user/github-repos/upstream/project/pulls"
  const source = { full_name: "will/flows", github_source: { owner: "upstream", repo: "project" } }

  test("the bare form reads GitHub PR choices for a ready import, not same-number Cloud landings", async () => {
    const calls: string[] = []
    const services = backend({
      [cloudRepo]: json(200, source),
      [`${githubPulls}?state=open&per_page=100`]: json(200, [
        { number: 7, title: "Upstream change", state: "open", user: { login: "writer" } },
        { number: 8, title: "Closed change", state: "closed" }
      ]),
      [`${cloudRepo}/landings?limit=100`]: json(200, [landing(7, "open")])
    })
    const options = await readLandingOptions({ baseUrl: "", http: async (url) => {
      calls.push(url)
      return services.fetchImpl!(url)
    } }, "will/flows")
    expect(options).toEqual({ options: [{ value: "7", label: "#7 Upstream change" }] })
    expect(calls).toEqual([cloudRepo, `${githubPulls}?state=open&per_page=100`])
  })

  test("native repositories still read Cloud landings, including an empty list", async () => {
    const calls: string[] = []
    const services = backend({
      [cloudRepo]: json(200, { full_name: "will/flows" }),
      [`${cloudRepo}/landings?limit=100`]: json(200, [])
    })
    const options = await readLandingOptions({ baseUrl: "", http: async (url) => {
      calls.push(url)
      return services.fetchImpl!(url)
    } }, "will/flows")
    expect(options).toEqual({ options: [] })
    expect(calls).toEqual([cloudRepo, `${cloudRepo}/landings?limit=100`])
  })

  test("repository identity accepts casing differences but no different owner", async () => {
    const native = backend({
      [cloudRepo]: json(200, { full_name: "Will/Flows" }),
      [`${cloudRepo}/landings?limit=100`]: json(200, [])
    })
    expect(await readLandingOptions({ baseUrl: "", http: (url) => native.fetchImpl!(url) }, "will/flows"))
      .toEqual({ options: [] })
    const different = backend({ [cloudRepo]: json(200, { full_name: "other/flows" }) })
    const refused = await readLandingOptions({ baseUrl: "", http: (url) => different.fetchImpl!(url) }, "will/flows")
    expect(refused.options).toEqual([])
    expect(refused.error).toContain("different repository")
  })

  test("a GitHub authorization failure never switches to a same-number Cloud PR", async () => {
    const calls: string[] = []
    const services = backend({
      [cloudRepo]: json(200, source),
      [`${githubPulls}?state=open&per_page=100`]: json(403, { message: "GitHub authorization required" }),
      [`${cloudRepo}/landings?limit=100`]: json(200, [landing(7, "open")])
    })
    const options = await readLandingOptions({ baseUrl: "", http: async (url) => {
      calls.push(url)
      return services.fetchImpl!(url)
    } }, "will/flows")
    expect(options.options).toEqual([])
    expect(options.error).toBeDefined()
    expect(calls).toEqual([cloudRepo, `${githubPulls}?state=open&per_page=100`])
  })

  test("a typed PR number reads the mapped GitHub PR and diff as Cloud flow context", async () => {
    const services = backend({
      [cloudRepo]: json(200, source),
      [`${githubPulls}/17`]: json(200, { number: 17, title: "Upstream PR", body: "Description", state: "open", user: { login: "writer" }, base: { ref: "main" } }),
      [`${githubPulls}/17/diff`]: new Response("diff --git a/a b/a\n+new code\n", { status: 200 }),
      [`${cloudRepo}/landings/17`]: json(200, landing(17, "open"))
    })
    const { store } = await ready(services)
    const calls: string[] = []
    const seam = createLandingsSeam({
      baseUrl: "", store, dispatch: store.dispatch.bind(store), actor: () => "user", nextOrdinal: () => 1,
      http: async (url) => { calls.push(url); return services.fetchImpl!(url) }
    } as SeamContext)
    expect(await seam.readLandingContext(17, "will/flows")).toEqual({
      repo: "will/flows", sourceRepo: "upstream/project", number: 17,
      title: "Upstream PR", body: "Description", state: "open", author: "writer", baseBranch: "main",
      diff: "diff --git a/a b/a\n+new code\n"
    })
    expect(calls).toEqual([cloudRepo, `${githubPulls}/17`, `${githubPulls}/17/diff`])
  })

  test("a typed PR authorization failure cannot review a same-number Cloud landing", async () => {
    const services = backend({
      [cloudRepo]: json(200, source),
      [`${githubPulls}/17`]: json(403, { message: "GitHub authorization required" }),
      [`${cloudRepo}/landings/17`]: json(200, landing(17, "open"))
    })
    const { store } = await ready(services)
    const calls: string[] = []
    const seam = createLandingsSeam({
      baseUrl: "", store, dispatch: store.dispatch.bind(store), actor: () => "user", nextOrdinal: () => 1,
      http: async (url) => { calls.push(url); return services.fetchImpl!(url) }
    } as SeamContext)
    expect(await seam.readLandingContext(17, "will/flows")).toContain("GitHub")
    expect(calls).toEqual([cloudRepo, `${githubPulls}/17`])
  })

  test("malformed source metadata refuses instead of guessing another owner", async () => {
    const services = backend({ [cloudRepo]: json(200, { full_name: "will/flows", github_source: { owner: "someone/else", repo: "project" } }) })
    const options = await readLandingOptions({ baseUrl: "", http: (url) => services.fetchImpl!(url) }, "will/flows")
    expect(options.options).toEqual([])
    expect(options.error).toContain("could not be verified")
  })

  test("conflicting ready imports refuse instead of using a Cloud PR with the same number", async () => {
    const calls: string[] = []
    const services = backend({
      [cloudRepo]: json(200, { full_name: "will/flows", github_source_ambiguous: true }),
      [`${cloudRepo}/landings?limit=100`]: json(200, [landing(17, "open")])
    })
    const options = await readLandingOptions({ baseUrl: "", http: async (url) => {
      calls.push(url)
      return services.fetchImpl!(url)
    } }, "will/flows")
    expect(options.options).toEqual([])
    expect(options.error).toContain("more than one GitHub source")
    expect(calls).toEqual([cloudRepo])
  })

  test("missing source store refuses even if native Cloud landings exist", async () => {
    const calls: string[] = []
    const services = backend({
      [cloudRepo]: json(200, { full_name: "will/flows", github_source_unavailable: true }),
      [`${cloudRepo}/landings?limit=100`]: json(200, [landing(17, "open")])
    })
    const options = await readLandingOptions({ baseUrl: "", http: async (url) => {
      calls.push(url)
      return services.fetchImpl!(url)
    } }, "will/flows")
    expect(options.options).toEqual([])
    expect(options.error).toContain("unavailable")
    expect(calls).toEqual([cloudRepo])
  })
})

for (const door of ["run", "runForAgent"] as const) {
  test(`canonical PR ${door} reads the verified GitHub source rather than same-number native data`, async () => {
    const services = backend({
      "/api/repos/will/flows": json(200, { full_name: "will/flows", github_source: { owner: "upstream", repo: "project" } }),
      "/api/user/github-repos/upstream/project/pulls/3": json(200, { number: 3, title: "GitHub source", body: "Original discussion", state: "open", user: { login: "maintainer" }, head: { ref: "smithers/second" }, base: { ref: "main" } })
    })
    const { store, controller } = await ready(services)
    const outcome = await controller.commands[door]("pr", "3 will/flows")
    expect(outcome.status).toBe("executed")
    expect(store.collections.cards.get("pr-will/flows-3")).toMatchObject({ kind: "pr", payload: {
      number: 3, repo: "will/flows", sourceRepo: "upstream/project", title: "GitHub source", prBody: "Original discussion", author: "maintainer", branch: "smithers/second", baseBranch: "main"
    } })
    await controller.dispose()
  })
}

/*
 * The Commits, Checks and Files changed tabs of a GitHub-source pull request.
 * Production (UI 10a823b3, roninjin10/e2e-verify#2 — one commit, one check
 * run and README.md +3 −0 per GitHub's own pulls/2/commits,
 * commits/{sha}/check-runs and pulls/2/files) painted "Files unavailable." and
 * "Commits unavailable." with no reason and no Retry, and nothing at all on
 * Checks: the detail read answered the whole stack as `{}` for a GitHub
 * source, so nothing was read and no `readErrors` said why. The platform now
 * proxies one read-only GET per tab (routes/github_user_repos.go
 * GetGitHubPullDiff, ListGitHubPullCommits, ListGitHubCommitCheckRuns), and
 * these are those reads.
 */
describe("a GitHub source's pull request tabs", () => {
  const cloudRepo = "/api/repos/will/flows"
  const githubRepo = "/api/user/github-repos/upstream/project"
  const githubPulls = `${githubRepo}/pulls`
  const HEAD_SHA = "0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6"
  const checkRuns = `${githubRepo}/commits/${HEAD_SHA}/check-runs`
  const source = { full_name: "will/flows", github_source: { owner: "upstream", repo: "project" } }
  const detail = { number: 2, title: "Add build-status line to README", body: "Resolves #1. Adds build status note.", state: "closed", merged: true, user: { login: "roninjin10" }, head: { ref: "e2e-build-status", sha: HEAD_SHA }, base: { ref: "main" } }
  /** The reference pull request's own patch: README.md, three added lines, no deletions. */
  const readmeDiff = "diff --git a/README.md b/README.md\nindex 1111111..2222222 100644\n--- a/README.md\n+++ b/README.md\n@@ -1,3 +1,6 @@\n # e2e-verify\n \n Workflow verification repository.\n+\n+## Build status\n+Build status: verified by the e2e build-status check.\n"
  const commitRows = [{
    sha: HEAD_SHA,
    commit: { message: "Add build-status line to README\n\nResolves #1.", author: { name: "Will Cory", date: "2026-10-14T18:00:00Z" } },
    author: { login: "roninjin10" }
  }]
  const checkRunRows = { total_count: 1, check_runs: [{ name: "build-status", status: "completed", conclusion: "success", started_at: "2026-10-14T18:01:00Z" }] }

  /**
   * The three tab reads answered; `over` replaces any of them, keyed by path.
   * A function override is handed the WHOLE request, query included, because
   * which page the app asked for is the thing several of these assert.
   */
  const tabsBackend = (over: Record<string, Response | ((request: Request) => Response | Promise<Response>)> = {}) => ({
    fetchImpl: async (input: string | URL | Request, _init?: RequestInit) => {
      const url = new URL(String(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url), "https://app.test")
      const path = url.pathname
      const answer = over[path]
      if (answer !== undefined) return typeof answer === "function" ? answer(new Request(url.toString())) : answer.clone()
      if (path === cloudRepo) return json(200, source)
      if (path === `${githubPulls}/2`) return json(200, detail)
      if (path === `${githubPulls}/2/diff`) return new Response(readmeDiff, { status: 200, headers: { "content-type": "text/plain" } })
      if (path === `${githubPulls}/2/commits`) return json(200, commitRows)
      if (path === checkRuns) return json(200, checkRunRows)
      return json(404, { message: `no stub for ${path}` })
    }
  })

  const prCard = async (services: ReturnType<typeof tabsBackend>) => {
    const { store, controller } = await ready(services)
    expect((await controller.commands.run("pr", "2 will/flows")).status).toBe("executed")
    const card = store.collections.cards.get("pr-will/flows-2")
    if (card === undefined || card.kind !== "pr") throw new Error("expected the pr card")
    return { payload: card.payload, store, controller }
  }

  test("carries the files, commits and checks its three proxied reads answered", async () => {
    const calls: string[] = []
    const base = tabsBackend()
    const { payload, controller } = await prCard({ fetchImpl: async (input, init) => {
      calls.push(new URL(String(input), "https://app.test").pathname)
      return base.fetchImpl(input as string, init as RequestInit)
    } })
    expect(payload.sourceRepo).toBe("upstream/project")
    expect(payload.readErrors).toBeUndefined()
    expect(payload.files).toEqual([{ path: "README.md", status: "modified", additions: 3, deletions: 0, patch: readmeDiff }])
    expect(payload.commits).toEqual([{
      commitId: HEAD_SHA,
      message: "Add build-status line to README\n\nResolves #1.",
      author: "roninjin10",
      timestamp: "2026-10-14T18:00:00Z"
    }])
    expect(payload.checks).toEqual([{ context: "build-status", state: "success" }])
    // Exactly the proxied read-only GETs, no invented door and no mutation.
    expect(calls).toContain(`${githubPulls}/2/diff`)
    expect(calls).toContain(`${githubPulls}/2/commits`)
    expect(calls).toContain(checkRuns)
    await controller.dispose()
  })

  test("a run still going keeps its status, and a re-run keeps the newest row per check", async () => {
    const { payload, controller } = await prCard(tabsBackend({ [checkRuns]: json(200, { check_runs: [
      { name: "build-status", status: "completed", conclusion: "failure", started_at: "2026-10-14T18:01:00Z" },
      { name: "build-status", status: "completed", conclusion: "success", started_at: "2026-10-14T19:30:00Z" },
      { name: "lint", status: "in_progress", conclusion: null, started_at: "2026-10-14T19:31:00Z" }
    ] }) }))
    expect(payload.readErrors).toBeUndefined()
    expect(payload.checks).toEqual([{ context: "build-status", state: "success" }, { context: "lint", state: "in_progress" }])
    await controller.dispose()
  })

  test("each tab's read is refused on its own, with its HTTP status and never the upstream's prose", async () => {
    for (const [tab, path, label] of [
      ["files", `${githubPulls}/2/diff`, "Files unavailable ("],
      ["commits", `${githubPulls}/2/commits`, "Commits unavailable ("],
      ["checks", checkRuns, "Checks unavailable ("]
    ] as const) {
      const { payload, controller } = await prCard(tabsBackend({
        [path]: json(502, { code: "github_unavailable", message: "upstream said something only an operator should read" })
      }))
      const reason = payload.readErrors?.[tab] ?? ""
      expect(reason).toContain(label)
      expect(reason).toContain("502")
      // Bounded product words with the verdict, never the upstream's prose or a URL.
      expect(reason).not.toContain("only an operator should read")
      expect(reason).not.toContain("github-repos")
      // The tab that failed is the only one missing; the others still answered.
      if (tab === "files") expect(payload.files).toBeUndefined()
      else expect(payload.files).toHaveLength(1)
      if (tab === "commits") expect(payload.commits).toBeUndefined()
      else expect(payload.commits).toHaveLength(1)
      expect(payload.checks).toEqual(tab === "checks" ? [] : [{ context: "build-status", state: "success" }])
      await controller.dispose()
    }
  })

  test("a request that never answered says that, with no HTTP status to claim", async () => {
    const throwing = () => { throw new Error("Load failed") }
    for (const [tab, path] of [["files", `${githubPulls}/2/diff`], ["commits", `${githubPulls}/2/commits`], ["checks", checkRuns]] as const) {
      const { payload, controller } = await prCard(tabsBackend({ [path]: throwing }))
      const reason = payload.readErrors?.[tab] ?? ""
      expect(reason).toContain("The platform didn't answer.")
      expect(reason).not.toContain("Load failed")
      await controller.dispose()
    }
  })

  test("a payload in the wrong shape is unreadable, never an empty tab", async () => {
    for (const [tab, path] of [["commits", `${githubPulls}/2/commits`], ["checks", checkRuns]] as const) {
      const { payload, controller } = await prCard(tabsBackend({ [path]: json(200, { nonsense: true }) }))
      expect(payload.readErrors?.[tab] ?? "").toContain("The platform returned an unreadable response.")
      await controller.dispose()
    }
    // One unreadable row refuses the whole list: a shorter list must never be
    // presented as every commit this pull request carries.
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2/commits`]: json(200, [commitRows[0], { sha: "", commit: {} }])
    }))
    expect(payload.commits).toBeUndefined()
    expect(payload.readErrors?.commits ?? "").toContain("The platform returned an unreadable response.")
    await controller.dispose()
  })

  test("empty answers are honest zeros: no changes, no commits, no checks reported", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2/diff`]: new Response("", { status: 200, headers: { "content-type": "text/plain" } }),
      [`${githubPulls}/2/commits`]: json(200, []),
      [checkRuns]: json(200, { total_count: 0, check_runs: [] })
    }))
    expect(payload.files).toEqual([])
    expect(payload.commits).toEqual([])
    expect(payload.checks).toEqual([])
    expect(payload.readErrors).toBeUndefined()
    await controller.dispose()
  })

  test("a pull request naming no head commit says its checks have no ref, not that it has none", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2`]: json(200, { ...detail, head: { ref: "e2e-build-status" } }),
      [checkRuns]: () => { throw new Error("no head commit means no checks read") }
    }))
    expect(payload.checks).toEqual([])
    expect(payload.readErrors?.checks ?? "").toContain("This pull request names no head commit.")
    expect(payload.files).toHaveLength(1)
    await controller.dispose()
  })

  test("a whole patch becomes one row per file, with the patch its renderer reads", async () => {
    const multi = [
      "diff --git a/docs/a file.md b/docs/a file.md\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/docs/a file.md\n@@ -0,0 +1,2 @@\n+added\n+lines\n",
      "diff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\nindex 2222222..0000000\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n",
      "diff --git a/old.ts b/new.ts\nsimilarity index 100%\nrename from old.ts\nrename to new.ts\n",
      "diff --git a/logo.png b/logo.png\nindex 3333333..4444444 100644\nGIT binary patch\nliteral 8\n",
      "diff --git a/empty.txt b/empty.txt\nnew file mode 100644\nindex 0000000..0000000\n"
    ].join("")
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2/diff`]: new Response(multi, { status: 200, headers: { "content-type": "text/plain" } })
    }))
    expect(payload.readErrors).toBeUndefined()
    expect((payload.files ?? []).map((file) => [file.path, file.status, file.additions, file.deletions, file.oldPath])).toEqual([
      ["docs/a file.md", "added", 2, 0, undefined],
      ["gone.txt", "removed", 0, 1, undefined],
      ["new.ts", "renamed", 0, 0, "old.ts"],
      ["logo.png", "modified", 0, 0, undefined],
      ["empty.txt", "added", 0, 0, undefined]
    ])
    // Every row keeps its own section verbatim, so the shared diff renderer
    // draws what GitHub wrote rather than a re-serialized guess.
    for (const file of payload.files ?? []) expect(multi).toContain(file.patch ?? "")
    await controller.dispose()
  })

  test("a patch section this app cannot name refuses the whole Files tab instead of claiming complete files", async () => {
    const mixed = "diff --git a/README.md b/README.md\nindex 1111111..2222222 100644\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n"
      + "diff --git \"a/strange\nnot a patch at all\n"
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2/diff`]: new Response(mixed, { status: 200, headers: { "content-type": "text/plain" } })
    }))
    expect(payload.files).toBeUndefined()
    expect(payload.readErrors?.files ?? "").toContain("Files unavailable (The platform returned an unreadable response.)")
    // The tabs that answered are unaffected by the one that did not.
    expect(payload.commits).toHaveLength(1)
    await controller.dispose()
  })

  /*
   * PAGINATION, the defect root found in the first candidate: both list reads
   * asked the platform for one page and rendered it as the whole tab, so a
   * pull request with more than 100 commits or check runs silently showed its
   * first hundred as complete. GitHub pages both reads (per_page 100 / page)
   * and stops a pull request's OWN commit list at 250 whatever page is asked
   * for, so the rows alone can never prove a stack whole — only the pull
   * request's `commits` count and a ref's `total_count` can.
   */
  const commitPage = (count: number, from: number) =>
    Array.from({ length: count }, (_, index) => ({
      sha: (from + index).toString(16).padStart(40, "0"),
      commit: { message: `commit ${from + index}`, author: { name: "Will Cory", date: "2026-10-14T18:00:00Z" } },
      author: { login: "roninjin10" }
    }))

  const runPage = (count: number, from: number, total: number) => ({
    total_count: total,
    check_runs: Array.from({ length: count }, (_, index) => ({
      name: `check-${from + index}`,
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-14T18:01:00Z"
    }))
  })

  /** The page number of a recorded request, and the page size it asked for. */
  const pageOf = (request: Request) => new URL(request.url).searchParams

  test("a stack longer than one page is read page by page, by number, on the platform's own path", async () => {
    const asked: string[] = []
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2`]: json(200, { ...detail, commits: 250 }),
      [`${githubPulls}/2/commits`]: (request) => {
        const url = new URL(request.url)
        asked.push(`${url.pathname}?${url.searchParams.get("per_page")}/${url.searchParams.get("page")}`)
        const page = Number(url.searchParams.get("page"))
        return json(200, page === 3 ? commitPage(50, 201) : commitPage(100, (page - 1) * 100 + 1))
      }
    }))
    // Every page, asked for as a number with GitHub's own page size, on the
    // one path the platform proxies — never a URL a Link header named, and
    // never the doubled `/pulls/pulls` an intermediate version built.
    expect(asked).toEqual([
      `${githubPulls}/2/commits?100/1`,
      `${githubPulls}/2/commits?100/2`,
      `${githubPulls}/2/commits?100/3`
    ])
    expect(payload.commits).toHaveLength(250)
    expect(payload.commits?.[0]?.message).toBe("commit 1")
    expect(payload.commits?.at(-1)?.message).toBe("commit 250")
    // Every commit the pull request says it has: nothing to warn about.
    expect(payload.readLimits).toBeUndefined()
    expect(payload.readErrors).toBeUndefined()
    await controller.dispose()
  })

  test("a stack longer than GitHub will answer keeps its rows and says how many of how many", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      // GitHub stops this list at 250 even though the pull request has 412.
      [`${githubPulls}/2`]: json(200, { ...detail, commits: 412 }),
      [`${githubPulls}/2/commits`]: (request) => {
        const page = Number(pageOf(request).get("page"))
        return json(200, page === 3 ? commitPage(50, 201) : commitPage(100, (page - 1) * 100 + 1))
      }
    }))
    expect(payload.commits).toHaveLength(250)
    expect(payload.readLimits?.commits).toBe("Showing 250 of 412 commits.")
    // The rows are an answer, not a failure: the tab still has them.
    expect(payload.readErrors?.commits).toBeUndefined()
    await controller.dispose()
  })

  test("a later page refused keeps the rows already read and says the rest were not", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2`]: json(200, { ...detail, commits: 240 }),
      [`${githubPulls}/2/commits`]: (request) =>
        pageOf(request).get("page") === "1"
          ? json(200, commitPage(100, 1))
          : json(502, { code: "github_unavailable", message: "upstream said something only an operator should read" })
    }))
    // The hundred rows that WERE read stay; what is refused is the rest.
    expect(payload.commits).toHaveLength(100)
    expect(payload.readErrors?.commits).toBeUndefined()
    const limit = payload.readLimits?.commits ?? ""
    expect(limit).toContain("Showing 100 of 240 commits.")
    expect(limit).toContain("502")
    expect(limit).not.toContain("only an operator should read")
    expect(limit).not.toContain("github-repos")
    await controller.dispose()
  })

  test("a later page in the wrong shape is a limit on real rows, never an empty or complete tab", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2/commits`]: (request) =>
        pageOf(request).get("page") === "1" ? json(200, commitPage(100, 1)) : json(200, { nonsense: true })
    }))
    expect(payload.commits).toHaveLength(100)
    expect(payload.readLimits?.commits).toBe(
      "Showing the 100 commits this read could reach. The platform returned an unreadable response."
    )
    await controller.dispose()
  })

  test("rows that reach the count the source itself reports are the whole list, however the walk ended", async () => {
    // The cap was hit AND a page was refused, but the pull request says it has
    // 300 commits and 300 were read: there is nothing to qualify.
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2`]: json(200, { ...detail, commits: 300 }),
      [`${githubPulls}/2/commits`]: (request) => {
        const page = Number(pageOf(request).get("page"))
        return json(200, commitPage(100, (page - 1) * 100 + 1))
      }
    }))
    expect(payload.commits).toHaveLength(300)
    expect(payload.readLimits).toBeUndefined()
    expect(payload.readErrors).toBeUndefined()
    await controller.dispose()
  })

  test("a source that never stops answering full pages ends the read instead of looping", async () => {
    let requests = 0
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2/commits`]: () => {
        requests += 1
        return json(200, commitPage(100, requests * 100 - 99))
      }
    }))
    // Bounded: three pages of commits reach past the 250 GitHub will answer.
    expect(requests).toBe(3)
    expect(payload.commits).toHaveLength(300)
    expect(payload.readLimits?.commits).toBe("Showing the 300 commits this read could reach. This read stops after 300 rows.")
    await controller.dispose()
  })

  test("check runs are paged too, and total_count is what proves them complete", async () => {
    const asked: Array<string | null> = []
    const { payload, controller } = await prCard(tabsBackend({
      [checkRuns]: (request) => {
        const page = pageOf(request).get("page")
        asked.push(page)
        return json(200, page === "1" ? runPage(100, 1, 150) : runPage(50, 101, 150))
      }
    }))
    expect(asked).toEqual(["1", "2"])
    expect(payload.checks).toHaveLength(150)
    expect(payload.readLimits).toBeUndefined()
    expect(payload.readErrors).toBeUndefined()
    await controller.dispose()
  })

  test("check runs short of the total GitHub reports say so, counted in runs read not rows drawn", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      // A re-run folds onto the check it re-ran, so the drawn rows are fewer
      // than the runs read; the shortfall is measured against the runs.
      [checkRuns]: json(200, {
        total_count: 9,
        check_runs: [
          { name: "build-status", status: "completed", conclusion: "failure", started_at: "2026-10-14T18:01:00Z" },
          { name: "build-status", status: "completed", conclusion: "success", started_at: "2026-10-14T19:30:00Z" }
        ]
      })
    }))
    expect(payload.checks).toEqual([{ context: "build-status", state: "success" }])
    expect(payload.readLimits?.checks).toBe("Showing 2 of 9 check runs.")
    expect(payload.readErrors?.checks).toBeUndefined()
    await controller.dispose()
  })

  /*
   * A page whose JSON is the right SHAPE but whose rows are not the rows this
   * reads. The first candidate validated the envelope per page and parsed the
   * ROWS only after the whole walk, so one malformed row on page two threw
   * away the hundred verified rows of page one and answered the tab
   * "unavailable". A page is now validated to the row before any of it is
   * kept: the verified pages stay and the bad page is the limit.
   */
  test("a later page with a malformed ROW keeps the verified pages and says the rest were not read", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2/commits`]: (request) =>
        pageOf(request).get("page") === "1"
          ? json(200, commitPage(100, 1))
          // A list, of objects, with a commit that names no sha: valid JSON of
          // the right shape and not a commit row.
          : json(200, [{ commit: { message: "no sha here" } }])
    }))
    expect(payload.commits).toHaveLength(100)
    expect(payload.commits?.[0]?.message).toBe("commit 1")
    expect(payload.commits?.at(-1)?.message).toBe("commit 100")
    expect(payload.readErrors?.commits).toBeUndefined()
    expect(payload.readLimits?.commits).toBe(
      "Showing the 100 commits this read could reach. The platform returned an unreadable response."
    )
    await controller.dispose()
  })

  test("a later page of check runs with a malformed ROW keeps the runs already read", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      [checkRuns]: (request) =>
        pageOf(request).get("page") === "1"
          ? json(200, runPage(100, 1, 150))
          : json(200, { total_count: 150, check_runs: [{ name: "late", conclusion: "success" }] })
    }))
    expect(payload.checks).toHaveLength(100)
    expect(payload.checks?.[0]).toEqual({ context: "check-1", state: "success" })
    expect(payload.readErrors?.checks).toBeUndefined()
    expect(payload.readLimits?.checks).toBe(
      "Showing 100 of 150 check runs. The platform returned an unreadable response."
    )
    await controller.dispose()
  })

  test("a malformed ROW on the FIRST page is the tab's honest refusal, not a half-read tab", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2/commits`]: json(200, [...commitPage(1, 1), { commit: { message: "no sha here" } }])
    }))
    expect(payload.commits).toBeUndefined()
    expect(payload.readErrors?.commits ?? "").toContain("Commits unavailable (")
    expect(payload.readErrors?.commits ?? "").toContain("unreadable response")
    expect(payload.readLimits?.commits).toBeUndefined()
    await controller.dispose()
  })

  /*
   * GitHub answers at most 250 commits for ONE pull request however it is
   * paged. Reaching exactly that many without the pull request's own count is
   * the one short page that proves nothing: the list may have ended there, or
   * the endpoint may have. Only a count can tell them apart.
   */
  test("exactly the 250 commits GitHub will answer is complete with a count and uncertain without one", async () => {
    const pages = (request: Request) => {
      const page = Number(pageOf(request).get("page"))
      return json(200, page === 3 ? commitPage(50, 201) : commitPage(100, (page - 1) * 100 + 1))
    }
    const known = await prCard(tabsBackend({
      [`${githubPulls}/2`]: json(200, { ...detail, commits: 250 }),
      [`${githubPulls}/2/commits`]: pages
    }))
    expect(known.payload.commits).toHaveLength(250)
    expect(known.payload.readLimits).toBeUndefined()
    await known.controller.dispose()

    // The same 250 rows, from a pull request that reports no count.
    const unknown = await prCard(tabsBackend({ [`${githubPulls}/2/commits`]: pages }))
    expect(unknown.payload.commits).toHaveLength(250)
    expect(unknown.payload.readErrors).toBeUndefined()
    expect(unknown.payload.readLimits?.commits ?? "").toContain("250")
    expect(unknown.payload.readLimits?.commits ?? "").toContain("at most 250 commits")
    await unknown.controller.dispose()

    // One commit and no count is not a bounded read: nothing to warn about.
    const one = await prCard(tabsBackend())
    expect(one.payload.commits).toHaveLength(1)
    expect(one.payload.readLimits).toBeUndefined()
    await one.controller.dispose()
  })

  test("a count that is not a whole, representable number of rows is no count at all", async () => {
    // A negative count made `shown < total` false, so a REFUSED later page
    // read as the whole list.
    const negative = await prCard(tabsBackend({
      [`${githubPulls}/2`]: json(200, { ...detail, commits: -5 }),
      [`${githubPulls}/2/commits`]: (request) =>
        pageOf(request).get("page") === "1" ? json(200, commitPage(100, 1)) : json(502, { code: "github_unavailable" })
    }))
    expect(negative.payload.commits).toHaveLength(100)
    expect(negative.payload.readLimits?.commits ?? "").toContain("Showing the 100 commits this read could reach.")
    expect(negative.payload.readLimits?.commits ?? "").not.toContain("-5")
    await negative.controller.dispose()

    // A fraction or a number past integer precision is not a row count, and
    // never reaches the sentence a person reads.
    for (const commits of [2.5, 1e21]) {
      const { payload, controller } = await prCard(tabsBackend({ [`${githubPulls}/2`]: json(200, { ...detail, commits }) }))
      expect(payload.commits).toHaveLength(1)
      expect(payload.readLimits).toBeUndefined()
      await controller.dispose()
    }

    // A ref's `total_count` is held to the same bound.
    const runs = await prCard(tabsBackend({ [checkRuns]: json(200, { total_count: 3.5, check_runs: checkRunRows.check_runs }) }))
    expect(runs.payload.checks).toEqual([{ context: "build-status", state: "success" }])
    expect(runs.payload.readLimits).toBeUndefined()
    await runs.controller.dispose()
  })

  test("a refused FIRST page is still the tab's refusal, with no rows to keep", async () => {
    const { payload, controller } = await prCard(tabsBackend({
      [`${githubPulls}/2/commits`]: (request) =>
        pageOf(request).get("page") === "1" ? json(403, { code: "github_permission", message: "GitHub access denied" }) : json(200, commitPage(100, 1))
    }))
    expect(payload.commits).toBeUndefined()
    expect(payload.readErrors?.commits ?? "").toContain("Commits unavailable (")
    expect(payload.readLimits?.commits).toBeUndefined()
    await controller.dispose()
  })

  test("every tab the card offers can be selected", async () => {
    const { store, controller } = await ready(tabsBackend())
    expect((await controller.commands.run("pr", "2 will/flows")).status).toBe("executed")
    for (const tab of ["commits", "checks", "files", "conversation"] as const) {
      expect((await controller.commands.run("prs.tab", `pr-will/flows-2 ${tab}`)).status).toBe("executed")
      const card = store.collections.cards.get("pr-will/flows-2")
      expect(card?.kind === "pr" ? card.payload.tab : undefined).toBe(tab)
    }
    await controller.dispose()
  })
})

test("a saved PR form keeps its identity and explicit repository when submitted through the canonical door", async () => {
  const { store, controller } = await ready(backend({ [`${LANDINGS}/3`]: json(200, landing(3, "open")) }))
  const id = "form-prs.view"
  await store.dispatch({ type: "card.upsert", actor: "user", card: {
    id, kind: "flow-form", title: "Open pull request", status: "active", createdAt: 1, ordinal: 1,
    payload: { flow: "prs.view", via: "user", fields: [{ name: "number", label: "Number", kind: "number", required: true }], draft: { number: "3" }, given: { repo: "will/flows" } }
  } }).isPersisted.promise
  expect((await controller.commands.run("form.submit", id)).status).toBe("executed")
  expect(store.collections.cards.get(id)).toMatchObject({ id, status: "acted", payload: { flow: "pr", given: { repo: "will/flows" } } })
  expect(store.collections.cards.get("pr-will/flows-3")).toMatchObject({ payload: { number: 3, repo: "will/flows" } })
  await controller.dispose()
})
