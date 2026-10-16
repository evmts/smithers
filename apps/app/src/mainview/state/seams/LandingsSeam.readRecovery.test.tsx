/*
 * #4035, and the source half of #4036 (fixed and published separately as
 * 889d1e96b2b2). Reading a pull request again must keep the tab the person
 * is reading, and must acknowledge the notification of the source it
 * actually read.
 *
 * The journey (roninjin10/e2e-verify PR #2, 2026-10-16): the Checks tab
 * reported a refused read, pressing Retry inside it loaded the real data —
 * and dropped the person back on Conversation. The repository pane is ONE
 * card for every location it shows (state/EmbeddedHistory.ts `paneTarget`),
 * so a pull request opened from the Activity card lives under the pane's id;
 * `readLanding` carried the tab forward from the fixed `pr-<repo>-<number>`
 * id, which holds no card at all in that pane.
 *
 * The second fact is the notification: this repository is a GitHub import, so
 * its #2 is GitHub's pull request, while the platform's own landings door
 * answers a different #2. `readRepositoryDetail`'s origin defaulted to
 * "smithers", so reading GitHub's #2 marked the native #2 read and left
 * GitHub's own unread.
 *
 * The wires below are the shapes these doors answer today (the pull request,
 * its commits, its head commit's check runs and its diff through
 * routes/github_user_repos.go, the activity doors through
 * seams/RepositoryUpdateSource.ts). The pull request is kept open so its
 * activity row is a notification the Activity card would announce.
 */
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LandingCardBody } from "../../cards/LandingCards"
import { flowArgs } from "../../flows/FlowArgs"
import type { AppServices } from "../AppController"
import { createAppController } from "../AppController"
import { createAppStore } from "../AppStore"
import type { AppStore } from "../AppStore"
import { json, memoryStorage, unavailableAgent } from "../TestFixtures"

const REPO = "will/flows"
const SOURCE_REPO = "upstream/project"
const CLOUD = `/api/repos/${REPO}`
const GITHUB = `/api/user/github-repos/${SOURCE_REPO}`
const PULLS = `${GITHUB}/pulls`
const HEAD_SHA = "0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6"
const CHECK_RUNS = `${GITHUB}/commits/${HEAD_SHA}/check-runs`
/* The activity door proxies GitHub under the CLOUD repository's own path; the backend resolves the import. */
const GITHUB_ACTIVITY = `/api/user/github-repos/${REPO}/issues`

const IMPORT = { full_name: REPO, github_source: { owner: "upstream", repo: "project" } }
const NATIVE = { full_name: REPO }

/** GET github-repos/upstream/project/pulls/2 — the fields this seam reads. */
const detail = {
  number: 2, title: "Add build-status line to README", body: "Resolves #1. Adds build status note.",
  state: "open", merged: false, draft: false, user: { login: "roninjin10" },
  head: { ref: "e2e-build-status", sha: HEAD_SHA }, base: { ref: "main" },
  created_at: "2026-10-14T18:00:00Z", updated_at: "2026-10-14T18:00:00Z", commits: 1
}
const README_DIFF = "diff --git a/README.md b/README.md\nindex 1111111..2222222 100644\n--- a/README.md\n+++ b/README.md\n@@ -1,3 +1,6 @@\n # e2e-verify\n \n Workflow verification repository.\n+\n+## Build status\n+Build status: verified by the e2e build-status check.\n"
const COMMIT_ROWS = [{
  sha: HEAD_SHA,
  commit: { message: "Add build-status line to README\n\nResolves #1.", author: { name: "Will Cory", date: "2026-10-14T18:00:00Z" } },
  author: { login: "roninjin10" }
}]
const CHECK_RUN_ROWS = { total_count: 1, check_runs: [{ name: "build-status", status: "completed", conclusion: "success", started_at: "2026-10-14T18:01:00Z" }] }

/** The GitHub pull request as the activity door lists it (one issues page, `pull_request` set). */
const githubActivityRow = (updatedAt: string) => ({
  number: 2, title: "Add build-status line to README", state: "open",
  updated_at: updatedAt, pull_request: { url: `https://api.github.com/repos/${SOURCE_REPO}/pulls/2` }
})

/** The platform's OWN #2: a different pull request under the same number. */
const nativeActivityRow = {
  number: 2, title: "Wire the native seam", state: "open", body: "Native change.",
  author: { id: 7, login: "will" }, change_ids: ["chg-a"], target_bookmark: "main",
  created_at: "2026-10-14T09:00:00.000Z", updated_at: "2026-10-14T09:00:00.000Z"
}

interface World {
  /** Answers for the head commit's check runs, in order; the last one repeats. */
  readonly checkRuns?: ReadonlyArray<() => Promise<Response> | Response>
  readonly source?: unknown
  readonly githubUpdatedAt?: () => string
  readonly pullDetail?: () => Response
}

/** Every door this journey touches, read-only; `world` replaces the answers a test is about. */
const backend = (world: World = {}): AppServices & { readonly calls: string[] } => {
  const calls: string[] = []
  let checkRun = 0
  return {
    calls,
    fetchImpl: async (input, init) => {
      const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://app.test")
      const path = url.pathname
      if ((init?.method ?? "GET") !== "GET") throw new Error(`this journey wrote to ${path}`)
      calls.push(path)
      if (path === CLOUD) return json(200, world.source ?? IMPORT)
      if (path === `${CLOUD}/issues`) return json(200, [])
      if (path === GITHUB_ACTIVITY) return json(200, [githubActivityRow(world.githubUpdatedAt?.() ?? "2026-10-14T18:00:00Z")])
      if (path === `${CLOUD}/landings`) return json(200, [nativeActivityRow])
      if (path === `${CLOUD}/landings/2`) return json(200, nativeActivityRow)
      if (path === `${CLOUD}/landings/2/reviews`) return json(200, [])
      if (path === "/api/notifications/list") return json(200, [])
      if (path === `${PULLS}/2`) return world.pullDetail?.() ?? json(200, detail)
      if (path === `${PULLS}/2/diff`) return new Response(README_DIFF, { status: 200, headers: { "content-type": "text/plain" } })
      if (path === `${PULLS}/2/commits`) return json(200, COMMIT_ROWS)
      if (path === CHECK_RUNS) {
        const answer = world.checkRuns?.[Math.min(checkRun, world.checkRuns.length - 1)]
        checkRun += 1
        return answer === undefined ? json(200, CHECK_RUN_ROWS) : answer()
      }
      return json(404, { message: `no stub for ${path}` })
    }
  }
}

const settled = () => new Promise(resolve => setTimeout(resolve, 0))

const ready = async (services: AppServices) => {
  const store: AppStore = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, services)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "will", ownerKind: "user", name: "flows", head: null }
  ] }).isPersisted.promise
  return { store, controller }
}

/** The repository pane, rooted at the Activity card the overview publishes. */
const paneOf = (store: AppStore): string => {
  const pane = [...store.collections.cards.values()].find(card => card.kind === "repo-update")
  if (pane === undefined) throw new Error("expected the Activity card to root the repository pane")
  return pane.id
}

const prCardAt = (store: AppStore, id: string) => {
  const card = store.collections.cards.get(id)
  if (card === undefined || card.kind !== "pr") throw new Error(`expected a pr card at ${id}, got ${card?.kind ?? "nothing"}`)
  return card
}

/** Which tab the rendered card says is selected, read off the tablist's own role. */
const selectedTab = (html: string): string | undefined =>
  [...html.matchAll(/<button[^>]*role="tab"[^>]*>.*?<\/button>/gs)]
    .filter(([button]) => button.includes('aria-selected="true"'))
    .map(([button]) => /Conversation|Commits|Checks|Files changed/.exec(button)?.[0])[0]

const notification = (store: AppStore, source: string) => {
  const row = [...store.collections.repositoryNotifications.values()].find(entry => entry.kind === "pr" && entry.number === 2 && entry.source === source)
  if (row === undefined) throw new Error(`expected the ${source} pull request notification`)
  return row
}

test("a Retry inside the Checks tab keeps that tab, in the pane card whose id is not the pull request's", async () => {
  const refused = () => json(503, { message: "check runs unavailable" })
  const services = backend({ checkRuns: [refused, () => json(200, CHECK_RUN_ROWS)] })
  const { store, controller } = await ready(services)
  try {
    expect(await controller.showRepoOverview(REPO)).toEqual({ value: expect.stringContaining("PR update") })
    const pane = paneOf(store)

    expect((await controller.commands.run("pr", `2 ${REPO}`)).status).toBe("executed")
    await settled()
    /* The pane reuses ONE id: the pull request is NOT at `pr-<repo>-<number>`. */
    expect(pane).not.toBe(`pr-${REPO}-2`)
    expect(store.collections.cards.get(`pr-${REPO}-2`)).toBeUndefined()
    const opened = prCardAt(store, pane)
    expect(opened.payload.readErrors?.checks).toBe("Checks unavailable (Read failed (HTTP 503). Something on Smithers' side failed. Not your fault, and nothing your request could have changed.)")
    expect(selectedTab(renderToStaticMarkup(<LandingCardBody card={opened} onRunCommand={() => {}} />))).toBe("Conversation")

    expect((await controller.commands.run("prs.tab", flowArgs("prs.tab", { cardId: pane, tab: "checks" }))).status).toBe("executed")
    await settled()
    expect(selectedTab(renderToStaticMarkup(<LandingCardBody card={prCardAt(store, pane)} onRunCommand={() => {}} />))).toBe("Checks")

    /* Retry, the button the refused Checks tab itself offers. */
    expect((await controller.commands.run("pr", `2 ${REPO}`)).status).toBe("executed")
    await settled()
    const retried = prCardAt(store, pane)
    expect(retried.payload.tab).toBe("checks")
    expect(retried.payload.readErrors).toBeUndefined()
    expect(retried.payload.checks).toEqual([{ context: "build-status", state: "success" }])
    /* The same pull request, read from the same source — nothing else inherited. */
    expect(retried.payload).toMatchObject({ repo: REPO, number: 2, sourceRepo: SOURCE_REPO })
    const html = renderToStaticMarkup(<LandingCardBody card={retried} onRunCommand={() => {}} />)
    expect(selectedTab(html)).toBe("Checks")
    expect(html).toContain("build-status")
  } finally { await controller.dispose() }
})

test("a tab chosen while the read is in flight is the newer choice and wins", async () => {
  let release: (value: Response) => void = () => {}
  const held = new Promise<Response>(resolve => { release = resolve })
  const services = backend({ checkRuns: [() => json(200, CHECK_RUN_ROWS), () => held] })
  const { store, controller } = await ready(services)
  try {
    await controller.showRepoOverview(REPO)
    const pane = paneOf(store)
    expect((await controller.commands.run("pr", `2 ${REPO}`)).status).toBe("executed")
    await settled()
    await controller.commands.run("prs.tab", flowArgs("prs.tab", { cardId: pane, tab: "commits" }))
    await settled()

    const reading = controller.commands.run("pr", `2 ${REPO}`)
    await settled()
    expect((await controller.commands.run("prs.tab", flowArgs("prs.tab", { cardId: pane, tab: "files" }))).status).toBe("executed")
    release(json(200, CHECK_RUN_ROWS))
    expect((await reading).status).toBe("executed")
    await settled()

    const card = prCardAt(store, pane)
    expect(card.payload.tab).toBe("files")
    expect(selectedTab(renderToStaticMarkup(<LandingCardBody card={card} onRunCommand={() => {}} />))).toBe("Files changed")
  } finally { await controller.dispose() }
})

test("a different pull request opened in the same pane inherits no tab", async () => {
  const services = backend()
  const { store, controller } = await ready(services)
  try {
    await controller.showRepoOverview(REPO)
    const pane = paneOf(store)
    await controller.commands.run("pr", `2 ${REPO}`)
    await settled()
    await controller.commands.run("prs.tab", flowArgs("prs.tab", { cardId: pane, tab: "files" }))
    await settled()
    /* #3 is another pull request; its own reads refuse, and it starts at Conversation. */
    expect((await controller.commands.run("pr", `3 ${REPO}`)).status).toBe("failed")
    await settled()
    expect(store.collections.cards.get(pane)).toMatchObject({ status: "error", loading: false })
  } finally { await controller.dispose() }
})

test("reading the GitHub import's #2 acknowledges GitHub's notification, never the platform's same-number landing", async () => {
  const services = backend()
  const { store, controller } = await ready(services)
  try {
    await controller.showRepoOverview(REPO)
    const github = notification(store, "github")
    const native = notification(store, "smithers")
    expect(github.version).not.toBe(native.version)

    const resolvedBefore = services.calls.filter(path => path === CLOUD).length
    expect((await controller.commands.run("pr", `2 ${REPO}`)).status).toBe("executed")
    await settled()
    expect(notification(store, "github").readVersion).toBe(github.version)
    expect(notification(store, "smithers").readVersion).toBeUndefined()
    /* One source resolution for the navigation: the read and the receipt name the same fact. */
    expect(services.calls.filter(path => path === CLOUD).length - resolvedBefore).toBe(1)
  } finally { await controller.dispose() }
})

test("a native repository's #2 acknowledges the platform's notification, never GitHub's same-number pull request", async () => {
  const services = backend({ source: NATIVE })
  const { store, controller } = await ready(services)
  try {
    await controller.showRepoOverview(REPO)
    const native = notification(store, "smithers")
    expect((await controller.commands.run("pr", `2 ${REPO}`)).status).toBe("executed")
    await settled()
    expect(notification(store, "smithers").readVersion).toBe(native.version)
    expect(notification(store, "github").readVersion).toBeUndefined()
  } finally { await controller.dispose() }
})

test("a refused read acknowledges nothing, and a newer version arriving mid-read stays unread", async () => {
  const refusedDetail = backend({ pullDetail: () => json(503, { message: "pull request unavailable" }) })
  const first = await ready(refusedDetail)
  try {
    await first.controller.showRepoOverview(REPO)
    expect((await first.controller.commands.run("pr", `2 ${REPO}`)).status).toBe("failed")
    await settled()
    expect(notification(first.store, "github").readVersion).toBeUndefined()
    expect(notification(first.store, "smithers").readVersion).toBeUndefined()
  } finally { await first.controller.dispose() }

  let updatedAt = "2026-10-14T18:00:00Z"
  let release: (value: Response) => void = () => {}
  const held = new Promise<Response>(resolve => { release = resolve })
  const slow = backend({ githubUpdatedAt: () => updatedAt, checkRuns: [() => held] })
  const second = await ready(slow)
  try {
    await second.controller.showRepoOverview(REPO)
    const reading = second.controller.commands.run("pr", `2 ${REPO}`)
    await settled()
    updatedAt = "2026-10-15T09:00:00Z"
    await second.controller.showRepoOverview(REPO)
    release(json(200, CHECK_RUN_ROWS))
    expect((await reading).status).toBe("executed")
    await settled()
    const row = notification(second.store, "github")
    expect(row.updatedAt).toBe(updatedAt)
    expect(row.readVersion).not.toBe(row.version)
  } finally { await second.controller.dispose() }
})
