import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import { cloudCapabilities } from "@smthrs/rpc/HostCapabilities"
import { afterAll, afterEach, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ControllerTestProvider } from "./ControllerContext"
import { beginRepositoryEntry, openRequestedRepo, requestedTarget, signInReturnTo } from "./RepoLink"
import { openRequestedSubject } from "./RepositorySubjectEntry"
import type { AppController as AppControllerType } from "./state/AppController"
import { createAppStore } from "./state/AppStore"
import { scopedControllers } from "./state/ControllerTestScope"
import { json, memoryStorage, silentAgent } from "./state/TestFixtures"

const createAppController = scopedControllers()

/*
 * #4039, reproduced in production on 2026-10-16: the owned QA repository's own
 * pull request at `https://smithers.sh/roninjin10/e2e-verify/pull/2/files`
 * answered with the marketing site's "Page not found". The Worker side is
 * pinned at its request boundary (apps/server/src/edge.test.ts); this is the
 * other half — the real controller entry on such a URL, with the real
 * registered reads behind it.
 *
 * What these hold to:
 * - the reported URL opens THAT repository's pull request on the Files tab;
 * - the subject waits for the repository's own admission, so a page still
 *   holding another repository never answers with its #2;
 * - a GitHub-shaped issue URL names GitHub's issue, not the Smithers Cloud row
 *   with the same number;
 * - an account change while admission is pending opens nothing.
 */

GlobalRegistrator.register({ url: "https://smithers.sh/" })

afterAll(async () => {
  for (let tick = 0; tick < 3; tick += 1) await new Promise(resolve => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})

const mounted: Array<() => void> = []
afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.()
  window.history.replaceState(null, "", "/")
})

const mount = (controller: AppControllerType): { host: HTMLElement } => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
  mounted.push(() => { flushSync(() => root.unmount()); host.remove() })
  return { host }
}

/** What the Worker emits for the hosted app. */
const WEB: AppBootstrap = {
  apiVersion: 1,
  host: "cloud",
  version: "test",
  buildSha: "cloud",
  capabilities: cloudCapabilities({ identity: true, cloud: true, agent: true, checkout: true, terminal: false }),
  authFlow: "redirect",
  sandbox: null
}

const REPO = "roninjin10/e2e-verify"
const ROOT = `/api/repos/roninjin10/e2e-verify`
const settled = async (ticks = 8) => { for (let tick = 0; tick < ticks; tick += 1) await new Promise(resolve => setTimeout(resolve, 0)) }

/* The platform's own wire shapes, as LandingsSeam's and IssuesSeam's parsers accept them. */
const landing = (number: number) => ({
  number,
  title: "Wire the deep link",
  body: "The **stack** description.",
  state: "open",
  author: { id: 7, login: "roninjin10" },
  change_ids: ["chg-a"],
  target_bookmark: "main",
  conflict_status: "clean",
  stack_size: 1,
  created_at: "2026-10-15T10:00:00.000Z",
  updated_at: "2026-10-16T10:00:00.000Z"
})

const cloudIssue = (number: number) => ({
  number,
  title: `Cloud row ${number}`,
  state: "open",
  body: "A Smithers Cloud issue of its own.",
  author: { login: "roninjin10" },
  updated_at: "2026-10-16T10:00:00.000Z"
})

const githubIssue = (number: number) => ({
  number,
  title: `GitHub issue ${number}`,
  state: "open",
  body: "The issue GitHub numbered.",
  user: { login: "roninjin10" },
  updated_at: "2026-10-16T10:00:00.000Z",
  comments: 0
})

/** Routes keyed by path, matched with or without a query; every read is recorded. */
const recordingBackend = (routes: Record<string, Response | ((request: Request) => Response)>) => {
  const seen: string[] = []
  const fetchImpl = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
    const absolute = new URL(url, "https://smithers.sh")
    seen.push(absolute.pathname + absolute.search)
    for (const [route, answer] of Object.entries(routes)) {
      if (absolute.pathname === route) {
        return typeof answer === "function" ? answer(new Request(absolute.toString(), init)) : answer.clone()
      }
    }
    return json(404, { status: "error", code: "not_found" })
  }
  return { seen, fetchImpl, services: { fetchImpl } }
}

/** The signed-in account's own inventory, its public catalog answer, and the repository document. */
const ownedRepository = (extra: Record<string, Response | ((request: Request) => Response)> = {}) => recordingBackend({
  "/api/user": json(200, { id: 1, username: "roninjin10", is_admin: false }),
  "/api/auth/scopes": json(200, { scopes: [] }),
  "/api/public/repos": json(200, { repos: [] }),
  "/api/user/repos": json(200, { repos: [{ owner: "roninjin10", name: "e2e-verify", full_name: REPO, default_bookmark: "main" }] }),
  "/api/user/orgs": json(200, { orgs: [] }),
  "/api/notifications/list": json(200, []),
  [ROOT]: json(200, { full_name: REPO, default_bookmark: "main" }),
  ...extra
})

/** The reported URL, entered exactly as the boot does: whole target, admission, then subject. */
const enter = async (
  pathname: string,
  backend: ReturnType<typeof recordingBackend>,
  options: { readonly retained?: ReadonlyArray<Parameters<Awaited<ReturnType<typeof createAppStore>>["dispatch"]>[0]> } = {}
) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", pathname)
  const target = requestedTarget(window.location)
  const controller = createAppController(store, silentAgent, { bootstrap: WEB, repositoryApp: target?.repo, ...backend.services })
  for (const event of options.retained ?? []) await store.dispatch(event).isPersisted.promise
  await controller.loadSession()
  const requestId = beginRepositoryEntry(store, target?.repo ?? null)
  await openRequestedRepo(controller, backend.fetchImpl, target!.repo, requestId)
  const refusal = await openRequestedSubject(controller, target!.repo, target?.subject, { requestId })
  await settled()
  return { store, controller, target, refusal }
}

type PrCard = Extract<ReturnType<Awaited<ReturnType<typeof createAppStore>>["collections"]["cards"]["get"]> & object, { kind: "pr" }>

const prCard = (store: Awaited<ReturnType<typeof createAppStore>>, number: number): PrCard | undefined =>
  [...store.collections.cards.values()].find((card): card is PrCard =>
    card.kind === "pr" && card.payload.repo === REPO && card.payload.number === number)

test("the reported pull request URL opens that repository's pull request on the Files tab", async () => {
  const backend = ownedRepository({
    [`${ROOT}/landings/2`]: json(200, landing(2)),
    [`${ROOT}/landings/2/reviews`]: json(200, []),
    [`${ROOT}/commits/chg-a/statuses`]: json(200, []),
    [`${ROOT}/landings/2/changes`]: json(200, [
      { change_id: "chg-a", commit_id: "aaa111", description: "Wire the deep link", author_name: "Ronin", timestamp: "2026-10-15T10:00:00.000Z" }
    ]),
    [`${ROOT}/landings/2/diff`]: json(200, { changes: [
      { change_id: "chg-a", file_diffs: [{ path: "apps/server/src/edge.ts", change_type: "modified", additions: 4, deletions: 1, patch: "@@ -1 +1 @@" }] }
    ] })
  })
  const { store, controller, refusal } = await enter(`/${REPO}/pull/2/files`, backend)
  expect(refusal).toBeUndefined()

  const card = prCard(store, 2)
  if (card === undefined) throw new Error("expected the pull request card for the URL's repository")
  expect(card.payload.number).toBe(2)
  expect(card.payload.tab).toBe("files")
  expect(card.payload.files?.map(file => file.path)).toEqual(["apps/server/src/edge.ts"])

  const { host } = mount(controller)
  const selected = [...host.querySelectorAll('[role="tab"][aria-selected="true"]')].map(tab => tab.textContent ?? "")
  expect(selected.some(label => label.includes("Files changed"))).toBe(true)
  expect(host.textContent).toContain("apps/server/src/edge.ts")
})

test("every pull request view the URL can name reaches its own tab, and the bare path is the conversation", async () => {
  for (const [suffix, tab] of [["", "conversation"], ["/conversation", "conversation"], ["/commits", "commits"], ["/checks", "checks"], ["/files", "files"]] as const) {
    const backend = ownedRepository({
      [`${ROOT}/landings/2`]: json(200, landing(2)),
      [`${ROOT}/landings/2/reviews`]: json(200, []),
      [`${ROOT}/commits/chg-a/statuses`]: json(200, []),
      [`${ROOT}/landings/2/changes`]: json(200, []),
      [`${ROOT}/landings/2/diff`]: json(200, { changes: [] })
    })
    const { store } = await enter(`/${REPO}/pull/2${suffix}`, backend)
    expect({ suffix, tab: prCard(store, 2)?.payload.tab ?? "conversation" }).toEqual({ suffix, tab })
  }
})

test("the pull request list and the issue list URLs open their own card", async () => {
  const list = await enter(`/${REPO}/pulls`, ownedRepository({ [`${ROOT}/landings`]: json(200, [landing(2)]) }))
  expect(list.store.collections.cards.get(`prs-${REPO}`)?.kind).toBe("pr-list")

  const issues = await enter(`/${REPO}/issues`, ownedRepository({ [`${ROOT}/issues`]: json(200, [cloudIssue(5)]) }))
  expect(issues.store.collections.cards.get(`issues-${REPO}`)?.kind).toBe("issue-list")
})

/*
 * #4036's distinction, now reachable from a URL: one number is two subjects on
 * a repository with a GitHub source. A GitHub-shaped URL names GitHub's issue,
 * and the Cloud row with the same number keeps its own card.
 */
test("a GitHub-shaped issue URL opens GitHub's issue, never the Cloud row with the same number", async () => {
  const backend = ownedRepository({
    [ROOT]: json(200, { full_name: REPO, default_bookmark: "main", github_source: { owner: "roninjin10", repo: "e2e-verify" } }),
    [`${ROOT}/issues`]: json(200, [cloudIssue(5)]),
    [`${ROOT}/issues/5`]: json(200, cloudIssue(5)),
    "/api/user/github-repos/roninjin10/e2e-verify/issues": json(200, [githubIssue(5)]),
    "/api/user/github-repos/roninjin10/e2e-verify/issues/5/comments": json(200, [])
  })
  const { store, refusal } = await enter(`/${REPO}/issues/5`, backend)
  expect(refusal).toBeUndefined()
  const opened = [...store.collections.cards.values()].filter(card => card.kind === "issue")
  expect(opened.map(card => card.id)).toEqual([`issue-github-${REPO}-5`])
  expect(opened[0]?.kind === "issue" ? opened[0].payload.title : undefined).toBe("GitHub issue 5")
  // The read was GitHub's, through the explicit source the URL carries.
  expect(backend.seen.some(path => path.startsWith("/api/user/github-repos/roninjin10/e2e-verify/issues"))).toBe(true)
  expect(backend.seen).not.toContain(`${ROOT}/issues/5`)
})

/*
 * The URL's authority is its own repository's admission, never the page's
 * ambient selection. Production 2026-10-15 showed the opposite failure mode on
 * the repository root: the header cleared while the PREVIOUS repository's
 * cards stayed on screen. A subject must not inherit that.
 */
test("a repository Smithers does not have opens no subject, and the retained card of another repository is left alone", async () => {
  const backend = recordingBackend({
    "/api/user": json(200, { id: 1, username: "roninjin10", is_admin: false }),
    "/api/auth/scopes": json(200, { scopes: [] }),
    "/api/public/repos": json(200, { repos: [] }),
    "/api/user/repos": json(200, { repos: [] }),
    "/api/user/orgs": json(200, { orgs: [] }),
    "/api/user/github-access/roninjin10/e2e-verify": json(404, { status: "error", code: "not_found" })
  })
  const retained = {
    id: "pr-ada/earlier-2", kind: "pr" as const, title: "#2 Another repository's change · ada/earlier", status: "active" as const,
    createdAt: 1, ordinal: 1,
    payload: { repo: "ada/earlier", number: 2, title: "Another repository's change", state: "open", author: "ada", prBody: "", reviews: [], checks: [], tab: "conversation" as const }
  }
  const { store, refusal } = await enter(`/${REPO}/pull/2/files`, backend, {
    retained: [{ type: "card.upsert", actor: "user", card: retained }]
  })
  expect(refusal).toBeUndefined()
  expect(store.session().repositoryEntry?.phase).toBe("failed")
  expect(prCard(store, 2)).toBeUndefined()
  // No landing read was attempted at all: the URL granted no access.
  expect(backend.seen.some(path => path.includes("/landings"))).toBe(false)
  // The other repository's card is still stored, and still its own.
  expect(store.collections.cards.get("pr-ada/earlier-2")).toMatchObject({ payload: { repo: "ada/earlier", tab: "conversation" } })
})

test("an account change while admission is pending opens nothing", async () => {
  const backend = ownedRepository({
    [`${ROOT}/landings/2`]: json(200, landing(2)),
    [`${ROOT}/landings/2/reviews`]: json(200, []),
    [`${ROOT}/commits/chg-a/statuses`]: json(200, []),
    [`${ROOT}/landings/2/changes`]: json(200, []),
    [`${ROOT}/landings/2/diff`]: json(200, { changes: [] })
  })
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", `/${REPO}/pull/2/files`)
  const target = requestedTarget(window.location)!
  const controller = createAppController(store, silentAgent, { bootstrap: WEB, repositoryApp: target.repo, ...backend.services })
  await controller.loadSession()
  const requestId = beginRepositoryEntry(store, target.repo)
  await openRequestedRepo(controller, backend.fetchImpl, target.repo, requestId)
  // Somebody else is signed in now; this page's admission is not theirs.
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "someone-else", admin: false, scopesPlain: null }).isPersisted.promise
  await settled()
  const before = backend.seen.length
  expect(await openRequestedSubject(controller, target.repo, target.subject, { requestId })).toBeUndefined()
  await settled()
  expect(prCard(store, 2)).toBeUndefined()
  expect(backend.seen.slice(before).some(path => path.includes("/landings"))).toBe(false)
})

test("a superseded admission request opens nothing, so one URL's subject never lands under another's", async () => {
  const backend = ownedRepository({
    [`${ROOT}/landings/2`]: json(200, landing(2)),
    [`${ROOT}/landings/2/reviews`]: json(200, []),
    [`${ROOT}/commits/chg-a/statuses`]: json(200, []),
    [`${ROOT}/landings/2/changes`]: json(200, []),
    [`${ROOT}/landings/2/diff`]: json(200, { changes: [] })
  })
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", `/${REPO}/pull/2/files`)
  const target = requestedTarget(window.location)!
  const controller = createAppController(store, silentAgent, { bootstrap: WEB, repositoryApp: target.repo, ...backend.services })
  await controller.loadSession()
  const stale = beginRepositoryEntry(store, target.repo)
  await openRequestedRepo(controller, backend.fetchImpl, target.repo, beginRepositoryEntry(store, target.repo))
  const before = backend.seen.length
  expect(await openRequestedSubject(controller, target.repo, target.subject, { requestId: stale })).toBeUndefined()
  await settled()
  expect(prCard(store, 2)).toBeUndefined()
  expect(backend.seen.slice(before).some(path => path.includes("/landings"))).toBe(false)
})

/*
 * Signed out, the URL still grants no access: reading a pull request needs the
 * repository read, so the command PARKS on sign-in and the whole target is
 * what the sign-in returns to. No guest is allocated to read a pull request.
 */
test("signed out, the subject parks on sign-in and the whole target is the return path", async () => {
  const backend = recordingBackend({
    "/api/user": json(401, { status: "error", code: "unauthorized" }),
    "/api/public/repos": json(200, { repos: [{ name: REPO, title: "e2e-verify", url: `https://github.com/${REPO}`, stats: null }] }),
    [ROOT]: json(200, { full_name: REPO, default_bookmark: "main" })
  })
  const { store, refusal } = await enter(`/${REPO}/pull/2/files`, backend)
  expect(store.session().repositoryEntry?.phase).toBe("ready")
  // Nothing was read from the repository's pull requests, and no guest was asked for.
  expect(backend.seen.some(path => path.includes("/landings"))).toBe(false)
  expect(backend.seen.some(path => path.includes("/workspace"))).toBe(false)
  // The park is the pull request read itself, bound to the URL's repository.
  const pending = store.session().pendingCommand
  expect(pending?.name).toBe("pr")
  expect(JSON.parse(pending?.args ?? "{}")).toEqual({ number: 2, repo: REPO })
  expect(pending?.requirement).toBe("repo-read")
  expect(refusal).toBeUndefined()
  // And the sign-in comes back to the pull request, not to the repository root.
  expect(signInReturnTo(window.location)).toBe(`/${REPO}/pull/2/files`)
})

/*
 * The OTHER half of a domain swap (#4039's folder and file paths).
 * `github.com/o/r/blob/main/x.ts` and
 * `/tree/main/dir` are the links a reader actually has, and before this they
 * were not routes at all. What these hold to:
 *
 * - the file and the folder open through the registered `file`/`files` reads,
 *   at the revision the URL named, with `repo` bound to the URL's repository;
 * - which slash divides the ref from the path is decided against refs that
 *   were READ, so a slash-bearing branch opens the right file and an
 *   unconfirmable one opens nothing at all;
 * - the ref and the path keep their case, and an encoded segment is decoded
 *   exactly once;
 * - an account change or a superseded request opens no file.
 */
const bookmarks = (...names: ReadonlyArray<string>) =>
  json(200, { items: names.map((name, index) => ({ name, target_change_id: `chg-${index}` })), next_cursor: "" })

const fileContents = (content: string) => json(200, { path: "x", content, type: "file", encoding: "utf-8" })

const fileListCardOf = (store: Awaited<ReturnType<typeof createAppStore>>) =>
  [...store.collections.cards.values()].find(card => card.kind === "file-list")

const fileCardOf = (store: Awaited<ReturnType<typeof createAppStore>>) =>
  [...store.collections.cards.values()].find(card => card.kind === "file")

const notices = (store: Awaited<ReturnType<typeof createAppStore>>) =>
  [...store.collections.messages.values()].filter(message => message.role === "smithers")

const noticeTexts = (store: Awaited<ReturnType<typeof createAppStore>>) => notices(store).map(message => message.text)

test("a blob URL opens that file at the branch it names, through the registered file read", async () => {
  const backend = ownedRepository({
    [`${ROOT}/bookmarks`]: bookmarks("main", "release/1.2"),
    [`${ROOT}/contents/apps/server/src/edge.ts`]: fileContents("export const edge = 1\n")
  })
  const { store, refusal } = await enter(`/${REPO}/blob/main/apps/server/src/edge.ts`, backend)
  expect(refusal).toBeUndefined()
  const card = fileCardOf(store)
  expect(card?.kind === "file" ? card.payload : undefined).toMatchObject({
    repo: REPO, path: "apps/server/src/edge.ts", content: "export const edge = 1\n", ref: "main"
  })
  // The read asked the contents route for that revision, on the URL's repository.
  expect(backend.seen).toContain(`${ROOT}/contents/apps/server/src/edge.ts?ref=main`)
})

test("a slash-bearing branch divides where the repository's own refs say, not at the first slash", async () => {
  const backend = ownedRepository({
    [`${ROOT}/bookmarks`]: bookmarks("main", "release/1.2"),
    [`${ROOT}/contents/apps`]: json(200, [
      { name: "server", path: "apps/server", type: "dir" },
      { name: "app", path: "apps/app", type: "dir" }
    ])
  })
  const { store, refusal } = await enter(`/${REPO}/tree/release/1.2/apps`, backend)
  expect(refusal).toBeUndefined()
  const card = fileListCardOf(store)
  expect(card?.kind === "file-list" ? card.payload : undefined).toMatchObject({
    repo: REPO, path: "apps", ref: "release/1.2"
  })
  expect(card?.kind === "file-list" ? card.payload.entries.map(entry => entry.name) : []).toEqual(["app", "server"])
  expect(backend.seen).toContain(`${ROOT}/contents/apps?ref=release%2F1.2`)
  // A listing AT a revision is not addressed at the head it did not ask for.
  expect(card?.kind === "file-list" ? card.payload.readAt : "unset").toBeUndefined()
})

test("the ref and the path keep their case, and an encoded segment is decoded exactly once", async () => {
  const backend = ownedRepository({
    [`${ROOT}/bookmarks`]: bookmarks("main", "Release/2.0"),
    [`${ROOT}/contents/docs/My%20Notes.md`]: fileContents("# My Notes\n")
  })
  const { store, refusal } = await enter(`/${REPO}/blob/Release/2.0/docs/My%20Notes.md`, backend)
  expect(refusal).toBeUndefined()
  const card = fileCardOf(store)
  expect(card?.kind === "file" ? card.payload : undefined).toMatchObject({ path: "docs/My Notes.md", ref: "Release/2.0" })
  expect(backend.seen).toContain(`${ROOT}/contents/docs/My%20Notes.md?ref=Release%2F2.0`)
})

test("a branch no read can confirm opens nothing and says which part it could not divide", async () => {
  const backend = ownedRepository({ [`${ROOT}/bookmarks`]: bookmarks("main", "release/1.2") })
  const { store, refusal } = await enter(`/${REPO}/blob/feature/login/src/index.ts`, backend)
  expect(refusal).toBeUndefined()
  expect(fileCardOf(store)).toBeUndefined()
  // No read of that path was attempted: a division nobody confirmed is not a
  // path. (The repository's own root tree and homepage are other reads.)
  expect(backend.seen.filter(path => path.includes("src/index.ts"))).toEqual([])
  const notice = noticeTexts(store).find(text => text.includes("feature/login/src/index.ts"))
  expect(notice).toContain(`names a file in ${REPO}`)
  expect(notice).toContain(`No branch of ${REPO} begins it`)
  const action = notices(store).find(message => message.text === notice)?.action
  expect(action).toMatchObject({ flow: "branches" })
})

/*
 * Signed out the bookmark list is not this reader's to read. The repository
 * document's default bookmark still is, so the common link keeps working and
 * every other one says what is missing instead of guessing a slash.
 */
test("signed out, the default branch still divides its own links and any other says so", async () => {
  const signedOut = (extra: Record<string, Response | ((request: Request) => Response)>) => recordingBackend({
    "/api/user": json(401, { status: "error", code: "unauthorized" }),
    "/api/public/repos": json(200, { repos: [{ name: REPO, title: "e2e-verify", url: `https://github.com/${REPO}`, stats: null }] }),
    [ROOT]: json(200, { full_name: REPO, default_bookmark: "main" }),
    [`${ROOT}/bookmarks`]: json(401, { status: "error", code: "unauthorized" }),
    ...extra
  })
  const opened = await enter(`/${REPO}/tree/main/apps`, signedOut({
    [`${ROOT}/contents/apps`]: json(200, [{ name: "server", path: "apps/server", type: "dir" }])
  }))
  const card = fileListCardOf(opened.store)
  expect(card?.kind === "file-list" ? card.payload : undefined).toMatchObject({ path: "apps", ref: "main" })

  const refused = await enter(`/${REPO}/tree/feature/login/apps`, signedOut({}))
  expect(fileListCardOf(refused.store)).toBeUndefined()
  const notice = noticeTexts(refused.store).find(text => text.includes("feature/login/apps"))
  expect(notice).toContain("Only its default branch main is known here")
  expect(notices(refused.store).find(message => message.text === notice)?.action)
    .toMatchObject({ flow: "sign-in" })
  // The whole deep link is what a sign-in returns to.
  expect(signInReturnTo(window.location)).toBe(`/${REPO}/tree/feature/login/apps`)
})

test("an account change while the refs are being read opens no file", async () => {
  const backend = ownedRepository({
    [`${ROOT}/bookmarks`]: bookmarks("main"),
    [`${ROOT}/contents/apps/server/src/edge.ts`]: fileContents("export const edge = 1\n")
  })
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", `/${REPO}/blob/main/apps/server/src/edge.ts`)
  const target = requestedTarget(window.location)!
  const controller = createAppController(store, silentAgent, { bootstrap: WEB, repositoryApp: target.repo, ...backend.services })
  await controller.loadSession()
  const requestId = beginRepositoryEntry(store, target.repo)
  await openRequestedRepo(controller, backend.fetchImpl, target.repo, requestId)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "someone-else", admin: false, scopesPlain: null }).isPersisted.promise
  await settled()
  const before = backend.seen.length
  expect(await openRequestedSubject(controller, target.repo, target.subject, { requestId })).toBeUndefined()
  await settled()
  expect(fileCardOf(store)).toBeUndefined()
  expect(backend.seen.slice(before).filter(path => path.includes("/contents/"))).toEqual([])
})

test("a superseded admission request opens no file", async () => {
  const backend = ownedRepository({
    [`${ROOT}/bookmarks`]: bookmarks("main"),
    [`${ROOT}/contents/apps/server/src/edge.ts`]: fileContents("export const edge = 1\n")
  })
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", `/${REPO}/blob/main/apps/server/src/edge.ts`)
  const target = requestedTarget(window.location)!
  const controller = createAppController(store, silentAgent, { bootstrap: WEB, repositoryApp: target.repo, ...backend.services })
  await controller.loadSession()
  const stale = beginRepositoryEntry(store, target.repo)
  await openRequestedRepo(controller, backend.fetchImpl, target.repo, beginRepositoryEntry(store, target.repo))
  const before = backend.seen.length
  expect(await openRequestedSubject(controller, target.repo, target.subject, { requestId: stale })).toBeUndefined()
  await settled()
  expect(fileCardOf(store)).toBeUndefined()
  expect(backend.seen.slice(before).filter(path => path.includes("/contents/"))).toEqual([])
})

test("a file read the platform refuses is reported as that read's own refusal", async () => {
  const backend = ownedRepository({
    [`${ROOT}/bookmarks`]: bookmarks("main"),
    [`${ROOT}/contents/apps/missing.ts`]: json(404, { status: "error", code: "not_found" })
  })
  const { store, refusal } = await enter(`/${REPO}/blob/main/apps/missing.ts`, backend)
  expect(refusal ?? noticeTexts(store).join(" ")).toContain("apps/missing.ts")
  expect(fileCardOf(store)).toBeUndefined()
})

/*
 * The commit permalink, which is what GitHub's own "copy permalink" writes and
 * what every reader pastes out of a review: `/blob/<40 hex>/<path>`. No
 * bookmark list holds an object name, so dividing against the list alone
 * refused the ordinary link. The read is the same one a branch link runs —
 * `GET /api/repos/{o}/{r}/contents/{path}?ref=<revision>`, which the backend
 * already resolves for a revision — so nothing new is asked of the platform.
 */
const COMMIT = "3bad5fe63720eb8e3f7ae33a10de9e7aefb2dc74"

test("a commit permalink opens that file at that revision, through the same contents read", async () => {
  const backend = ownedRepository({
    [`${ROOT}/bookmarks`]: bookmarks("main", "release/1.2"),
    [`${ROOT}/contents/apps/server/src/edge.ts`]: fileContents("export const edge = 1\n")
  })
  const { store, refusal } = await enter(`/${REPO}/blob/${COMMIT}/apps/server/src/edge.ts`, backend)
  expect(refusal).toBeUndefined()
  const card = fileCardOf(store)
  expect(card?.kind === "file" ? card.payload : undefined).toMatchObject({
    repo: REPO, path: "apps/server/src/edge.ts", content: "export const edge = 1\n", ref: COMMIT
  })
  expect(backend.seen).toContain(`${ROOT}/contents/apps/server/src/edge.ts?ref=${COMMIT}`)
})

test("a commit permalink to a folder lists it at that revision, not at the head", async () => {
  const backend = ownedRepository({
    [`${ROOT}/bookmarks`]: bookmarks("main"),
    [`${ROOT}/contents/apps`]: json(200, [{ name: "server", path: "apps/server", type: "dir" }])
  })
  const { store, refusal } = await enter(`/${REPO}/tree/${COMMIT}/apps`, backend)
  expect(refusal).toBeUndefined()
  const card = fileListCardOf(store)
  expect(card?.kind === "file-list" ? card.payload : undefined).toMatchObject({ repo: REPO, path: "apps", ref: COMMIT })
  expect(card?.kind === "file-list" ? card.payload.readAt : "unset").toBeUndefined()
  expect(backend.seen).toContain(`${ROOT}/contents/apps?ref=${COMMIT}`)
})

/*
 * The permalink is the link a signed-out reader is handed most often, and the
 * bookmark list is an account's read. A full object name needs no list, so the
 * link opens without one — and the repository root a `/blob/<commit>` with no
 * path names is still a revision, not a branch.
 */
test("signed out, a commit permalink opens even though the bookmark list refuses", async () => {
  const backend = recordingBackend({
    "/api/user": json(401, { status: "error", code: "unauthorized" }),
    "/api/public/repos": json(200, { repos: [{ name: REPO, title: "e2e-verify", url: `https://github.com/${REPO}`, stats: null }] }),
    [ROOT]: json(200, { full_name: REPO, default_bookmark: "main" }),
    [`${ROOT}/bookmarks`]: json(401, { status: "error", code: "unauthorized" }),
    [`${ROOT}/contents/README.md`]: fileContents("# e2e\n")
  })
  const { store, refusal } = await enter(`/${REPO}/blob/${COMMIT}/README.md`, backend)
  expect(refusal).toBeUndefined()
  const card = fileCardOf(store)
  expect(card?.kind === "file" ? card.payload : undefined).toMatchObject({ path: "README.md", ref: COMMIT })
  expect(backend.seen).toContain(`${ROOT}/contents/README.md?ref=${COMMIT}`)
})

test("a commit URL with no file below it names the revision, and offers to browse it", async () => {
  const backend = ownedRepository({ [`${ROOT}/bookmarks`]: bookmarks("main") })
  const { store } = await enter(`/${REPO}/blob/${COMMIT}`, backend)
  expect(fileCardOf(store)).toBeUndefined()
  const notice = noticeTexts(store).find(text => text.includes(COMMIT))
  expect(notice).toContain(`names the commit ${COMMIT}`)
  expect(notice).not.toContain(`branch ${COMMIT}`)
  expect(notices(store).find(message => message.text === notice)?.action).toMatchObject({ flow: "files" })
})

test("an abbreviated object name is refused with the grammar's own reason, and reads nothing", async () => {
  const backend = ownedRepository({ [`${ROOT}/bookmarks`]: bookmarks("main", "release/1.2") })
  const { store, refusal } = await enter(`/${REPO}/blob/3bad5fe/apps/server/src/edge.ts`, backend)
  expect(refusal).toBeUndefined()
  expect(fileCardOf(store)).toBeUndefined()
  expect(backend.seen.filter(path => path.includes("src/edge.ts"))).toEqual([])
  const notice = noticeTexts(store).find(text => text.includes("3bad5fe/apps/server/src/edge.ts"))
  expect(notice).toContain(`No branch of ${REPO} begins it`)
  // What IS accepted is named, so a reader with a permalink knows what to paste.
  expect(notice).toContain("40-character commit id")
  expect(notices(store).find(message => message.text === notice)?.action).toMatchObject({ flow: "branches" })
})

test("a commit the platform cannot read is that read's own refusal, never a different revision", async () => {
  const missing = "0".repeat(40)
  const backend = ownedRepository({
    [`${ROOT}/bookmarks`]: bookmarks("main"),
    [`${ROOT}/contents/apps/server/src/edge.ts`]: (request: Request) =>
      new URL(request.url).searchParams.get("ref") === missing
        ? json(404, { status: "error", code: "not_found" })
        : fileContents("export const edge = 1\n")
  })
  const { store, refusal } = await enter(`/${REPO}/blob/${missing}/apps/server/src/edge.ts`, backend)
  expect(refusal ?? noticeTexts(store).join(" ")).toContain("apps/server/src/edge.ts")
  expect(fileCardOf(store)).toBeUndefined()
  // No second read at another revision: the URL named one, and only it was asked for.
  expect(backend.seen.filter(path => path.includes("src/edge.ts")))
    .toEqual([`${ROOT}/contents/apps/server/src/edge.ts?ref=${missing}`])
})

test("a stack-only repository landing shows its fallback and keeps Files reachable without launching work", async () => {
  const writes: string[] = []
  const backend = ownedRepository({
    [`${ROOT}/home`]: json(200, { kind: "blocks", blocks: [{ type: "stack", title: "Project work" }] }),
    [`${ROOT}/contents`]: json(200, [{ name: "README.md", path: "README.md", type: "file" }]),
    [`${ROOT}/flows`]: json(200, [])
  })
  const originalFetch = backend.fetchImpl
  backend.services.fetchImpl = async (input, init) => {
    if (init?.method !== undefined && init.method !== "GET") writes.push(init.method)
    return originalFetch(input, init)
  }
  const { store, controller } = await enter(`/${REPO}`, backend)
  const { host } = mount(controller)
  await settled()
  const home = host.querySelector('[data-testid="repository-home"]')
  expect(home).not.toBeNull()
  expect(home!.textContent).toContain("Project work")
  expect(home!.querySelector('[role="status"]')?.textContent).toBe("Stack unavailable")
  expect(writes).toEqual([])
  const files = home!.querySelector<HTMLButtonElement>(".repository-home-files")
  expect(files).not.toBeNull()
  flushSync(() => files!.click())
  await settled()
  expect([...store.collections.repoTree.values()]).toContainEqual(expect.objectContaining({
    copyId: `shared:${REPO}`, path: "", state: "loaded", entries: [{ name: "README.md", kind: "file" }]
  }))
  expect(writes).toEqual([])
})
