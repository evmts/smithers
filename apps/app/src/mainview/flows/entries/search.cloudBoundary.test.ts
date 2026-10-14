/*
 * The human's `search.issues` on the bootstrap production serves, past the
 * first answer.
 *
 * ROOT, 2026-10-14 15:54Z on UI a43386ec (the commit that gave the issues
 * index its live tracker read): with a Search card already on the screen from
 * an earlier run of the same query, `/search.issues
 * Overnight-browser-20261014-0017` for a Cloud issue the repository really
 * holds answered `0 results` and "No results for …", and so did "Search
 * again". The rows were the ones the card already carried: the seam upserts
 * its card ONLY on the answering path, so a run whose live read refused — or
 * whose repository could not be resolved — returned its sentence and left the
 * previous run's card standing. A stale count then reads as this run's
 * answer, and a refusal the person never sees cannot be told apart from an
 * empty tracker.
 *
 * Both tests below drive the real controller on the real bootstrap: the same
 * door the person's composer reaches (`parseSubmit` → `commands.run`), the
 * same seam wiring, and the repository's own wire shapes.
 */
import { expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import type { AppServices } from "../../state/AppController"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"
import { json, memoryStorage, unavailableAgent } from "../../state/TestFixtures"

const REPO = "roninjin10/e2e-verify"
const TITLE = "Overnight-browser-20261014-0017"
const ISSUES = "/api/repos/roninjin10/e2e-verify/issues"

/** What https://smithers.sh/api/bootstrap answered on 2026-10-14, verbatim. */
const HOSTED: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "1.0.0-rc.6", buildSha: "46187b049e7f5ca9b9f6492ebae8b5334ef883a0",
  capabilities: ["identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select",
    "cloud", "cloud.terminal", "billing.balance", "billing.overview", "billing.plans", "billing.portal", "billing.checkout"],
  authFlow: "redirect", sandbox: { platform: "linux", mode: "enforced" }
}

/* Plue's issue wire shape (multi src/smithersCloud/issues.ts). */
const cloudIssue = {
  id: 500, number: 5, title: TITLE, body: "Reproduction", state: "open", kind: "issue", visibility: "public",
  labels: [], assignees: [], author: { id: 8, login: "roninjin10" }, milestone_id: null, comment_count: 1,
  created_at: "2026-10-14T00:17:00Z", updated_at: "2026-10-14T00:20:00Z", closed_at: null
}

const CLOUD_ROUTES: Record<string, unknown> = {
  [`GET ${ISSUES}`]: [cloudIssue],
  [`GET /api/repos/roninjin10/e2e-verify/issue-views`]: [],
  [`GET /api/user/github-repos/roninjin10/e2e-verify/issues`]: []
}

/** The hosted app on the production bootstrap, with routes the test may swap between runs. */
const hosted = async (routes: Record<string, unknown>, bootstrap: AppBootstrap = HOSTED) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: string[] = []
  let answering = routes
  let signOutMidRead = false
  const services: AppServices = {
    bootstrap,
    toastDebounceMs: 0,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://smithers.sh")
      const method = (init?.method ?? "GET").toUpperCase()
      calls.push(`${method} ${url.pathname}`)
      if (signOutMidRead) {
        signOutMidRead = false
        await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-out", login: null, admin: false, scopesPlain: null }).isPersisted.promise
      }
      const answer = answering[`${method} ${url.pathname}`]
      return answer === undefined ? json(404, { status: "error", code: "not_found", message: `no stub for ${method} ${url.pathname}` }) : json(200, answer)
    }
  }
  const controller = createAppController(store, unavailableAgent, services)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "roninjin10", ownerKind: "user", name: "e2e-verify", head: { bookmark: "main", changeId: "c", commitId: "k" } }
  ] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: REPO }).isPersisted.promise
  calls.length = 0
  return {
    store, controller, calls,
    serve: (next: Record<string, unknown>) => { answering = next },
    /** The owner goes away while the next route read is in flight. */
    signOutOnNextRead: () => { signOutMidRead = true }
  }
}

/** The rows and the sentence the search card carries, as the person reads them. */
const searchCard = (store: Awaited<ReturnType<typeof hosted>>["store"]) => {
  const card = store.collections.cards.get("search-search.issues")
  return card?.kind === "search-results"
    ? { items: card.payload.items.map(item => item.ref), refusal: card.payload.refusal }
    : undefined
}

test("a search whose tracker refuses retires the rows the previous search left on the screen", async () => {
  const h = await hosted({ ...CLOUD_ROUTES })
  try {
    /* The person's first run: the tracker answers, the card carries its row. */
    expect(await h.controller.runCommandForResult("search.issues", TITLE)).toMatchObject({ status: "executed" })
    expect(searchCard(h.store)).toMatchObject({ items: ["5"] })

    /* The same query again while the tracker refuses: nothing listed those rows now. */
    h.serve({})
    h.calls.length = 0
    const again = await h.controller.runCommandForResult("search.issues", TITLE)
    expect(again).toMatchObject({ status: "failed" })
    expect(h.calls).toContain(`GET ${ISSUES}`)
    const card = searchCard(h.store)
    /* The stale row must not stand as this run's answer, and the refusal is stated, never "No results". */
    expect(card?.items).toEqual([])
    expect(card?.refusal ?? "").not.toBe("")
    expect(card?.refusal ?? "").not.toContain("No results")
  } finally { await h.controller.dispose() }
})

test("a tracker that answered none still says No results, and the earlier query's rows do not survive it", async () => {
  const h = await hosted({ ...CLOUD_ROUTES })
  try {
    expect(await h.controller.runCommandForResult("search.issues", TITLE)).toMatchObject({ status: "executed" })
    expect(searchCard(h.store)).toMatchObject({ items: ["5"] })

    /* The control: the tracker listed its rows and none of them is this query. That emptiness IS an answer. */
    h.calls.length = 0
    expect(await h.controller.runCommandForResult("search.issues", "no-issue-carries-this-title")).toMatchObject({ status: "executed" })
    expect(h.calls).toContain(`GET ${ISSUES}`)
    const card = searchCard(h.store)
    expect(card?.items).toEqual([])
    expect(card?.refusal).toBeUndefined()
  } finally { await h.controller.dispose() }
})

/*
 * ROOT, 2026-10-14 14:56Z, same serving build: `/flows` with no argument
 * listed "List the repository's flows" in the palette, and Return left the
 * screen unchanged — no card, no empty state, no refusal. The handler's
 * fallback is `actions.flowCards()`, which off an install reads the SEEDED
 * design world; with the design fixture off that world holds no flow
 * versions at all, so the door answered "0 flows" about a repository whose
 * flows it never asked for. One condition (`install`) standing in for the
 * door, the same shape as #3879 and #3891.
 */
test("the hosted app's /flows asks the Cloud catalog, and never claims a count from the seeded world", async () => {
  const h = await hosted({ ...CLOUD_ROUTES })
  try {
    expect(h.controller.design.enabled).toBe(false)
    const outcome = await h.controller.runCommandForResult("flows")
    /* The catalog door states where it stands; it never answers a count for a read it did not take. */
    expect(outcome).toMatchObject({ status: "failed" })
    expect(outcome.status === "failed" ? outcome.error : "").not.toContain("flows")
    expect(outcome.status === "failed" ? outcome.error : "").not.toBe("")
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("design:"))).toEqual([])
  } finally { await h.controller.dispose() }
})

/*
 * The host the Cloud catalog read must NOT reach: the Bun host in offline
 * mode serves a bootstrap with neither `install` nor `cloud` and has no flow
 * catalog at all. It states that, and asks no route — the fence #3891 put
 * under the issues index, kept here.
 */
test("a host that declares neither flows door states it, and asks for nothing", async () => {
  const h = await hosted({ ...CLOUD_ROUTES }, { ...HOSTED, capabilities: HOSTED.capabilities.filter(capability => capability !== "cloud") })
  try {
    expect(h.controller.design.enabled).toBe(false)
    const outcome = await h.controller.runCommandForResult("flows")
    expect(outcome).toMatchObject({ status: "failed", error: "Flows unavailable" })
    expect(h.calls).toEqual([])
  } finally { await h.controller.dispose() }
})

/*
 * The other half of the same rule, from review: a run the screen no longer
 * belongs to paints NOTHING. `captureCloudOwner`'s contract is that sign-out
 * and account changes RETIRE pending work, so a refusal that arrives after
 * the owner changed must not stamp the next person's screen with the previous
 * one's search.
 */
test("a search whose owner signed out mid-read paints no refusal on the screen it left", async () => {
  const h = await hosted({ ...CLOUD_ROUTES })
  try {
    expect(await h.controller.runCommandForResult("search.issues", TITLE)).toMatchObject({ status: "executed" })
    expect(searchCard(h.store)).toMatchObject({ items: ["5"] })

    /* The tracker is asked, and the owner is gone before its answer lands. */
    h.serve({})
    h.calls.length = 0
    h.signOutOnNextRead()
    await h.controller.runCommandForResult("search.issues", TITLE)
    expect(h.calls).toContain(`GET ${ISSUES}`)
    /*
     * Signing out retires the screen the search was for, cards and all. The
     * superseded run wrote nothing, so no refusal of the previous owner's
     * search stands on the retired screen.
     */
    expect(searchCard(h.store)).toBeUndefined()
  } finally { await h.controller.dispose() }
})
