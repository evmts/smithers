/*
 * #3831 items 1 and 4: the writes `/issue.new`, `/issue.comment` and
 * `/wiki.page` offer on the bootstrap production actually serves.
 *
 * All three branched on `install` alone, so the hosted app — which serves
 * `cloud` with the design FIXTURE off (https://smithers.sh/api/bootstrap) —
 * fell into the seeded world, whose writes work with the fixture off
 * (state/seams/DesignWorld/index.ts). `/issue.new` then answers
 * "Opened #N on GitHub" for a row it wrote in memory, `/issue.comment`
 * "Commented on #N" for a thread nobody can read, and `/wiki.page` opens a
 * page the repository does not have. Same class as #3879 and #3865.
 *
 * The doors each host really serves: an install opens GitHub's issue through
 * its App (POST /api/issues) and its GitHub comment is a member confirmation
 * the server performs (backend compose/member_commands.go), with no browser
 * port; Smithers Cloud writes its repository's own tracker through
 * `issues.create` and `issues.comment`, and its wiki through `openWikiPage`.
 * `/issue.new` stays GitHub's door — its summary and the design canon's
 * submit verb say so — so on Cloud it names `issues.create` the way
 * `issues.create` names it back ("Use /issue.new on this install."), instead
 * of substituting one source for the other.
 */
import { expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import type { AppServices } from "../../state/AppController"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"
import { json, memoryStorage, unavailableAgent } from "../../state/TestFixtures"

const REPO = "roninjin10/e2e-verify"
const ISSUES = `/api/repos/roninjin10/e2e-verify/issues`
const WIKI_INDEX = `/api/repos/roninjin10/e2e-verify/wiki/navigation/index`

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

const createdIssue = {
  id: 700, number: 12, title: "Overnight-write-20261014", body: "Reproduction", state: "open", kind: "issue", visibility: "public",
  labels: [], assignees: [], author: { id: 8, login: "roninjin10" }, milestone_id: null, comment_count: 0,
  created_at: "2026-10-14T13:50:00Z", updated_at: "2026-10-14T13:50:00Z", closed_at: null
}
const postedComment = {
  id: 41, issue_id: 500, user_id: 8, commenter: "roninjin10", body: "Reversible overnight test comment", type: "comment",
  created_at: "2026-10-14T13:52:00Z", updated_at: "2026-10-14T13:52:00Z"
}
const existingIssue = { ...createdIssue, id: 500, number: 5, title: "Overnight-browser-20261014-0017", comment_count: 1 }

type Call = { readonly method: string; readonly path: string; readonly body?: unknown }

const hosted = async (options: { readonly bootstrap?: AppBootstrap | undefined; readonly routes?: Record<string, unknown>; readonly forbid?: ReadonlyArray<string> } = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: Call[] = []
  const routes = options.routes ?? {}
  const services: AppServices = {
    ...("bootstrap" in options && options.bootstrap === undefined ? {} : { bootstrap: options.bootstrap ?? HOSTED }),
    toastDebounceMs: 0,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://smithers.sh")
      const method = (init?.method ?? "GET").toUpperCase()
      const text = typeof init?.body === "string" ? init.body : undefined
      calls.push({ method, path: url.pathname, ...(text === undefined ? {} : { body: JSON.parse(text) as unknown }) })
      const answer = routes[`${method} ${url.pathname}`]
      if (answer === undefined) return json(404, { status: "error", code: "not_found", message: `no stub for ${method} ${url.pathname}` })
      /* The host's availability contract for a feature it keeps off (backend middleware/feature_flag.go). */
      return json(options.forbid?.includes(url.pathname) === true ? 403 : 200, answer)
    }
  }
  const controller = createAppController(store, unavailableAgent, services)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "roninjin10", ownerKind: "user", name: "e2e-verify", head: { bookmark: "main", changeId: "c", commitId: "k" } }
  ] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: REPO }).isPersisted.promise
  await controller.secretAuthority?.read(REPO)
  calls.length = 0
  return { store, controller, calls }
}

/** The seeded world is the only thing a mock write can touch; production never serves it. */
const seedState = (controller: { readonly design: { readonly rows: (table: string) => ReadonlyArray<any> } }) =>
  JSON.stringify(controller.design.rows("issues").map(row => [row.number, row.title, row.comments.length]))

test("the hosted app's canonical /issue.new names the door that writes this host's issues, and seeds none", async () => {
  const h = await hosted({ routes: {
    [`POST ${ISSUES}`]: createdIssue,
    [`GET ${ISSUES}/12`]: createdIssue,
    [`GET ${ISSUES}/12/comments`]: []
  } })
  try {
    expect(h.controller.design.enabled).toBe(false)
    const before = seedState(h.controller as never)
    /* The GitHub door is the install's; this host is told which door is its own. */
    expect(await h.controller.runCommandForResult("issue.new", JSON.stringify({ title: createdIssue.title, body: "Reproduction" })))
      .toEqual({ status: "failed", error: "Use /issues.create on Smithers Cloud." })
    /* No fabricated GitHub outcome, no write of any kind, and no seeded issue. */
    expect(h.calls).toEqual([])
    expect(seedState(h.controller as never)).toBe(before)
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("design:"))).toEqual([])
    /* The named door is the one that works here, with the person's own body. */
    const created = await h.controller.runCommandForResult("issues.create", `${createdIssue.title} ${REPO}`)
    expect(created).toMatchObject({ status: "executed" })
    expect(h.calls[0]).toEqual({ method: "POST", path: ISSUES, body: { title: createdIssue.title } })
    expect(h.store.collections.cards.get(`issue-${REPO}-12`)).toMatchObject({ kind: "issue", payload: { repo: REPO, number: 12, title: createdIssue.title } })
  } finally { await h.controller.dispose() }
})

test("the hosted app's canonical /issue.comment posts to the repository's own issue, and claims nothing else", async () => {
  const h = await hosted({ routes: {
    [`POST ${ISSUES}/5/comments`]: postedComment,
    [`GET ${ISSUES}/5`]: existingIssue,
    [`GET ${ISSUES}/5/comments`]: [postedComment]
  } })
  try {
    const before = seedState(h.controller as never)
    const outcome = await h.controller.runCommandForResult("issue.comment", "#5 Reversible overnight test comment")
    expect(outcome).toMatchObject({ status: "executed" })
    expect(h.calls[0]).toEqual({ method: "POST", path: `${ISSUES}/5/comments`, body: { body: "Reversible overnight test comment" } })
    expect(seedState(h.controller as never)).toBe(before)
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("design:"))).toEqual([])
  } finally { await h.controller.dispose() }
})

test("an install writes both its GitHub-App issue doors and never the Cloud tracker", async () => {
  const h = await hosted({ bootstrap: INSTALL, routes: {
    "POST /api/issues": { operationId: "op-1" }, "GET /api/issues/requests/op-1": { state: "running" },
    "POST /api/issues/5/comments": { operationId: "op-2", kind: "requested" }
  } })
  try {
    const before = seedState(h.controller as never)
    expect(await h.controller.runCommandForResult("issue.new", JSON.stringify({ title: "Install issue", body: "Body" }))).toMatchObject({ status: "executed" })
    expect(h.calls.filter(call => call.method === "POST")).toEqual([{ method: "POST", path: "/api/issues", body: { title: "Install issue", body: "Body" } }])
    h.calls.length = 0
    /*
     * The comment used to answer "a member confirmation on this install, not
     * an app write yet" and keep the comment the person had written. It goes
     * to the install's own GitHub comment door now — never to the Cloud
     * tracker, whose same-numbered row is a different issue.
     */
    const comment = await h.controller.runCommandForResult("issue.comment", "#5 Install comment")
    expect(comment).toMatchObject({ status: "executed" })
    expect(h.calls.filter(call => call.method === "POST")).toEqual([{ method: "POST", path: "/api/issues/5/comments", body: { body: "Install comment" } }])
    expect(seedState(h.controller as never)).toBe(before)
  } finally { await h.controller.dispose() }
})

test("the seeded design preview still writes and answers both commands, and asks no backend for them", async () => {
  const h = await hosted({ bootstrap: undefined })
  try {
    expect(h.controller.design.enabled).toBe(true)
    const opened = await h.controller.runCommandForResult("issue.new", JSON.stringify({ title: "Invoice totals round wrong", body: "42.004 prints as 42.00" }))
    expect(opened).toMatchObject({ status: "executed" })
    expect(h.controller.design.rows("issues").some(row => row.title === "Invoice totals round wrong")).toBe(true)
    const commented = await h.controller.runCommandForResult("issue.comment", "#231 Both mailers handle password.reset")
    expect(commented).toMatchObject({ status: "executed", value: "Commented on #231" })
    expect(h.controller.design.rows("issues").find(row => row.number === 231)?.comments.at(-1)?.text).toBe("Both mailers handle password.reset")
    expect(h.calls).toEqual([])
  } finally { await h.controller.dispose() }
})

test("a host that serves neither Cloud issues nor an install refuses both writes before touching anything", async () => {
  const h = await hosted({ bootstrap: WITHOUT_CLOUD })
  try {
    const before = seedState(h.controller as never)
    expect(await h.controller.runCommandForResult("issue.new", JSON.stringify({ title: "Nowhere", body: "Nothing" })))
      .toEqual({ status: "failed", error: "Opening an issue needs the GitHub App install or Smithers Cloud." })
    expect(await h.controller.runCommandForResult("issue.comment", "#5 Nowhere"))
      .toEqual({ status: "failed", error: "Commenting on an issue needs the GitHub App install or Smithers Cloud." })
    expect(h.calls).toEqual([])
    expect(seedState(h.controller as never)).toBe(before)
  } finally { await h.controller.dispose() }
})

/*
 * The c3ca production bug. On this origin `/issue.new` with no arguments
 * opened the Title / Body / "Open on GitHub" form FIRST, and only the submit
 * — after the person had written the issue — answered "Use /issues.create on
 * Smithers Cloud.", and then only inside a generic failure's Details.
 *
 * THE FORM LAW asks for the input a flow is MISSING. It was never a licence
 * to collect input this origin has no door to spend, and the ordering in
 * `flows/Commands.ts` put the form ahead of the one check that knew. A door
 * whose refusal does not read the payload declares it as `unavailable`
 * (entries/Declare.ts), which the catalog answers before any field is asked
 * for — so the slash line, the bare slash, the "New issue" button's named
 * submit (cards/SubjectCards.tsx) and the agent all say the same sentence.
 */
test("the hosted app's /issue.new names the door that is its own BEFORE any form, through every trigger", async () => {
  const h = await hosted({ routes: { [`POST ${ISSUES}`]: createdIssue } })
  const refused = { status: "failed", error: "Use /issues.create on Smithers Cloud." } as const
  try {
    const cards = h.store.collections.cards.size
    // The bare line: nothing is asked for, because nothing could be sent.
    expect(await h.controller.runCommandForResult("issue.new")).toEqual(refused)
    // A title and no body: the one field the form used to collect is never requested.
    expect(await h.controller.runCommandForResult("issue.new", createdIssue.title)).toEqual(refused)
    // The button's named submit, with and without the body, cannot be typed past it.
    expect(await h.controller.commands.submit({ name: "issue.new", payload: { title: createdIssue.title }, actor: "user" })).toEqual(refused)
    expect(await h.controller.commands.submit({ name: "issue.new", payload: { title: createdIssue.title, body: "Reproduction" }, actor: "user" })).toEqual(refused)
    // No form card opened, and nothing was posted to any host.
    expect([...h.store.collections.cards.values()].filter(card => card.kind === "flow-form")).toEqual([])
    expect(h.store.collections.cards.size).toBe(cards)
    expect(h.calls.filter(call => call.method === "POST")).toEqual([])
  } finally { await h.controller.dispose() }
})

test("where the issue door does run, /issue.new still asks for the body it is missing", async () => {
  /* THE FORM LAW, unchanged: the install's GitHub App door and the design preview both ask. */
  for (const bootstrap of [INSTALL, undefined]) {
    const h = await hosted({ bootstrap, routes: { "POST /api/issues": { operationId: "op-1" }, "GET /api/issues/requests/op-1": { state: "running" } } })
    try {
      const asked = await h.controller.runCommandForResult("issue.new", createdIssue.title)
      expect(asked).toMatchObject({ status: "form", flow: "issue.new", fields: ["body"] })
      const form = h.store.collections.cards.get(asked.status === "form" ? asked.cardId : "")
      expect(form?.kind === "flow-form" ? form.payload : undefined)
        .toMatchObject({ flow: "issue.new", given: { title: createdIssue.title }, submitLabel: "Open on GitHub" })
    } finally { await h.controller.dispose() }
  }
})

/*
 * The same defect, one door over. `/issue.comment`'s refusal reads the HOST
 * and nothing else — an install has no browser port for the GitHub comment,
 * and an origin with neither door has nowhere to put it — yet it was declared
 * as `preflight`, which `Commands.settle` cannot reach until a payload exists.
 * So an install answered `/issue.comment` with the Issue / Comment form,
 * collected the comment a person wrote, and refused on the submit: the c3ca
 * shape exactly, with more of the person's work thrown away.
 */
test("/issue.comment names the door it does not have BEFORE the form, through every trigger", async () => {
  for (const [bootstrap, error] of [
    [WITHOUT_CLOUD, "Commenting on an issue needs the GitHub App install or Smithers Cloud."]
  ] as const) {
    const h = await hosted({ bootstrap, routes: { [`POST ${ISSUES}/5/comments`]: postedComment, "POST /api/issues/5/comments": postedComment } })
    const refused = { status: "failed", error } as const
    try {
      const cards = h.store.collections.cards.size
      // The bare line, and a number with no comment: neither field is ever asked for.
      expect(await h.controller.runCommandForResult("issue.comment")).toEqual(refused)
      expect(await h.controller.runCommandForResult("issue.comment", "#5")).toEqual(refused)
      // The card button's named submit cannot be typed past it either.
      expect(await h.controller.commands.submit({ name: "issue.comment", payload: { number: 5 }, actor: "user" })).toEqual(refused)
      expect(await h.controller.commands.submit({ name: "issue.comment", payload: { number: 5, body: "Install comment" }, actor: "user" })).toEqual(refused)
      // No form card opened, and no host was asked to store the comment.
      expect([...h.store.collections.cards.values()].filter(card => card.kind === "flow-form")).toEqual([])
      expect(h.store.collections.cards.size).toBe(cards)
      expect(h.calls.filter(call => call.method === "POST")).toEqual([])
    } finally { await h.controller.dispose() }
  }
})

test("where the comment door does run, /issue.comment still asks for the comment it is missing", async () => {
  /* THE FORM LAW, unchanged: the Cloud origin and the design preview both ask. */
  for (const bootstrap of [HOSTED, undefined]) {
    const h = await hosted({ bootstrap, routes: { [`GET ${ISSUES}/5`]: existingIssue, [`GET ${ISSUES}/5/comments`]: [] } })
    try {
      const asked = await h.controller.runCommandForResult("issue.comment", "#5")
      expect(asked).toMatchObject({ status: "form", flow: "issue.comment", fields: ["body"] })
      const form = h.store.collections.cards.get(asked.status === "form" ? asked.cardId : "")
      expect(form?.kind === "flow-form" ? form.payload : undefined)
        .toMatchObject({ flow: "issue.comment", given: { number: 5 }, submitLabel: "Comment" })
    } finally { await h.controller.dispose() }
  }
})

/*
 * The nearest sibling with the same seed fallback: `/wiki.page` branched on
 * `install` alone, so the hosted app — `cloud`, fixture off — created a page
 * in the seeded world and opened it as though the repository had one. The
 * Cloud door (GET /api/repos/{owner}/{repo}/wiki/navigation/index, then its
 * own create) is already wired behind `openWikiPage`; the hosted launch
 * contract keeps the wiki feature off (plue#675), and its 403 is the honest
 * answer.
 */
test("the hosted app's /wiki.page asks the repository's own wiki, and seeds no page when the feature is off", async () => {
  const h = await hosted({ routes: { [`GET ${WIKI_INDEX}`]: { status: "error", code: "forbidden", message: "feature not available" } }, forbid: [WIKI_INDEX] })
  try {
    const before = h.controller.design.rows("wiki").length
    const outcome = await h.controller.runCommandForResult("wiki.page", "Overnight runbook")
    expect(outcome.status).toBe("failed")
    /* The repository's own wiki answered; nothing was seeded and no mock card opened. */
    expect(h.calls.map(call => `${call.method} ${call.path}`)).toEqual([`GET ${WIKI_INDEX}`])
    expect(h.controller.design.rows("wiki").length).toBe(before)
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("design:"))).toEqual([])
  } finally { await h.controller.dispose() }
})

/*
 * The read beside these writes, pinned because a typed `/issue 5` looked like
 * it did nothing on the hosted app (2026-10-14): the view on screen did not
 * change. It is not a missing lookup and not a palette argument that was
 * dropped — the command reads the repository's own issue and navigates the
 * repository pane IN PLACE, keeping the card id and the transcript ordinal
 * `/issues` gave it, so a pane that has scrolled away refreshes where it is.
 * Whether that card is brought back into view is presentation, not source.
 */
test("a typed /issue n over an open list reads the Cloud door and navigates the same pane card in place", async () => {
  const h = await hosted({ routes: {
    [`GET ${ISSUES}`]: [existingIssue],
    [`GET ${ISSUES}/5`]: existingIssue,
    [`GET ${ISSUES}/5/comments`]: [postedComment],
    [`GET /api/repos/roninjin10/e2e-verify/issue-views`]: [],
    [`GET /api/user/github-repos/roninjin10/e2e-verify/issues`]: []
  } })
  try {
    expect(await h.controller.runCommandForResult("issues")).toMatchObject({ status: "executed" })
    const list = h.store.collections.cards.get(`issues-${REPO}`)
    expect(list).toMatchObject({ kind: "issue-list" })
    h.calls.length = 0
    expect(await h.controller.runCommandForResult("issue", "5")).toMatchObject({ status: "executed" })
    expect(h.calls.map(call => `${call.method} ${call.path}`)).toEqual([`GET ${ISSUES}/5`, `GET ${ISSUES}/5/comments`])
    /* The same card, the same place: one pane, not a second row and not a seeded card. */
    const pane = h.store.collections.cards.get(`issues-${REPO}`)
    expect(pane).toMatchObject({ kind: "issue", ordinal: list!.ordinal, payload: { repo: REPO, number: 5, title: existingIssue.title } })
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("design:"))).toEqual([])
  } finally { await h.controller.dispose() }
})

/*
 * The same refusal, asked by the agent. `/issue.new` states its unavailability
 * in `preflight`, which Commands.ts runs BEFORE the confirm step, so an agent
 * that asks for a door this host does not serve reads the refusal. Its sibling
 * `/issue.comment` stated the same refusals from the HANDLER, which runs only
 * after the person has confirmed: the agent was answered "asked the user to
 * confirm", a confirmation message was posted to the transcript, and the write
 * the person authorized could never happen. A door that cannot write must say
 * so before it asks anyone to authorize it.
 */
test("an agent asking /issue.comment on a host with no comment door reads the refusal, and no one is asked to authorize it", async () => {
  for (const [bootstrap, refusal] of [
    [WITHOUT_CLOUD, "Commenting on an issue needs the GitHub App install or Smithers Cloud."]
  ] as const) {
    const h = await hosted({ bootstrap })
    try {
      const before = seedState(h.controller as never)
      expect(await h.controller.commands.runForAgent("issue.comment", "#5 Agent comment")).toEqual({ status: "failed", error: refusal })
      /* Nothing authorized, nothing written, nothing seeded. */
      expect([...h.store.collections.messages.values()].filter(message => message.action?.flow === "issue.comment")).toEqual([])
      expect(h.calls.filter(call => call.method !== "GET")).toEqual([])
      expect(seedState(h.controller as never)).toBe(before)
    } finally { await h.controller.dispose() }
  }
})

test("an agent asking /issue.comment where the door does write is still the person's confirmation", async () => {
  // The install's own GitHub comment door is such a door too, since it writes.
  const install = await hosted({ bootstrap: INSTALL, routes: { "POST /api/issues/5/comments": { operationId: "op-2", kind: "requested" } } })
  try {
    expect(await install.controller.commands.runForAgent("issue.comment", "#5 Agent comment"))
      .toMatchObject({ status: "executed", value: expect.stringContaining("asked the user to confirm") })
    expect(install.calls.filter(call => call.method !== "GET")).toEqual([])
  } finally { await install.controller.dispose() }
  const h = await hosted({ routes: { [`POST ${ISSUES}/5/comments`]: postedComment } })
  try {
    expect(await h.controller.commands.runForAgent("issue.comment", "#5 Agent comment"))
      .toMatchObject({ status: "executed", value: expect.stringContaining("asked the user to confirm") })
    expect(h.calls.filter(call => call.method !== "GET")).toEqual([])
  } finally { await h.controller.dispose() }
})
