import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PullViews } from "./PullViews"
import { createLandingsSeam } from "../state/seams/LandingsSeam"
import type { SeamContext } from "../state/seams/SeamContext"
import { createAppStore } from "../state/AppStore"
import { memoryStorage } from "../state/TestFixtures"

/*
 * A GitHub-source pull request's Commits, Checks and Files changed tabs read
 * through the viewer's own GitHub credential (`/api/user/github-repos/…`).
 * Live on smithers-canary/smithers#3723 (2026-10-19), a signed-out visitor got
 * a 401 from all three and each tab said "<X> unavailable." with a Retry that
 * could never work. Signed out, the reads are not made and each tab asks for
 * sign-in. Signed in, every path is as it was: a refusal, 401 included, keeps
 * its notice and Retry (owner ruling 2026-10-19 00:41: the sign-in flow does
 * not re-authorize a signed-in account, so a prompt there would be a dead
 * control).
 */

const REPO = "maya/tinyhttp"
const GITHUB = `/api/user/github-repos/${REPO}`
const HEAD = "a".repeat(40)
const detail = { number: 2, title: "Preserve request headers", body: "Keep headers.", state: "open", user: { login: "maya" }, head: { sha: HEAD, ref: "fix/headers" }, base: { ref: "main" }, commits: 1 }
const diff = "diff --git a/src/headers.ts b/src/headers.ts\n--- a/src/headers.ts\n+++ b/src/headers.ts\n@@ -1 +1 @@\n-oldHeader\n+newHeader\n"

const TABS = {
  commits: { path: `${GITHUB}/pulls/2/commits`, prompt: "Sign in to see commits", unavailable: "Commits unavailable.", evidence: "Preserve headers" },
  checks: { path: `${GITHUB}/commits/${HEAD}/check-runs`, prompt: "Sign in to see checks", unavailable: "Checks unavailable.", evidence: "Unit tests" },
  files: { path: `${GITHUB}/pulls/2/diff`, prompt: "Sign in to see files", unavailable: "Files unavailable.", evidence: "newHeader" }
} as const
type Tab = keyof typeof TABS

/** The pull request card the repository page renders, read as `identity` with `refused` answering `status`. */
const read = async (identity: "signed-out" | "signed-in", refused?: { readonly tab: Tab; readonly status: number }) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: identity, login: identity === "signed-in" ? "maya" : null, admin: false, scopesPlain: null }).isPersisted.promise
  const calls: string[] = []
  const http: SeamContext["http"] = async input => {
    const url = new URL(String(input), "https://app.test")
    calls.push(url.pathname)
    if (url.pathname === `/api/repos/${REPO}`) return Response.json({ full_name: REPO, is_public: true, github_source: { owner: "maya", repo: "tinyhttp" } })
    if (refused !== undefined && url.pathname === TABS[refused.tab].path) return Response.json({ message: "authentication required" }, { status: refused.status })
    // The proxied GitHub reads answer only a signed-in viewer, as the platform does.
    if (url.pathname.startsWith(GITHUB) && identity === "signed-out") return Response.json({ message: "authentication required" }, { status: 401 })
    if (url.pathname === `${GITHUB}/pulls/2` || url.pathname === `/api/repos/${REPO}/github/metadata/pulls/2`) return Response.json(detail)
    if (url.pathname === TABS.commits.path) return Response.json([{ sha: HEAD, commit: { message: "Preserve headers", author: { name: "maya", date: "2026-10-17T12:00:00Z" } }, author: { login: "maya" } }])
    if (url.pathname === TABS.checks.path) return Response.json({ total_count: 1, check_runs: [{ name: "Unit tests", status: "completed", conclusion: "success", started_at: "2026-10-17T12:00:00Z" }] })
    if (url.pathname === TABS.files.path) return new Response(diff, { headers: { "content-type": "text/plain" } })
    return Response.json({ message: `no stub for ${url.pathname}` }, { status: 404 })
  }
  let ordinal = 0
  const ctx: SeamContext = { store, http, baseUrl: "https://app.test", actor: () => "user", nextOrdinal: () => ++ordinal, dispatch: transition => store.dispatch(transition) }
  await createLandingsSeam(ctx).viewLanding(2, REPO)
  const card = [...store.collections.cards.values()].find(row => row.kind === "pr" && row.payload.number === 2)
  if (card === undefined || card.kind !== "pr") throw new Error("expected the pull request card")
  const page = (tab: Tab | "conversation") => renderToStaticMarkup(createElement(PullViews, { repo: REPO, number: 2, tab, card, onRunCommand: () => {} }))
  return { card, calls, page }
}

const proxied = (calls: ReadonlyArray<string>) => calls.filter(path => Object.values(TABS).some(tab => tab.path === path))

for (const tab of Object.keys(TABS) as Tab[]) {
  const { prompt, unavailable, evidence } = TABS[tab]

  test(`signed out, ${tab} asks for sign-in and its proxied read is never made`, async () => {
    const { card, calls, page } = await read("signed-out")
    expect(proxied(calls)).toEqual([])
    expect(card.payload.signInTabs).toEqual(["commits", "checks", "files"])
    expect(card.payload.readErrors).toBeUndefined()
    const html = page(tab)
    expect(html).toContain(`<button type="button" class="repo-ui-btn" data-flow="sign-in">${prompt}</button>`)
    expect(html).not.toContain("unavailable")
    expect(html).not.toContain(">Retry</button>")
    expect(html).not.toContain(evidence)
    expect(html).not.toMatch(/No (commits|checks reported|changed files)/)
    // The Conversation tab is the pull request's own public read and is unchanged.
    expect(page("conversation")).toContain("Keep headers.")
  })

  test(`signed in, a 401 on ${tab} keeps the unavailable notice with Retry, and the other tabs keep their rows`, async () => {
    const { card, calls, page } = await read("signed-in", { tab, status: 401 })
    expect(proxied(calls)).toContain(TABS[tab].path)
    expect(card.payload.signInTabs).toBeUndefined()
    expect(card.payload.readErrors?.[tab]).toContain(`${unavailable.slice(0, -1)} (`)
    const html = page(tab)
    expect(html).toContain(unavailable)
    expect(html).toContain(">Retry</button>")
    expect(html).not.toContain("Sign in to see")
    for (const other of (Object.keys(TABS) as Tab[]).filter(name => name !== tab)) {
      expect(page(other)).toContain(TABS[other].evidence)
      expect(page(other)).not.toContain("Sign in to see")
    }
  })

  test(`signed in, a 500 on ${tab} is the unavailable notice with Retry`, async () => {
    const { card, page } = await read("signed-in", { tab, status: 500 })
    expect(card.payload.signInTabs).toBeUndefined()
    expect(card.payload.readErrors?.[tab]).toContain("500")
    const html = page(tab)
    expect(html).toContain(unavailable)
    expect(html).toContain(">Retry</button>")
    expect(html).not.toContain("Sign in to see")
  })
}

test("a tab that waits on sign-in shows no count, so an unread Checks tab never claims 0", async () => {
  const { page } = await read("signed-out")
  const nav = /<nav class="repo-ui-tabs" aria-label="Pull request">([\s\S]*?)<\/nav>/.exec(page("checks"))?.[1] ?? ""
  expect(nav).toContain("Checks</a>")
  expect(nav).not.toMatch(/Checks<span/)
  // The count it rules out is the one a read Checks tab draws.
  const signedIn = await read("signed-in")
  expect(/<nav class="repo-ui-tabs" aria-label="Pull request">([\s\S]*?)<\/nav>/.exec(signedIn.page("checks"))?.[1]).toContain('Checks<span class="repo-ui-counter">1</span>')
})
