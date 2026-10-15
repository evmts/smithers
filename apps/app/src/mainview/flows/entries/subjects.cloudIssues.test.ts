/*
 * #3879. The canonical `/issue` and `/issues` on the bootstrap production
 * actually serves.
 *
 * The person's journey (roninjin10/e2e-verify, 2026-10-14): the Commands card
 * offers `/issue` and `/issues` to a hosted Cloud user whose repository holds
 * Smithers Cloud issue #5 `Overnight-browser-20261014-0017`.
 * `/issues.view 5 roninjin10/e2e-verify` opened it, while `/issue 5` answered
 * "No issue #5" and `/issues` opened an empty mock list: both handlers read
 * the seeded design world unless the host holds `install`, and
 * https://smithers.sh/api/bootstrap serves `cloud` with the design FIXTURE
 * off.
 *
 * The doors are the ones `issues.view` and `issues.list` already declare in
 * `runtimeAny` — `cloud` and `install`, never the fixture — and the seam
 * fences below them stay exactly where they were. Same class as #3865.
 */
import { expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import type { AppServices } from "../../state/AppController"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"
import { json, memoryStorage, unavailableAgent } from "../../state/TestFixtures"

const REPO = "roninjin10/e2e-verify"
const TITLE = "Overnight-browser-20261014-0017"

/** What https://smithers.sh/api/bootstrap answered on 2026-10-14, verbatim. */
const HOSTED: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "1.0.0-rc.5", buildSha: "c6c360ddca963cf23c13c3e512e554f0a7af2dbf",
  capabilities: ["identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select",
    "cloud", "cloud.terminal", "billing.balance", "billing.overview", "billing.plans", "billing.portal", "billing.checkout"],
  authFlow: "redirect", sandbox: { platform: "linux", mode: "enforced" }
}
/** The same origin with the Cloud issues turned off, and the single-owner install. */
const WITHOUT_CLOUD: AppBootstrap = { ...HOSTED, capabilities: HOSTED.capabilities.filter(capability => capability !== "cloud") }
const INSTALL: AppBootstrap = { ...HOSTED, capabilities: [...HOSTED.capabilities, "install"] }

/** The Cloud issue root of the repository the person is watching. */
const ISSUES = `/api/repos/roninjin10/e2e-verify/issues`

/* Plue's issue and comment wire shapes (multi src/smithersCloud/issues.ts). */
const cloudIssue = {
  id: 500, number: 5, title: TITLE, body: "Reproduction", state: "open", kind: "issue", visibility: "public",
  labels: [], assignees: [], author: { id: 8, login: "roninjin10" }, milestone_id: null, comment_count: 1,
  created_at: "2026-10-14T00:17:00Z", updated_at: "2026-10-14T00:20:00Z", closed_at: null
}
const cloudComment = {
  id: 9, issue_id: 500, user_id: 8, commenter: "roninjin10", body: "Still reproducing", type: "comment",
  created_at: "2026-10-14T00:19:00Z", updated_at: "2026-10-14T00:19:00Z"
}

/** The install's own issue door (GET /api/issues/{n}), GitHub's wire. */
const installIssue = {
  issue: { number: 5, title: TITLE, body: "Reproduction", state: "open", user: { login: "roninjin10" }, labels: [], comments: 0 },
  comments: []
}

const hosted = async (options: { readonly bootstrap?: AppBootstrap | undefined; readonly routes?: Record<string, unknown> } = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: string[] = []
  const routes = options.routes ?? {}
  /* The operational sink the diagnostics ring forwards to; nothing here reaches the screen. */
  const diagnostics: Array<{ kind: string; body: string }> = []
  const services: AppServices = {
    ...("bootstrap" in options && options.bootstrap === undefined ? {} : { bootstrap: options.bootstrap ?? HOSTED }),
    clientErrors: { report: (kind, error) => void diagnostics.push({ kind, body: String(error) }), reported: () => diagnostics.length },
    toastDebounceMs: 0,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://smithers.sh")
      const method = (init?.method ?? "GET").toUpperCase()
      calls.push(`${method} ${url.pathname}`)
      const answer = routes[`${method} ${url.pathname}`]
      if (answer === undefined) return json(404, { status: "error", code: "not_found", message: `no stub for ${method} ${url.pathname}` })
      /* A route may answer a whole Response, so a test can state a real status and headers. */
      return answer instanceof Response ? answer.clone() : json(200, answer)
    }
  }
  const controller = createAppController(store, unavailableAgent, services)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "roninjin10", ownerKind: "user", name: "e2e-verify", head: { bookmark: "main", changeId: "c", commitId: "k" } }
  ] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: REPO }).isPersisted.promise
  calls.length = 0
  diagnostics.length = 0
  return { store, controller, calls, diagnostics }
}

/** The issue index door's own records, in order. */
const issueIndexRecords = (diagnostics: ReadonlyArray<{ kind: string; body: string }>): ReadonlyArray<string> =>
  diagnostics.filter(entry => entry.kind === "operational" && entry.body.includes("issues.index"))
    .map(entry => (JSON.parse(entry.body) as { subject?: string }).subject ?? "")

const cloudRoutes = {
  [`GET ${ISSUES}`]: [cloudIssue],
  [`GET ${ISSUES}/5`]: cloudIssue,
  [`GET ${ISSUES}/5/comments`]: [cloudComment],
  [`GET /api/repos/roninjin10/e2e-verify/issue-views`]: [],
  [`GET /api/user/github-repos/roninjin10/e2e-verify/issues`]: []
}

test("the hosted app's canonical /issue opens the repository's own Cloud issue, with its body and comments", async () => {
  const h = await hosted({ routes: cloudRoutes })
  try {
    /* Production shape: the host serves the issues, the seeded design world is off. */
    expect(h.controller.design.enabled).toBe(false)
    const outcome = await h.controller.runCommandForResult("issue", "5")
    expect(outcome).toMatchObject({ status: "executed" })
    expect(h.store.collections.cards.get(`issue-${REPO}-5`)).toMatchObject({ kind: "issue", payload: {
      repo: REPO, number: 5, title: TITLE, state: "open", author: "roninjin10", issueBody: "Reproduction",
      comments: [{ author: "roninjin10", commentBody: "Still reproducing" }]
    } })
    /* The Cloud source answered it; no design card was opened. */
    expect(h.calls).toEqual([`GET ${ISSUES}/5`, `GET ${ISSUES}/5/comments`])
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("design:"))).toEqual([])
  } finally { await h.controller.dispose() }
})

test("the hosted app's canonical /issues lists that repository's own Cloud issues", async () => {
  const h = await hosted({ routes: cloudRoutes })
  try {
    const outcome = await h.controller.runCommandForResult("issues")
    expect(outcome).toMatchObject({ status: "executed" })
    const card = h.store.collections.cards.get(`issues-${REPO}`)
    expect(card).toMatchObject({ kind: "issue-list", payload: { repo: REPO, filter: "open" } })
    expect(card?.kind === "issue-list" ? card.payload.issues : []).toMatchObject([{ number: 5, title: TITLE, source: "smithers-cloud" }])
    expect(h.calls).toContain(`GET ${ISSUES}`)
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("design:"))).toEqual([])
  } finally { await h.controller.dispose() }
})

test("an install keeps its GitHub-App issue door, and reaches no Cloud issue route", async () => {
  const h = await hosted({ bootstrap: INSTALL, routes: { "GET /api/issues/5": installIssue } })
  try {
    expect(await h.controller.runCommandForResult("issue", "5")).toMatchObject({ status: "executed" })
    expect(h.store.collections.cards.get(`issue-github-${REPO}-5`)).toMatchObject({ kind: "issue", payload: { number: 5, title: TITLE } })
    expect(h.calls).toEqual(["GET /api/issues/5"])
  } finally { await h.controller.dispose() }
})

test("the seeded design preview still answers both commands, and asks no backend for them", async () => {
  const h = await hosted({ bootstrap: undefined })
  try {
    expect(h.controller.design.enabled).toBe(true)
    expect(await h.controller.runCommandForResult("issue", "#231")).toMatchObject({ status: "executed" })
    expect(h.store.collections.cards.get("design:issue:231")?.kind).toBe("issue")
    expect(await h.controller.runCommandForResult("issues")).toMatchObject({ status: "executed" })
    expect(h.store.collections.cards.get("design:issues")?.kind).toBe("issue-list")
    expect(h.calls).toEqual([])
  } finally { await h.controller.dispose() }
})

test("a host that serves neither Cloud issues nor an install is unchanged, and asks for nothing", async () => {
  const h = await hosted({ bootstrap: WITHOUT_CLOUD, routes: cloudRoutes })
  try {
    expect(await h.controller.runCommandForResult("issue", "5")).toEqual({ status: "failed", error: "No issue #5" })
    expect(h.calls).toEqual([])
  } finally { await h.controller.dispose() }
})

test("a number the repository's tracker does not have is refused by the source, not by the mock", async () => {
  const h = await hosted({ routes: {} })
  try {
    /*
     * The tracker's own 404 (plue pkg/errors NotFound, restated by the Worker)
     * reaches the person as the seam's sentence, which names the GitHub door —
     * where the mock answered a bare "No issue #999" for an issue it never read.
     */
    const outcome = await h.controller.runCommandForResult("issue", "999")
    expect(outcome).toMatchObject({ status: "failed" })
    expect(outcome.status === "failed" ? outcome.error : "").toBe(
      `Issue #999 in ${REPO} was not found. For a GitHub issue, use /issues.view 999 ${REPO} --source github.`
    )
    expect(h.calls).toEqual([`GET ${ISSUES}/999`])
  } finally { await h.controller.dispose() }
})

/*
 * #3891. `/search.issues` on the same bootstrap.
 *
 * 2026-10-14 06:50Z, same repository and same session: the person had read
 * `/issues` (four open rows, #5 `Overnight-browser-20261014-0017`) nine
 * minutes earlier, then navigated the pane to a pull request. `search.issues`
 * for that exact title answered `0 results` and
 * "No results for Overnight-browser-20261014-0017" — a read claimed about the
 * repository's tracker that was never asked of it. The issues index was the
 * cards still on the screen, and nothing else; `secrets` and `history` have
 * taken a live read before answering since the seam was written.
 */
test("the hosted app's /search.issues asks the repository's own tracker, not the cards left on the screen", async () => {
  const h = await hosted({ routes: cloudRoutes })
  try {
    /* Production's state at 06:50Z: no issue card was on the screen any more. */
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("issues-") || id.startsWith("issue-"))).toEqual([])
    const outcome = await h.controller.runCommandForResult("search.issues", TITLE)
    expect(outcome).toMatchObject({ status: "executed" })
    const value = JSON.parse(outcome.status === "executed" ? outcome.value ?? "{}" : "{}") as { count: number; items: ReadonlyArray<{ kind: string; ref: string; title: string }> }
    expect(value.count).toBe(1)
    expect(value.items).toMatchObject([{ kind: "issue", ref: "5", title: `#5 ${TITLE}` }])
    expect(h.calls).toContain(`GET ${ISSUES}`)
    const card = h.store.collections.cards.get("search-search.issues")
    expect(card?.kind === "search-results" ? card.payload.items.map(item => item.ref) : []).toEqual(["5"])
  } finally { await h.controller.dispose() }
})

test("a tracker that refuses the read is stated, never restated as an empty result", async () => {
  const h = await hosted({ routes: {} })
  try {
    /*
     * Nothing answers: the tracker 404s, the GitHub source it degrades to
     * refuses too, and the person reads that refusal. "No results" would be a
     * claim about rows no door ever listed.
     */
    const outcome = await h.controller.runCommandForResult("search.issues", TITLE)
    expect(outcome).toMatchObject({ status: "failed" })
    expect(outcome.status === "failed" ? outcome.error : "").not.toContain("No results")
    expect(h.calls).toContain(`GET ${ISSUES}`)
    expect(h.store.collections.cards.get("search-search.issues")).toBeUndefined()
  } finally { await h.controller.dispose() }
})

test("the seeded design preview still searches its own world and asks no backend for it", async () => {
  const h = await hosted({ bootstrap: undefined })
  try {
    expect(h.controller.design.enabled).toBe(true)
    expect(await h.controller.runCommandForResult("issues")).toMatchObject({ status: "executed" })
    h.calls.length = 0
    const outcome = await h.controller.runCommandForResult("search.issues", "design")
    expect(outcome).toMatchObject({ status: "executed" })
    expect(h.calls).toEqual([])
  } finally { await h.controller.dispose() }
})

/*
 * #3891 again, on the host the live read must NOT reach. `search.issues`'s
 * live index is the issues door's own read, so it belongs to the hosts that
 * declare that door — `install` and `cloud` — exactly as `hostIssues()` fences
 * `/issue` and `/issues` above it. The design FIXTURE being off is not the
 * same question: the Bun host in offline mode (`apps/app/src/bun/server.ts`,
 * `cloud: cloudUpstream !== null`) serves a bootstrap with neither capability
 * and no tracker at all, and `/issue 5` there asks for nothing. A search that
 * asks anyway reaches a route the host does not serve and reads its 404 back
 * to the person as the tracker's answer — the mirror of #3879 and #3831, where
 * one condition stood in for the door.
 */
test("a host that serves neither Cloud issues nor an install is not asked for an issue index either", async () => {
  const h = await hosted({ bootstrap: WITHOUT_CLOUD, routes: cloudRoutes })
  try {
    expect(h.controller.design.enabled).toBe(false)
    const outcome = await h.controller.runCommandForResult("search.issues", TITLE)
    expect(h.calls).toEqual([])
    expect(outcome).toMatchObject({ status: "executed" })
    expect(outcome.status === "executed" ? outcome.value ?? "" : "").not.toContain("failed (404)")
  } finally { await h.controller.dispose() }
})

/*
 * #3891's remaining half, reproduced on 2026-10-15 against the same
 * repository: `/search.issues Overnight-browser-20261014-0017` answered
 * `0 results` with NO refusal, while `/issue 5` opened that exact issue in
 * the same session. One list read serves both doors, and that read already
 * knows the difference — `issueListRead` puts the GitHub source's own
 * refusal on the card (`payload.github.refusal`) beside the rows it did
 * establish. The search index door, `readIssueRows`, took the rows alone,
 * so a repository whose own tracker is correctly empty and whose GitHub
 * source REFUSED came back as an empty array: indistinguishable, one line
 * later, from a tracker that listed nothing.
 *
 * "0 results" is a claim that the doors answered and held nothing. A door
 * that refused has made no such claim, so the sentence is the answer — the
 * rule `secrets` and `history` have followed in this seam since it was
 * written, and the one the list CARD already followed in its own value.
 */
const GITHUB_SOURCE = `/api/user/github-repos/roninjin10/e2e-verify/issues`

test("a GitHub source that refuses while the tracker is empty is stated, not answered as 0 results", async () => {
  const h = await hosted({ routes: {
    [`GET ${ISSUES}`]: [],
    [`GET /api/repos/roninjin10/e2e-verify/issue-views`]: [],
    [`GET ${GITHUB_SOURCE}`]: json(502, { status: "error", code: "bad_gateway", message: "GitHub is unavailable" })
  } })
  try {
    const outcome = await h.controller.runCommandForResult("search.issues", TITLE)
    expect(outcome).toMatchObject({ status: "failed" })
    const error = outcome.status === "failed" ? outcome.error : ""
    expect(error).not.toContain("No results")
    expect(error).not.toBe("")
    /* Both doors were really asked, in the one read the card shares. */
    expect(h.calls).toContain(`GET ${ISSUES}`)
    expect(h.calls).toContain(`GET ${GITHUB_SOURCE}`)
    /* A refusal opens no results card: there are no rows to count. */
    expect(h.store.collections.cards.get("search-search.issues")).toBeUndefined()
  } finally { await h.controller.dispose() }
})

/*
 * The same boundary, the other way round: a door that refused does not erase
 * the rows another door DID establish. The tracker's own issue #5 still
 * answers, and the search states no refusal over a row it holds.
 */
test("rows the tracker did establish still answer when the GitHub source refuses", async () => {
  const h = await hosted({ routes: {
    [`GET ${ISSUES}`]: [cloudIssue],
    [`GET /api/repos/roninjin10/e2e-verify/issue-views`]: [],
    [`GET ${GITHUB_SOURCE}`]: json(502, { status: "error", code: "bad_gateway", message: "GitHub is unavailable" })
  } })
  try {
    const outcome = await h.controller.runCommandForResult("search.issues", TITLE)
    expect(outcome).toMatchObject({ status: "executed" })
    const value = JSON.parse(outcome.status === "executed" ? outcome.value ?? "{}" : "{}") as { count: number }
    expect(value.count).toBe(1)
    const card = h.store.collections.cards.get("search-search.issues")
    expect(card?.kind === "search-results" ? card.payload.items.map(item => item.ref) : []).toEqual(["5"])
  } finally { await h.controller.dispose() }
})

/*
 * The list read throws the sign-in door's refusal rather than returning it
 * (SeamContext RepositorySignInRequired travels through the prepared-view
 * machinery). `issues.list` catches it in `repositoryListRead`; the search
 * index door calls the read DIRECTLY and caught nothing, so a 401 left the
 * `search.issues` flow as a thrown rejection instead of an answer.
 */
test("a tracker that answers 401 refuses the search in words, and never throws out of the flow", async () => {
  const h = await hosted({ routes: {
    [`GET ${ISSUES}`]: json(401, { status: "error", code: "unauthorized", message: "sign in" })
  } })
  try {
    const outcome = await h.controller.runCommandForResult("search.issues", TITLE)
    expect(outcome.status).not.toBe("errored")
    expect(outcome).toMatchObject({ status: "failed" })
    expect(outcome.status === "failed" ? outcome.error : "").not.toContain("No results")
  } finally { await h.controller.dispose() }
})

/*
 * The production cause could not be read off anything the app recorded: the
 * screen said `0 results`, and the diagnostics ring held nothing about the
 * index read at all. So the index door records WHICH door ended the read and
 * what each one held — a closed set of reason codes and per-source counts,
 * and nothing else. The ring forwards to the operational sink, never to a
 * card, and the record must stay free of the repository, the query, any URL,
 * header or backend sentence, or it would carry a customer's words into a
 * diagnostic.
 */
test("an issue index that answers no rows records its reason code, counts and nothing else", async () => {
  const h = await hosted({ routes: {
    [`GET ${ISSUES}`]: [],
    [`GET /api/repos/roninjin10/e2e-verify/issue-views`]: [],
    [`GET ${GITHUB_SOURCE}`]: json(502, { status: "error", code: "bad_gateway", message: "GitHub is unavailable" })
  } })
  try {
    await h.controller.runCommandForResult("search.issues", TITLE)
    const records = issueIndexRecords(h.diagnostics)
    expect(records).toEqual(["issues.index stage=read reason=source_refused rows=0 cloud=0 github=0"])
    for (const record of records) {
      for (const secret of [TITLE, REPO, "e2e-verify", "github-repos", "/api/", "GitHub is unavailable", "bad_gateway"]) {
        expect(record).not.toContain(secret)
      }
    }
  } finally { await h.controller.dispose() }
})

test("an index that really is empty says so, and an index that answered rows records nothing", async () => {
  const empty = await hosted({ routes: {
    [`GET ${ISSUES}`]: [],
    [`GET /api/repos/roninjin10/e2e-verify/issue-views`]: [],
    [`GET ${GITHUB_SOURCE}`]: []
  } })
  try {
    const outcome = await empty.controller.runCommandForResult("search.issues", TITLE)
    /* Every door answered and held nothing: "no results" is true here, and stays. */
    expect(outcome).toMatchObject({ status: "executed" })
    expect(issueIndexRecords(empty.diagnostics)).toEqual(["issues.index stage=read reason=empty rows=0 cloud=0 github=0"])
  } finally { await empty.controller.dispose() }

  const answered = await hosted({ routes: cloudRoutes })
  try {
    expect(await answered.controller.runCommandForResult("search.issues", TITLE)).toMatchObject({ status: "executed" })
    /* The healthy shape is silent: a door that answered rows is not a diagnostic. */
    expect(issueIndexRecords(answered.diagnostics)).toEqual([])
  } finally { await answered.controller.dispose() }
})
