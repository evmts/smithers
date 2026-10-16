/*
 * #3880. A merged pull request reads Merged.
 *
 * The person's journey (roninjin10/e2e-verify, 2026-10-14): `/pr 6` opened the
 * real pull request "AutoPR webhook test webhook-auto-161219" with a red
 * CLOSED pill, while `gh pr view 6` reported MERGED. GitHub states a merged
 * pull request as `state: "closed"` with the merge fact beside it, and
 * `parseLandingRow` took `state` verbatim, so the card dropped the fact the
 * wire carried.
 *
 * The wires below are the bytes GitHub answered for that pull request on
 * 2026-10-14, through the proxy route this seam reads
 * (`/api/user/github-repos/{owner}/{repo}/pulls*`, raw GitHub JSON):
 * the detail carries `merged`, a list row carries only `merged_at`.
 */
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { AppServices } from "../AppController"
import { createAppController } from "../AppController"
import { createAppStore } from "../AppStore"
import type { AppStore } from "../AppStore"
import { json, memoryStorage, unavailableAgent } from "../TestFixtures"
import { LandingCardBody, LandingListCardBody } from "../../cards/LandingCards"

const REPO = "will/flows"
const SOURCE = "/api/repos/will/flows"
const PULLS = "/api/user/github-repos/upstream/project/pulls"
const LANDINGS = "/api/repos/will/flows/landings"

const backend = (routes: Record<string, unknown>): AppServices => ({
  fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://app.test")
    const method = (init?.method ?? "GET").toUpperCase()
    const answer = routes[`${method} ${url.pathname}`]
    return answer === undefined
      ? json(404, { status: "error", message: `no stub for ${method} ${url.pathname}` })
      : json(200, answer)
  }
})

const ready = async (routes: Record<string, unknown>) => {
  const store: AppStore = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, backend(routes))
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "will", ownerKind: "user", name: "flows", head: null }
  ] }).isPersisted.promise
  return { store, controller }
}

/** The repository is an import, so its pull requests are GitHub's. */
const IMPORT = { full_name: REPO, github_source: { owner: "upstream", repo: "project" } }

/** GET repos/roninjin10/e2e-verify/pulls/6 on 2026-10-14, the fields this seam reads. */
const mergedDetail = {
  number: 6, title: "AutoPR webhook test webhook-auto-161219", body: "Automated pull request.",
  state: "closed", merged: true, merged_at: "2026-07-08T20:15:14Z", draft: false,
  user: { login: "roninjin10" }, head: { ref: "auto-pr-webhook-auto-161219" }, base: { ref: "main" },
  created_at: "2026-07-08T20:14:25Z", updated_at: "2026-07-08T20:15:14Z"
}
/** The same pull request in `?state=all` list form: no `merged` key, `merged_at` set. */
const mergedRow = {
  number: 6, title: "AutoPR webhook test webhook-auto-161219", state: "closed",
  merged_at: "2026-07-08T20:15:14Z", draft: false, user: { login: "roninjin10" }, updated_at: "2026-07-08T20:15:14Z"
}
const closedRow = { number: 5, title: "Abandoned change", state: "closed", merged: false, merged_at: null, draft: false, user: { login: "roninjin10" }, updated_at: "2026-07-07T10:00:00Z" }
const openRow = { number: 7, title: "Live change", state: "open", merged: false, merged_at: null, draft: false, user: { login: "roninjin10" }, updated_at: "2026-07-09T10:00:00Z" }
const draftRow = { number: 8, title: "Sketch", state: "open", merged: false, merged_at: null, draft: true, user: { login: "roninjin10" }, updated_at: "2026-07-09T11:00:00Z" }

/** The card upsert settles on the next tick, as the other seam suites read it. */
const settled = () => new Promise(resolve => setTimeout(resolve, 0))

const prCardOf = (store: AppStore, id: string) => {
  const card = store.collections.cards.get(id)
  if (card === undefined || (card.kind !== "pr" && card.kind !== "pr-list")) throw new Error(`expected a PR card at ${id}, got ${card?.kind ?? "nothing"}`)
  return card
}

test("the merged pull request GitHub answered reads Merged on its card, and renders the Merged pill", async () => {
  const { store, controller } = await ready({ [`GET ${SOURCE}`]: IMPORT, [`GET ${PULLS}/6`]: mergedDetail })
  try {
    const outcome = await controller.commands.run("pr", `6 ${REPO}`)
    expect(outcome.status).toBe("executed")
    expect(outcome.status === "executed" ? outcome.value : undefined).toContain("#6 AutoPR webhook test webhook-auto-161219 · merged")
    await settled()
    const card = prCardOf(store, `pr-${REPO}-6`)
    expect(card.kind === "pr" ? card.payload : undefined).toMatchObject({
      number: 6, repo: REPO, sourceRepo: "upstream/project", state: "merged",
      branch: "auto-pr-webhook-auto-161219", baseBranch: "main", draft: false
    })
    if (card.kind !== "pr") throw new Error("expected the pr card")
    const html = renderToStaticMarkup(<LandingCardBody card={card} onRunCommand={() => {}} />)
    expect(html).toContain("Merged")
    expect(html).not.toContain("Closed")
    /* The merge fact changes no door: a GitHub-source PR never offered native review or land. */
    expect(html).not.toContain('data-flow="prs.land"')
    expect(html).not.toContain('data-flow="prs.review"')
  } finally { await controller.dispose() }
})

test("the list agrees with the detail, and every other state is answered as the wire wrote it", async () => {
  const { store, controller } = await ready({
    [`GET ${SOURCE}`]: IMPORT,
    [`GET ${PULLS}`]: [mergedRow, closedRow, openRow, draftRow]
  })
  try {
    const outcome = await controller.commands.run("pr", JSON.stringify({ operation: "list", repo: REPO }))
    expect(outcome.status).toBe("executed")
    await settled()
    const card = prCardOf(store, `prs-${REPO}`)
    expect(card.kind === "pr-list" ? card.payload.landings.map(row => [row.number, row.state]) : undefined)
      .toEqual([[6, "merged"], [5, "closed"], [7, "open"], [8, "open"]])
    if (card.kind !== "pr-list") throw new Error("expected the pr-list card")
    const html = renderToStaticMarkup(<LandingListCardBody card={card} onRunCommand={() => {}} />)
    expect(html).toContain('aria-label="Merged"')
    expect(html).toContain('aria-label="Closed"')
    expect(html).toContain('aria-label="Open"')
  } finally { await controller.dispose() }
})

test("a native platform landing keeps its own word: merged stays merged, closed without a merge stays closed", async () => {
  const native = (number: number, state: string, mergedAt: string | null) => ({
    number, title: `Wire the seam ${number}`, body: "", state, author: { id: 7, login: "will" },
    change_ids: [], target_bookmark: "main", merged_at: mergedAt,
    created_at: "2026-08-10T10:00:00.000Z", updated_at: "2026-08-11T10:00:00.000Z"
  })
  const NATIVE = { full_name: REPO }
  const listed = await ready({
    [`GET ${SOURCE}`]: NATIVE,
    [`GET ${LANDINGS}`]: [native(3, "merged", "2026-08-11T10:00:00.000Z"), native(4, "closed", null), native(5, "queued", null)]
  })
  try {
    expect((await listed.controller.commands.run("pr", JSON.stringify({ operation: "list", repo: REPO }))).status).toBe("executed")
    await settled()
    const list = prCardOf(listed.store, `prs-${REPO}`)
    expect(list.kind === "pr-list" ? list.payload.landings.map(row => [row.number, row.state]) : undefined)
      .toEqual([[3, "merged"], [4, "closed"], [5, "queued"]])
  } finally { await listed.controller.dispose() }

  /* The platform's closed landing carries no merge, so the detail stays closed. */
  const opened = await ready({ [`GET ${SOURCE}`]: NATIVE, [`GET ${LANDINGS}/4`]: native(4, "closed", null) })
  try {
    expect((await opened.controller.commands.run("pr", `4 ${REPO}`)).status).toBe("executed")
    await settled()
    const detail = prCardOf(opened.store, `pr-${REPO}-4`)
    expect(detail.kind === "pr" ? detail.payload.state : undefined).toBe("closed")
  } finally { await opened.controller.dispose() }
})
