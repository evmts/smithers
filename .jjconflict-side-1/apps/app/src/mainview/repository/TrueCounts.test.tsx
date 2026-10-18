import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IssueViews } from "./IssueViews"
import { PullViews } from "./PullViews"
import { IssueListCardBody } from "../cards/IssueCards"
import { LandingListCardBody } from "../cards/LandingCards"
import { createIssuesSeam } from "../state/seams/IssuesSeam"
import { createLandingsSeam } from "../state/seams/LandingsSeam"
import { pageIsPartial, type SeamContext } from "../state/seams/SeamContext"
import { createAppStore } from "../state/AppStore"
import { memoryStorage } from "../state/TestFixtures"
import type { Card } from "../state/AppState"

/*
 * A count is the true total, or it says it is a floor. Live on
 * smithers-canary/smithers (PM d-i55b5a, 2026-10-19) /issues said "Open 29
 * Closed 1" and /pulls "Open 3 Closed 97": the one page each read fetched
 * (GitHub's default 30 rows, a 100-row pulls page), presented as the
 * repository's totals. A page that is full or links `rel="next"` is one page
 * of more, and every count over it now reads "29+", "1+".
 */

const REPO = "maya/tinyhttp"
const NEXT = { link: '<https://app.test/next?page=2>; rel="next"' }
type Http = SeamContext["http"]

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "" } } })
  try { return renderToStaticMarkup(element) } finally { if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else Reflect.deleteProperty(globalThis, "window") }
}

/** The status toggle's two counts, as the repository page draws them. */
const toggle = (html: string, label: "Issue state" | "Pull request state") => {
  const nav = new RegExp(`<nav class="[^"]*" aria-label="${label}">([\\s\\S]*?)</nav>`).exec(html)?.[1] ?? ""
  return [...nav.matchAll(/(Open|Closed) <span class="repo-ui-counter">([^<]*)<\/span>/g)].map(match => `${match[1]} ${match[2]}`)
}

const context = async (http: Http, githubSource = true): Promise<SeamContext> => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-out", login: null, admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: REPO, org: "maya", ownerKind: "user", name: "tinyhttp", head: null,
    ...(githubSource ? { githubSource: { owner: "maya", repo: "tinyhttp" } } : {}) }] }).isPersisted.promise
  let ordinal = 0
  return { store, http, baseUrl: "https://app.test", actor: () => "user", nextOrdinal: () => ++ordinal, dispatch: transition => store.dispatch(transition) }
}

const githubIssue = (number: number, state = "open") => ({ number, title: `GitHub issue ${number}`, state, user: { login: "maya" }, labels: [], comments: 0 })
const githubPull = (number: number) => ({ number, title: `GitHub pull ${number}`, state: "open", pull_request: { url: "https://api.github.com/x" }, user: { login: "maya" } })
const nativeIssue = (number: number, state = "open") => ({ number, title: `Native issue ${number}`, state, author: { login: "maya" }, labels: [], comment_count: 0 })
/** `open` open rows then `closed` closed ones, numbered from the top. */
const rows = <T,>(open: number, closed: number, row: (number: number, state: string) => T): T[] =>
  Array.from({ length: open + closed }, (_, i) => row(open + closed - i, i < open ? "open" : "closed"))

/** The issue list card for `REPO`, with GitHub's page and the native tracker's answering as given. */
const issueList = async ({ github, native = [], nativeHeaders = {}, githubSource = true }: {
  readonly github?: { readonly body: unknown[]; readonly headers?: Record<string, string> }
  readonly native?: unknown[]; readonly nativeHeaders?: Record<string, string>; readonly githubSource?: boolean
}) => {
  const calls: string[] = []
  const ctx = await context(async input => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    if (url.pathname === `/api/repos/${REPO}/issues`) return Response.json(native, { headers: { link: `<https://app.test${url.pathname}>; rel="first"`, ...nativeHeaders } })
    if (url.pathname === `/api/user/github-repos/${REPO}/issues` && github) return Response.json(github.body, { headers: github.headers ?? {} })
    return Response.json([])
  }, githubSource)
  await createIssuesSeam(ctx).listIssues("all", REPO)
  const card = [...ctx.store.collections.cards.values()].find(row => row.kind === "issue-list")
  if (card?.kind !== "issue-list") throw new Error("expected the issue list card")
  return { card, calls, page: toggle(render(createElement(IssueViews, { repo: REPO, card, signedIn: false, onRunCommand: () => {} })), "Issue state"), chat: render(createElement(IssueListCardBody, { card, onRunCommand: () => {} })) }
}

/** The pull request list card for `REPO`, its source answering `body` with `headers`. */
const pullList = async (source: "github" | "native", body: unknown[], headers: Record<string, string> = {}) => {
  const ctx = await context(async input => {
    const url = new URL(String(input))
    if (url.pathname === `/api/repos/${REPO}`) return Response.json({ full_name: REPO, ...(source === "github" ? { github_source: { owner: "maya", repo: "tinyhttp" } } : {}) })
    if (url.pathname === `/api/user/github-repos/${REPO}/pulls` && source === "github") return Response.json(body, { headers })
    if (url.pathname === `/api/repos/${REPO}/landings` && source === "native") return Response.json(body, { headers: { link: `<https://app.test${url.pathname}?limit=100>; rel="first"`, ...headers } })
    return Response.json({ message: `no stub for ${url.pathname}` }, { status: 404 })
  }, source === "github")
  await createLandingsSeam(ctx).listLandings(REPO)
  const card = [...ctx.store.collections.cards.values()].find(row => row.kind === "pr-list")
  if (card?.kind !== "pr-list") throw new Error("expected the pull request list card")
  return { card, page: toggle(render(createElement(PullViews, { repo: REPO, card, onRunCommand: () => {} })), "Pull request state"), chat: render(createElement(LandingListCardBody, { card, onRunCommand: () => {} })) }
}

test("a page is partial when it links rel=next or is full, never on a first or last link alone", () => {
  const page = (link?: string) => new Response("[]", link === undefined ? {} : { headers: { link } })
  expect(pageIsPartial(page(), 29)).toBe(false)
  expect(pageIsPartial(page(), 30)).toBe(true)
  expect(pageIsPartial(page(), 99, 100)).toBe(false)
  expect(pageIsPartial(page(), 100, 100)).toBe(true)
  expect(pageIsPartial(page('<https://app.test/x>; rel="first"'), 3)).toBe(false)
  expect(pageIsPartial(page('<https://app.test/x?page=1>; rel="prev", <https://app.test/x?page=3>; rel="last"'), 3)).toBe(false)
  expect(pageIsPartial(page('<https://app.test/x>; rel="first", <https://app.test/x?cursor=a>; rel="next"'), 3)).toBe(true)
  expect(pageIsPartial(page("<https://app.test/x?page=2>; rel=next"), 3)).toBe(true)
})

test("GitHub issues: a full page with rel=next draws both counts as floors", async () => {
  const { card, page, chat } = await issueList({ github: { body: rows(29, 1, githubIssue), headers: NEXT } })
  expect(card.payload.partial).toBe(true)
  expect(page).toEqual(["Open 29+", "Closed 1+"])
  expect(chat).toContain("29+ Open")
  expect(chat).toContain("1+ Closed")
})

test("GitHub issues: a full page counts the pull requests GitHub lists in it, with or without a next link", async () => {
  // GitHub's issues page holds pull requests too; 25 issues and 5 pull requests fill it.
  const full = [...rows(24, 1, githubIssue), ...Array.from({ length: 5 }, (_, i) => githubPull(100 + i))]
  const { card, page } = await issueList({ github: { body: full } })
  expect(card.payload.issues).toHaveLength(25)
  expect(card.payload.partial).toBe(true)
  expect(page).toEqual(["Open 24+", "Closed 1+"])
  // A short page that still links a next page is one page of more.
  const linked = await issueList({ github: { body: rows(2, 1, githubIssue), headers: NEXT } })
  expect(linked.page).toEqual(["Open 2+", "Closed 1+"])
})

test("GitHub issues: a short page without rel=next draws plain counts", async () => {
  const { card, page, chat } = await issueList({ github: { body: rows(2, 1, githubIssue), headers: { link: '<https://api.github.com/x>; rel="first"' } } })
  expect(card.payload.partial).toBeUndefined()
  expect(page).toEqual(["Open 2", "Closed 1"])
  expect(chat).toContain("2 Open")
  expect(chat).toContain("1 Closed")
  expect(chat).not.toContain("+")
})

test("a native tracker's short page is unchanged: plain counts and no GitHub read", async () => {
  const { card, page, calls } = await issueList({ native: rows(2, 1, nativeIssue), githubSource: false })
  expect(calls.some(path => path.includes("github"))).toBe(false)
  expect(card.payload.partial).toBeUndefined()
  expect(page).toEqual(["Open 2", "Closed 1"])
})

test("a native tracker pages too: its full page, or a next link, draws floors", async () => {
  // plue answers 30 rows when no limit is asked and links the next page.
  const full = await issueList({ native: rows(30, 0, nativeIssue), nativeHeaders: { link: '<https://app.test/first>; rel="first", <https://app.test/next?cursor=MzA>; rel="next"' }, githubSource: false })
  expect(full.card.payload.partial).toBe(true)
  expect(full.page).toEqual(["Open 30+", "Closed 0+"])
  // Complete native rows beside a partial GitHub page: the merged counts are floors.
  const merged = await issueList({ native: rows(1, 0, nativeIssue), github: { body: rows(29, 1, githubIssue), headers: NEXT } })
  expect(merged.card.payload.partial).toBe(true)
  expect(merged.page).toEqual(["Open 30+", "Closed 1+"])
})

test("the GitHub-source list a not-imported repository falls back to carries the same flag", async () => {
  const read = async (body: unknown[], headers: Record<string, string> = {}) => {
    const ctx = await context(async input => {
      const url = new URL(String(input))
      if (url.pathname === `/api/repos/${REPO}/issues`) return Response.json({ message: "not found" }, { status: 404 })
      if (url.pathname === `/api/user/github-repos/${REPO}/issues`) return Response.json(body, { headers })
      return Response.json([])
    })
    await createIssuesSeam(ctx).listIssues("all", REPO)
    const card = [...ctx.store.collections.cards.values()].find(row => row.kind === "issue-list")
    if (card?.kind !== "issue-list") throw new Error("expected the issue list card")
    return toggle(render(createElement(IssueViews, { repo: REPO, card, signedIn: false, onRunCommand: () => {} })), "Issue state")
  }
  expect(await read(rows(29, 1, githubIssue), NEXT)).toEqual(["Open 29+", "Closed 1+"])
  expect(await read(rows(2, 1, githubIssue))).toEqual(["Open 2", "Closed 1"])
})

test("an install's issues carry the flag: a full page draws floors, a short one plain counts", async () => {
  const read = async (body: unknown[]) => {
    const ctx = await context(async input => new URL(String(input)).pathname === "/api/issues" ? Response.json(body) : Response.json([]), false)
    await createIssuesSeam(ctx, undefined, undefined, { install: true, repository: () => REPO }).listIssues("all", REPO)
    const card = [...ctx.store.collections.cards.values()].find(row => row.kind === "issue-list")
    if (card?.kind !== "issue-list") throw new Error("expected the issue list card")
    return toggle(render(createElement(IssueViews, { repo: REPO, card, signedIn: false, onRunCommand: () => {} })), "Issue state")
  }
  expect(await read(rows(29, 1, githubIssue))).toEqual(["Open 29+", "Closed 1+"])
  expect(await read(rows(2, 1, githubIssue))).toEqual(["Open 2", "Closed 1"])
})

const pull = (number: number, state: string) => ({ number, title: `Pull ${number}`, state, user: { login: "maya" }, labels: [] })
const landing = (number: number, state: string) => ({ number, title: `Landing ${number}`, state: state === "open" ? "open" : "merged", author: { login: "maya" }, change_ids: [], target_bookmark: "main" })

test("GitHub pulls: a full page with rel=next draws both counts as floors", async () => {
  const { card, page, chat } = await pullList("github", rows(3, 97, pull), NEXT)
  expect(card.payload.partial).toBe(true)
  expect(page).toEqual(["Open 3+", "Closed 97+"])
  expect(chat).toContain("3+ Open")
  expect(chat).toContain("97+ Other")
  // A 100-row page is full even when no next link rides it.
  expect((await pullList("github", rows(3, 97, pull))).page).toEqual(["Open 3+", "Closed 97+"])
})

test("GitHub pulls: a short page without rel=next draws plain counts", async () => {
  const { card, page, chat } = await pullList("github", rows(3, 2, pull))
  expect(card.payload.partial).toBeUndefined()
  expect(page).toEqual(["Open 3", "Closed 2"])
  expect(chat).toContain("3 Open")
  expect(chat).toContain("2 Other")
  expect(chat).not.toContain("+")
})

test("native landings are unchanged on a short page and draw floors on a full one", async () => {
  const short = await pullList("native", rows(1, 1, landing))
  expect(short.card.payload.partial).toBeUndefined()
  expect(short.page).toEqual(["Open 1", "Closed 1"])
  const linked = await pullList("native", rows(1, 1, landing), { link: '<https://app.test/first>; rel="first", <https://app.test/next?cursor=MTAw>; rel="next"' })
  expect(linked.page).toEqual(["Open 1+", "Closed 1+"])
  expect((await pullList("native", rows(40, 60, landing))).page).toEqual(["Open 40+", "Closed 60+"])
})

test("a list card without the flag keeps plain counts", () => {
  const issues: Card = { id: "issues", kind: "issue-list", title: "Issues", status: "active", createdAt: 0, ordinal: 0, payload: { repo: REPO, filter: "all", issues: rows(2, 1, (number, state) => ({ number, title: `Issue ${number}`, state: state as "open" | "closed", author: null, comments: 0, updatedAt: null })) } }
  expect(toggle(render(createElement(IssueViews, { repo: REPO, card: issues, signedIn: false, onRunCommand: () => {} })), "Issue state")).toEqual(["Open 2", "Closed 1"])
})
