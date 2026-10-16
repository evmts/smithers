import type { StorageApi } from "@tanstack/db"
import { describe, expect, test } from "bun:test"
import { createAppStore } from "../AppStore"
import { createGitHubRepoCreateSeam, GITHUB_REPO_CREATE_PATH, GITHUB_REPO_REQUEST_PATH } from "./GitHubRepoCreateSeam"
import type { SeamContext } from "./SeamContext"

/*
 * The launcher's Create against the REAL GitHub create door
 * (`POST /api/user/github-repos`, services/github_user_repo_create.go): the
 * acknowledgment is an operation, so this seam reads the operation until it
 * settles, reports the repository only when the server read it back, and
 * never repeats a POST whose fate the server called uncertain.
 */

const memoryStorage = (): StorageApi => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key)
  }
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const ACCEPTED = { operationId: "op-1", requestId: "key-1", kind: "requested", state: "accepted", acceptedAt: "2026-10-16T00:00:00Z" }

const harness = async (route: (path: string, method: string) => Response | Promise<Response>) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: Array<string> = []
  const ctx: SeamContext = {
    http: async (input, init) => {
      const method = init?.method ?? "GET"
      const path = input.startsWith("/") ? input.slice(1) : input
      calls.push(`${method} ${path}`)
      return route(path, method)
    },
    baseUrl: "",
    store,
    dispatch: store.dispatch,
    actor: () => "user",
    nextOrdinal: () => 0
  }
  return { store, ctx, calls, seam: createGitHubRepoCreateSeam(ctx, { pollMs: 0, attempts: 4 }) }
}

const created = "api" + GITHUB_REPO_CREATE_PATH
const receipt = (id: string) => `api${GITHUB_REPO_REQUEST_PATH}/${id}`

describe("the launcher's GitHub create", () => {
  test("posts once, then reports the repository the server read back", async () => {
    const { calls, seam } = await harness((path, method) => {
      if (path === created && method === "POST") return json(202, ACCEPTED)
      if (path === receipt("op-1")) {
        return json(200, { operation_id: "op-1", state: "completed", stage: "readback", full_name: "octo/widget", repository_id: 909 })
      }
      return json(404, {})
    })
    await expect(seam.createGitHubRepository("widget")).resolves.toEqual({
      value: "Created octo/widget on GitHub. Smithers hasn't imported it yet — open /octo/widget to import it."
    })
    expect(calls).toEqual([`POST ${created}`, `GET ${receipt("op-1")}`])
  })

  test("the request names a repository name and nothing else: no owner, token, URL or key", async () => {
    let body: unknown = null
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const ctx: SeamContext = {
      http: async (input, init) => {
        if (init?.method === "POST") body = JSON.parse(String(init.body))
        return input.includes(GITHUB_REPO_CREATE_PATH) && init?.method === "POST"
          ? json(202, ACCEPTED)
          : json(200, { operation_id: "op-1", state: "completed", full_name: "octo/widget" })
      },
      baseUrl: "", store, dispatch: store.dispatch, actor: () => "user", nextOrdinal: () => 0
    }
    await createGitHubRepoCreateSeam(ctx, { pollMs: 0 }).createGitHubRepository("widget")
    expect(body).toEqual({ name: "widget" })
  })

  test("polls while the operation is still running", async () => {
    const states = ["accepted", "running", "completed"]
    let read = 0
    const { calls, seam } = await harness((path, method) => {
      if (path === created && method === "POST") return json(202, ACCEPTED)
      const state = states[Math.min(read++, states.length - 1)]!
      return json(200, { operation_id: "op-1", state, ...(state === "completed" ? { full_name: "octo/widget" } : {}) })
    })
    await expect(seam.createGitHubRepository("widget")).resolves.toEqual({
      value: "Created octo/widget on GitHub. Smithers hasn't imported it yet — open /octo/widget to import it."
    })
    expect(calls.filter(call => call.startsWith("POST"))).toHaveLength(1)
    expect(calls.filter(call => call.startsWith("GET"))).toHaveLength(3)
  })

  test("an uncertain create is reported as unconfirmed and never posted again", async () => {
    const { calls, seam } = await harness((path, method) =>
      path === created && method === "POST"
        ? json(202, ACCEPTED)
        : json(200, { operation_id: "op-1", state: "uncertain", code: "github_create_uncertain", external_attempt: 1 }))
    await expect(seam.createGitHubRepository("widget")).resolves.toBe(
      "Smithers couldn't confirm whether widget was created on GitHub, so it did not try again. Check your GitHub account before creating it a second time."
    )
    expect(calls.filter(call => call.startsWith("POST"))).toHaveLength(1)
  })

  test.each([
    ["repository_exists", "Your GitHub account already has a repository named widget. Nothing was created."],
    ["reauthorize_github", "GitHub didn't accept the credential linked to this account. Sign in with GitHub again, then create widget."],
    ["github_permission", "GitHub refused to create a repository for your account."],
    ["actor_changed", "The signed-in GitHub account changed, so widget was not created."],
    ["readback_mismatch", "GitHub answered with a different repository, so Smithers won't report widget as created."],
    ["rate_limited", "GitHub is rate-limiting this account, so widget was not created. Try again in a few minutes."],
    ["invalid_request", "GitHub didn't create widget."]
  ])("a %s refusal reports its own act and no repository", async (code, sentence) => {
    const { seam } = await harness((path, method) =>
      path === created && method === "POST"
        ? json(202, ACCEPTED)
        : json(200, { operation_id: "op-1", state: "failed", code }))
    await expect(seam.createGitHubRepository("widget")).resolves.toBe(sentence)
  })

  test("a completed operation with no repository claims none", async () => {
    const { seam } = await harness((path, method) =>
      path === created && method === "POST" ? json(202, ACCEPTED) : json(200, { operation_id: "op-1", state: "completed" }))
    await expect(seam.createGitHubRepository("widget")).resolves.toBe(
      "GitHub reported the repository was created, but Smithers couldn't read which one. Check your GitHub account."
    )
  })

  test("a refused create answers the backend's own refusal and reads no receipt", async () => {
    const { calls, seam } = await harness((path, method) =>
      path === created && method === "POST" ? json(403, { code: "forbidden", message: "Repository creation is not allowed." }) : json(200, {}))
    await expect(seam.createGitHubRepository("widget")).resolves.toContain("Repository creation is not allowed.")
    expect(calls).toEqual([`POST ${created}`])
  })

  test("an unreadable admission reports nothing created", async () => {
    const { seam } = await harness((path, method) => path === created && method === "POST" ? json(202, { state: "accepted" }) : json(200, {}))
    await expect(seam.createGitHubRepository("widget")).resolves.toBe("Smithers couldn't read the repository request it just made.")
  })

  test("an unreadable receipt states that, never a repository", async () => {
    const { seam } = await harness((path, method) => path === created && method === "POST" ? json(202, ACCEPTED) : json(200, { operation_id: "op-1" }))
    await expect(seam.createGitHubRepository("widget")).resolves.toBe("Smithers couldn't read what became of the repository request.")
  })

  test("a create still running when the reads run out says so, and repeats no POST", async () => {
    const { calls, seam } = await harness((path, method) =>
      path === created && method === "POST" ? json(202, ACCEPTED) : json(200, { operation_id: "op-1", state: "running" }))
    await expect(seam.createGitHubRepository("widget")).resolves.toBe(
      "Creating widget on GitHub is still running. Nothing was repeated; read it again in a moment."
    )
    expect(calls.filter(call => call.startsWith("POST"))).toHaveLength(1)
    expect(calls.filter(call => call.startsWith("GET"))).toHaveLength(4)
  })

  test("an account change while the create runs leaves the receipt on the server", async () => {
    const { seam, store, calls } = await harness((path, method) =>
      path === created && method === "POST" ? json(202, ACCEPTED) : json(200, { operation_id: "op-1", state: "running" }))
    await store.dispatch({
      type: "identity.session.loaded", actor: "system", state: "signed-in", login: "alice", admin: false, scopesPlain: null
    }).isPersisted.promise
    const pending = seam.createGitHubRepository("widget")
    await store.dispatch({
      type: "identity.session.loaded", actor: "system", state: "signed-out", login: null, admin: false, scopesPlain: null
    }).isPersisted.promise
    /*
     * Whichever guard the change lands on, the answer names the change rather
     * than this account's repository, and nothing is posted a second time.
     */
    await expect(pending).resolves.toContain("The account changed")
    expect(calls.filter(call => call.startsWith("POST"))).toHaveLength(1)
  })
})
