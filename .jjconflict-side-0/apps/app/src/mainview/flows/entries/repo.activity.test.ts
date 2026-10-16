/*
 * #3889. The Activity door a person can actually reach, and what it says on
 * the bootstrap production serves.
 *
 * There is no `/activity` flow — the native palette says so, and this pins it
 * — so Activity is `repo.overview`: the repository pane's home, the card's own
 * Refresh (cards/RepositoryUpdateCard.tsx, which passes the CARD's repository,
 * so a repo-bound card stays on its repository), and the hidden name a person
 * may type. Freshly invoked it reads the SELECTED repository, and with the
 * notifications feature off (plue#675) and the GitHub-source door asked in its
 * own query vocabulary it states the activity it read instead of "Some
 * repository activity could not be checked".
 */
import { expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import type { AppServices } from "../../state/AppController"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"
import { json, memoryStorage, unavailableAgent } from "../../state/TestFixtures"

const REPO = "roninjin10/e2e-verify"
const OTHER = "smithersai/smithers-test-workflow"
const HOSTED: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "1.0.0-rc.5", buildSha: "c6c360ddca963cf23c13c3e512e554f0a7af2dbf",
  capabilities: ["identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select", "cloud"],
  authFlow: "redirect", sandbox: { platform: "linux", mode: "enforced" }
}
const cloudIssue = (number: number, title: string) => ({
  id: 500 + number, number, title, body: "", state: "open", kind: "issue", visibility: "public", labels: [], assignees: [],
  author: { id: 8, login: "roninjin10" }, milestone_id: null, comment_count: 0,
  created_at: "2026-10-14T00:17:00Z", updated_at: "2026-10-14T00:20:00Z", closed_at: null
})

/** The backend's own query allowlist for the GitHub-source door (services/github_repo_metadata.go). */
const GITHUB_QUERY = new Set(["state", "sort", "direction", "per_page", "page", "cursor", "labels"])

const hosted = async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: string[] = []
  const services: AppServices = {
    bootstrap: HOSTED, toastDebounceMs: 0,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://smithers.sh")
      const method = (init?.method ?? "GET").toUpperCase()
      calls.push(`${method} ${url.pathname}`)
      if (method !== "GET") return json(405, { status: "error", code: "forbidden", message: "the overview writes nothing" })
      /* The feature the launch contract keeps off answers the gate's own 403. */
      if (url.pathname === "/api/notifications/list") return json(403, { status: "error", code: "forbidden", message: "feature not available" })
      if (url.pathname.startsWith("/api/user/github-repos/")) {
        for (const key of url.searchParams.keys()) {
          if (!GITHUB_QUERY.has(key)) return json(400, { status: "error", code: "bad_request", message: "unsupported github repository metadata query parameter" })
        }
        return json(200, [])
      }
      if (url.pathname === `/api/repos/${REPO}/issues`) return json(200, url.searchParams.get("state") === "open" ? [cloudIssue(5, "Overnight-browser-20261014-0017")] : [])
      if (url.pathname === `/api/repos/${OTHER}/issues`) return json(200, [])
      if (url.pathname.endsWith("/landings")) return json(200, [])
      return json(404, { status: "error", code: "not_found", message: `no stub for ${method} ${url.pathname}` })
    }
  }
  const controller = createAppController(store, unavailableAgent, services)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "roninjin10", ownerKind: "user", name: "e2e-verify", head: { bookmark: "main", changeId: "c", commitId: "k" } },
    { id: OTHER, org: "smithersai", ownerKind: "org", name: "smithers-test-workflow", head: null }
  ] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: REPO }).isPersisted.promise
  calls.length = 0
  return { store, controller, calls }
}

const activity = (store: Awaited<ReturnType<typeof hosted>>["store"], repo: string) =>
  [...store.collections.cards.values()].find(card => card.kind === "repo-update" && card.payload.repo === repo)

test("there is no /activity flow; the door is repo.overview, and fresh it reads the selected repository", async () => {
  const h = await hosted()
  try {
    expect(await h.controller.runCommandForResult("activity")).toMatchObject({ status: "unknown-command" })
    const outcome = await h.controller.runCommandForResult("repo.overview")
    expect(outcome).toMatchObject({ status: "executed" })
    const card = activity(h.store, REPO)
    expect(card).toMatchObject({ kind: "repo-update", title: "Activity", payload: { repo: REPO, problems: [], openIssues: 1, openPrs: 0 } })
    expect(card?.kind === "repo-update" ? card.payload.summary : "").not.toContain("could not be checked")
  } finally { await h.controller.dispose() }
})

test("a card bound to another repository keeps its own repository when it refreshes", async () => {
  const h = await hosted()
  try {
    /* What the card's Refresh does: cards/RepositoryUpdateCard.tsx passes the card's repo, never the selection. */
    expect(await h.controller.runCommandForResult("repo.overview", OTHER)).toMatchObject({ status: "executed" })
    expect(activity(h.store, OTHER)).toMatchObject({ payload: { repo: OTHER, problems: [], openIssues: 0, openPrs: 0 } })
    expect(activity(h.store, REPO)).toBeUndefined()
    /* And the selection's own card is a different card, not a reattribution of that one. */
    expect(await h.controller.runCommandForResult("repo.overview")).toMatchObject({ status: "executed" })
    expect(activity(h.store, OTHER)).toMatchObject({ payload: { repo: OTHER } })
    expect(activity(h.store, REPO)).toMatchObject({ payload: { repo: REPO, openIssues: 1 } })
  } finally { await h.controller.dispose() }
})
