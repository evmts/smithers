import { expect, test } from "bun:test"
import { createAppStore, type AppStore } from "../AppStore"
import { memoryStorage } from "../TestFixtures"
import { readRepositoryUpdate } from "./RepositoryUpdateSource"
import type { SeamContext } from "./SeamContext"

const closeStore = async (store: AppStore) => {
  if (typeof store.dispose !== "function") throw new Error("The fixture store has no disposal authority")
  await store.dispose()
}

test("reads advertised pages, distinguishes PRs, scopes inbox rows, and checks closed issue updates", async () => {
  const urls: string[] = []
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  try {
    const ctx: SeamContext = { store, dispatch: store.dispatch, actor: () => "user", nextOrdinal: () => 1, baseUrl: "https://example.test", http: async url => {
      urls.push(url)
      if (url.includes("github-repos")) return Response.json(new URL(url).searchParams.get("page") === "1"
        ? [{ number: 3, title: "New issue", state: "open", updated_at: "2026-09-10", labels: [{ name: "bug" }] }]
        : [{ number: 4, title: "PR update", state: "open", pull_request: {}, updated_at: "2026-09-11" }],
        new URL(url).searchParams.get("page") === "1" ? { headers: { link: '<https://untrusted.invalid/next>; rel="next"' } } : undefined)
      if (url.includes("notifications")) return Response.json([
        { id: 5, subject: { title: "Review requested", type: "PullRequest" }, repository: { full_name: "org/repo" }, unread: false, reason: "review_requested" },
        { id: 6, subject: "Other repo", repo: "other/repo", status: "unread" }
      ])
      if (url.includes("state=closed")) return Response.json([{ number: 2, title: "Closed issue", state: "closed" }])
      return Response.json([])
    } }
    const update = await readRepositoryUpdate(ctx, "org/repo")
    expect(update.issues.events.map(row => row.number)).toEqual([2, 3])
    expect(update.prs.events.map(row => row.number)).toEqual([4])
    expect(update.notifications.events).toHaveLength(1)
    expect(update.notifications.events[0]!.read).toBe(true)
    expect(urls.every(url => url.startsWith("https://example.test/"))).toBe(true)
    expect(update.issues.problems).toEqual([])
  } finally { await closeStore(store) }
})

const readWith = async (http: SeamContext["http"], repo = "org/repo") => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  try {
    const ctx: SeamContext = { store, dispatch: store.dispatch, actor: () => "user", nextOrdinal: () => 1, baseUrl: "https://example.test", http }
    return await readRepositoryUpdate(ctx, repo)
  } finally { await closeStore(store) }
}

test.each(["http", "json", "network"])("retains prior activity but marks a later %s page failure", async failure => {
  const seen: string[] = []
  const update = await readWith(async url => {
    if (!url.includes("github-repos")) return Response.json([])
    seen.push(url)
    if (seen.length === 1) return Response.json([{ number: 7, title: "Retained issue", state: "open", labels: ["urgent", { name: "bug" }, 12] }], { headers: { link: '<ignored>; rel="next"' } })
    if (failure === "http") return new Response("private detail", { status: 503 })
    if (failure === "json") return new Response("not-json")
    throw new Error("private network detail")
  })
  expect(seen).toEqual([
    "https://example.test/api/user/github-repos/org/repo/issues?state=all&per_page=100&page=1",
    "https://example.test/api/user/github-repos/org/repo/issues?state=all&per_page=100&page=2"
  ])
  expect(update.issues.events).toEqual([{ source: "github", sourceId: "7", kind: "issue", number: 7, title: "Retained issue", state: "open", updatedAt: null, tags: ["issue", "open", "urgent", "bug"] }])
  expect(update.issues.available).toBe(true)
  expect(update.issues.problems).toEqual([failure === "http" ? "Could not load repository activity (503)." : "Repository activity could not be reached."])
})

test.each(["http", "shape", "network"])("a first-page %s refusal cannot claim available empty success", async failure => {
  const update = await readWith(async () => {
    if (failure === "http") return new Response("private detail", { status: 401 })
    if (failure === "shape") return Response.json({ rows: [] })
    throw new Error("private detail")
  })
  expect(update.issues.events).toEqual([])
  expect(update.prs.events).toEqual([])
  expect(update.notifications.events).toEqual([])
  expect([update.issues.available, update.prs.available, update.notifications.available]).toEqual([false, false, false])
  const activity = failure === "http" ? "Could not load repository activity (401)." : failure === "shape" ? "Repository activity returned an unreadable response." : "Repository activity could not be reached."
  expect(update.issues.problems).toEqual([activity, activity, activity])
  expect(update.prs.problems).toEqual([activity, activity])
  expect(update.notifications.problems).toEqual([failure === "http" ? "Could not load notifications (401)." : activity])
})

test("bounds advertised pages and reports unreadable selected rows without losing valid ones", async () => {
  let calls = 0
  const update = await readWith(async url => {
    if (!url.includes("landings")) return Response.json([])
    calls++
    return Response.json(calls === 1 ? [{ number: 8, title: "Landing", state: "closed", updatedAt: "today" }, { number: "9", title: "Invalid", state: "open" }] : [], { headers: { link: '<ignored>; rel="next"' } })
  })
  expect(calls).toBe(10)
  expect(update.prs.events).toEqual([{ source: "smithers", sourceId: "8", kind: "pr", number: 8, title: "Landing", state: "closed", updatedAt: "today", tags: ["pr", "closed"] }])
  expect(update.prs.available).toBe(true)
  expect(update.prs.problems).toEqual(["This update is partial: additional activity pages remain.", "Some activity rows could not be read."])
})

test("inbox scoping and read states preserve exact notification identities and diagnostics", async () => {
  const update = await readWith(async url => Response.json(url.includes("notifications") ? [
    { id: 1, repository: "org/repo", subject: "Unread", unread: true, reason: "mention", updated_at: "first" },
    { id: "two", repo: "org/repo", title: "Read", status: "read", created_at: "second" },
    { id: 3, repository: { full_name: "org/repo" }, subject: { title: "Reviewed", type: "PullRequest" }, unread: false },
    { id: 4, repo: "elsewhere/repo", subject: "Other" },
    { id: 5, repo: "org/repo", subject: {} }, null
  ] : []))
  expect(update.notifications).toEqual({ available: true, problems: ["Some notifications could not be read.", "Some notifications could not be read."], events: [
    { source: "github-inbox", sourceId: "1", kind: "notification", title: "Unread", state: "updated", updatedAt: "first", read: false, tags: ["notification", "mention"] },
    { source: "github-inbox", sourceId: "two", kind: "notification", title: "Read", state: "updated", updatedAt: "second", read: true, tags: ["notification"] },
    { source: "github-inbox", sourceId: "3", kind: "notification", title: "Reviewed", state: "updated", updatedAt: null, read: true, tags: ["notification", "pullrequest"] }
  ] })
})


test.each([99, 100])("a %i-row page without Link uses the advertised-size fallback", async count => {
  const seen: string[] = []
  const update = await readWith(async url => {
    if (!url.includes("github-repos")) return Response.json([])
    seen.push(url)
    return Response.json(seen.length === 1 ? Array.from({ length: count }, (_, index) => ({ number: index + 1, title: "Listed issue", state: "open" })) : [])
  }, "space owner/雪 repo")
  const first = "https://example.test/api/user/github-repos/space%20owner/%E9%9B%AA%20repo/issues?state=all&per_page=100&page=1"
  const second = "https://example.test/api/user/github-repos/space%20owner/%E9%9B%AA%20repo/issues?state=all&per_page=100&page=2"
  expect(seen).toEqual(count === 99 ? [first] : [first, second])
  expect(update.issues).toEqual({ available: true, problems: [], events: Array.from({ length: count }, (_, index) => ({
    source: "github", sourceId: String(index + 1), kind: "issue", number: index + 1, title: "Listed issue", state: "open", updatedAt: null, tags: ["issue", "open"]
  })) })
  expect(update.prs.events).toEqual([])
})

/*
 * #3889, found by the root's own Activity card on the hosted app
 * (roninjin10/e2e-verify, 2026-10-14): the card said "Some repository
 * activity could not be checked" with no counts, over a 400 from the
 * GitHub-source door and a 403 from notifications.
 *
 * The 400 is this read's own query: the GitHub metadata door validates it
 * against an allowlist (backend services/github_repo_metadata.go
 * `normalizeGitHubRepoMetadataQuery`: state, sort, direction, per_page, page,
 * cursor, labels) and answers 400 `unsupported github repository metadata
 * query parameter` for anything else, so the Cloud doors' `limit` must not
 * ride along. The 403 is the host's availability contract (backend
 * middleware/feature_flag.go: 403 + `feature not available`, which the
 * production canary already reads as a pass, plue#675) — a door switched off,
 * never repository data that could not be read.
 */
test("the GitHub-source door is asked only in its own query vocabulary", async () => {
  const seen: string[] = []
  const update = await readWith(async url => {
    if (url.includes("github-repos")) seen.push(url)
    return Response.json(url.includes("github-repos") ? [{ number: 3, title: "GitHub issue", state: "open" }] : [])
  })
  expect(seen).toEqual(["https://example.test/api/user/github-repos/org/repo/issues?state=all&per_page=100&page=1"])
  expect(update.issues.events.map(row => row.number)).toEqual([3])
  expect(update.issues.problems).toEqual([])
  expect(update.issues.available).toBe(true)
})

/* plue writes the gate's body itself; the Worker restates it in its own envelope, keeping the code and the message. */
test.each([
  { message: "feature not available" },
  { status: "error", code: "forbidden", message: "feature not available" }
])("a door this host switched off is unavailable, not repository activity that could not be checked (%o)", async body => {
  const update = await readWith(async url => url.includes("notifications")
    ? Response.json(body, { status: 403 })
    : Response.json([{ number: 4, title: "Open issue", state: "open" }]))
  expect(update.notifications).toEqual({ available: false, problems: [], events: [] })
  /* The repository's own activity still reads, and nothing claims it did not. */
  expect(update.issues.available).toBe(true)
  expect(update.issues.problems).toEqual([])
  expect(update.prs.problems).toEqual([])
})

test("a 403 that is not the feature gate stays a visible problem", async () => {
  const update = await readWith(async url => url.includes("notifications")
    ? Response.json({ status: "error", code: "forbidden", message: "not a member of org/repo" }, { status: 403 })
    : Response.json([]))
  expect(update.notifications.problems).toEqual(["Could not load notifications (403)."])
  expect(update.notifications.available).toBe(false)
})
