/*
 * #4038. A person reviewing a pull request must review the pull request the
 * card is showing — at the head the card is showing — and the verdict must
 * reach GitHub at most once per intent.
 *
 * This repository is a GitHub import, so its #2 is GitHub's pull request on
 * `upstream/project`, and the platform's own landings door answers a
 * DIFFERENT #2 under the same number. The detail reader already resolves the
 * source (`github_source`) and shows GitHub's. `reviewLanding` did not: it
 * read the native tip and POSTed the native `/landings/2/reviews`, so the
 * verdict a person typed against GitHub's pull request landed on the
 * platform's unrelated one and GitHub's was never reviewed.
 *
 * The fixture below is the collision itself: one repository, one number, two
 * subjects. Every door answers the shape it answers in production
 * (routes/github_user_repos.go for the GitHub surfaces, the landings routes
 * for the native ones), and every write is recorded so a test can say which
 * subject was written and how often.
 *
 * The review door admits a DURABLE operation and answers 202; this seam reads
 * the operation's own door until it settles, so a lost acknowledgment is a
 * read and never a second review.
 */
import { expect, test } from "bun:test"
import type { AppServices } from "../AppController"
import { createAppController } from "../AppController"
import { createAppStore } from "../AppStore"
import type { AppStore } from "../AppStore"
import { json, memoryStorage, unavailableAgent } from "../TestFixtures"

const REPO = "will/flows"
const SOURCE_REPO = "upstream/project"
const CLOUD = `/api/repos/${REPO}`
const PULLS = `/api/user/github-repos/${SOURCE_REPO}/pulls`
const REQUESTS = "/api/user/github-pull-review-requests"
const OPERATION = "10000000-0000-4000-8000-000000000001"
const HEAD_SHA = "0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6"
const MOVED_SHA = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432"

const IMPORT = { full_name: REPO, github_source: { owner: "upstream", repo: "project" } }
const NATIVE = { full_name: REPO }

/** GitHub's #2 on upstream/project, as routes/github_user_repos.go proxies it. */
const githubPull = (sha: string = HEAD_SHA, state = "open") => ({
  number: 2, title: "Add build-status line to README", body: "Resolves #1.",
  state, merged: state === "merged", draft: false, user: { login: "roninjin10" },
  head: { ref: "e2e-build-status", sha }, base: { ref: "main" },
  created_at: "2026-10-14T18:00:00Z", updated_at: "2026-10-14T18:00:00Z", commits: 1
})

/** The platform's OWN #2: a different pull request that happens to share the number. */
const nativeLanding = {
  number: 2, title: "Wire the native seam", state: "open", body: "Native change.",
  author: { id: 7, login: "will" }, change_ids: ["chg-a"], target_bookmark: "main",
  created_at: "2026-10-14T09:00:00.000Z", updated_at: "2026-10-14T09:00:00.000Z"
}

const README_DIFF = "diff --git a/README.md b/README.md\nindex 1111111..2222222 100644\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n # p\n+Build status: verified.\n"

/** The settled operation a completed review reads back. */
const completed = (sha: string = HEAD_SHA, state = "APPROVED") => ({
  operation_id: OPERATION, state: "completed", stage: "readback",
  review_id: 55, review_state: state, commit_id: sha, verified: true
})

interface Write {
  readonly path: string
  readonly body: unknown
}

interface World {
  readonly source?: unknown
  readonly pull?: () => Response
  /** Answers for POST …/pulls/2/reviews, in order; the last repeats. */
  readonly reviewWrite?: ReadonlyArray<(body: unknown) => Promise<Response> | Response>
  /** Answers for GET …/github-pull-review-requests/{id}, in order; the last repeats. */
  readonly reviewRequest?: ReadonlyArray<() => Promise<Response> | Response>
}

/** Every door this journey touches; `world` replaces the answers a test is about. */
const backend = (world: World = {}): AppServices & { readonly writes: Write[]; readonly reads: string[] } => {
  const writes: Write[] = []
  const reads: string[] = []
  let reviewWrite = 0
  let reviewRequest = 0
  return {
    writes,
    reads,
    fetchImpl: async (input, init) => {
      const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://app.test")
      const path = url.pathname
      const method = (init?.method ?? "GET").toUpperCase()
      if (method !== "GET") {
        const raw = typeof init?.body === "string" ? init.body : ""
        writes.push({ path, body: raw === "" ? undefined : JSON.parse(raw) })
        if (path === `${PULLS}/2/reviews`) {
          const answer = world.reviewWrite?.[Math.min(reviewWrite, world.reviewWrite.length - 1)]
          reviewWrite += 1
          return answer === undefined
            ? json(202, { operationId: OPERATION, requestId: "key", kind: "requested", state: "accepted", acceptedAt: "2026-10-16T00:00:00Z" })
            : answer(writes[writes.length - 1]?.body)
        }
        if (path === `${CLOUD}/landings/2/reviews`) return json(201, { id: 9 })
        return json(404, { message: `no stub for ${method} ${path}` })
      }
      reads.push(path)
      if (path === `${REQUESTS}/${OPERATION}`) {
        const answer = world.reviewRequest?.[Math.min(reviewRequest, world.reviewRequest.length - 1)]
        reviewRequest += 1
        return answer === undefined ? json(200, completed()) : answer()
      }
      if (path === CLOUD) return json(200, world.source ?? IMPORT)
      if (path === `${CLOUD}/issues`) return json(200, [])
      if (path === `${CLOUD}/landings`) return json(200, [nativeLanding])
      if (path === `${CLOUD}/landings/2`) return json(200, nativeLanding)
      if (path === `${CLOUD}/landings/2/reviews`) return json(200, [])
      if (path === `${CLOUD}/landings/2/changes`) return json(200, [])
      if (path === `${CLOUD}/landings/2/diff`) return json(200, {})
      if (path === `${CLOUD}/changes/chg-a`) return json(200, { commit_id: "nativecommit0000000000000000000000000000" })
      if (path === "/api/notifications/list") return json(200, [])
      if (path === `${PULLS}/2`) return world.pull?.() ?? json(200, githubPull())
      if (path === `${PULLS}/2/diff`) return new Response(README_DIFF, { status: 200, headers: { "content-type": "text/plain" } })
      if (path === `${PULLS}/2/commits`) return json(200, [])
      if (path.endsWith("/check-runs")) return json(200, { total_count: 0, check_runs: [] })
      if (path === `/api/user/github-repos/${REPO}/issues`) return json(200, [])
      return json(404, { message: `no stub for ${path}` })
    }
  }
}

const ready = async (services: AppServices) => {
  const store: AppStore = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, services)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "will", ownerKind: "user", name: "flows", head: null }
  ] }).isPersisted.promise
  return { store, controller }
}

/*
 * Reading the pull request IS what makes a review possible: the card retains
 * the head it was built from, and that is the head the verdict names. Every
 * review case below starts here, because this is the real app path — the
 * `prs.review` flow is hidden and the act comes off the mounted card.
 */
const mounted = async (services: AppServices) => {
  const world = await ready(services)
  // The read answers the card's own summary, not an error.
  expect(await world.controller.viewLanding(2, REPO)).toHaveProperty("value")
  const card = world.store.collections.cards.get(`pr-${REPO}-2`)
  expect(card?.kind).toBe("pr")
  return world
}

const reviewWrites = (writes: ReadonlyArray<Write>) => writes.map(write => write.path)

test("the mounted card retains the head it was read at", async () => {
  const services = backend()
  const { store, controller } = await mounted(services)
  try {
    const card = store.collections.cards.get(`pr-${REPO}-2`)
    expect(card?.kind === "pr" ? card.payload.headCommit : undefined).toBe(HEAD_SHA)
    expect(card?.kind === "pr" ? card.payload.sourceRepo : undefined).toBe(SOURCE_REPO)
  } finally { await controller.dispose() }
})

test("an approve on a GitHub-source pull request goes to GitHub's pull request, never the native landing of the same number", async () => {
  const services = backend()
  const { controller } = await mounted(services)
  try {
    expect(await controller.reviewLanding(2, "approve", "", REPO)).toBeUndefined()
    /* The collision: the native landing #2 is a DIFFERENT pull request. */
    expect(reviewWrites(services.writes)).not.toContain(`${CLOUD}/landings/2/reviews`)
    expect(reviewWrites(services.writes)).toEqual([`${PULLS}/2/reviews`])
    /* Pinned to the head the CARD was read at, with no actor field to forge. */
    expect(services.writes[0]?.body).toEqual({ event: "APPROVE", body: "", commit_id: HEAD_SHA })
    /* And the verdict is believed only on the operation's own receipt. */
    expect(services.reads).toContain(`${REQUESTS}/${OPERATION}`)
  } finally { await controller.dispose() }
})

test("request-changes and comment carry their GitHub event and the person's text", async () => {
  for (const [verdict, event, state] of [
    ["request_changes", "REQUEST_CHANGES", "CHANGES_REQUESTED"],
    ["comment", "COMMENT", "COMMENTED"]
  ] as const) {
    const services = backend({ reviewRequest: [() => json(200, completed(HEAD_SHA, state))] })
    const { controller } = await mounted(services)
    try {
      expect(await controller.reviewLanding(2, verdict, "  please rename it  ", REPO)).toBeUndefined()
      expect(services.writes[0]).toEqual({ path: `${PULLS}/2/reviews`, body: { event, body: "please rename it", commit_id: HEAD_SHA } })
    } finally { await controller.dispose() }
  }
})

/*
 * The reviewed-head fence. The card shows head A. The remote moves to B
 * before the verdict is typed. A fresh read at click time would answer B, so
 * a review pinned to "the head now" would approve code nobody read. Nothing
 * is submitted.
 */
test("a pull request whose head moved after it was read is never approved at the new head", async () => {
  let head = HEAD_SHA
  const services = backend({ pull: () => json(200, githubPull(head)) })
  const { store, controller } = await mounted(services)
  try {
    const card = store.collections.cards.get(`pr-${REPO}-2`)
    expect(card?.kind === "pr" ? card.payload.headCommit : undefined).toBe(HEAD_SHA)
    // Somebody force-pushes.
    head = MOVED_SHA
    const answer = await controller.reviewLanding(2, "approve", "", REPO)
    expect(answer).toContain("moved to a new head commit")
    expect(answer).toContain("Read it again")
    expect(services.writes).toEqual([])
  } finally { await controller.dispose() }
})

test("a pull request that was never read here has no reviewed head and is not reviewed", async () => {
  const services = backend()
  const { controller } = await ready(services)
  try {
    const answer = await controller.reviewLanding(2, "approve", "", REPO)
    expect(answer).toContain("before reviewing it")
    expect(services.writes).toEqual([])
  } finally { await controller.dispose() }
})

test("a native repository still reviews its native landing", async () => {
  const services = backend({ source: NATIVE })
  const { controller } = await ready(services)
  try {
    expect(await controller.reviewLanding(2, "comment", "looks fine", REPO)).toBeUndefined()
    expect(reviewWrites(services.writes)).toEqual([`${CLOUD}/landings/2/reviews`])
    expect(services.writes[0]?.body).toEqual({ type: "comment", body: "looks fine", commit_id: "nativecommit0000000000000000000000000000" })
  } finally { await controller.dispose() }
})

test("an unresolved source writes nothing", async () => {
  const services = backend({ source: { full_name: REPO, github_source_ambiguous: true } })
  const { controller } = await ready(services)
  try {
    expect(await controller.reviewLanding(2, "approve", "", REPO)).toContain("more than one GitHub source")
    expect(services.writes).toEqual([])
  } finally { await controller.dispose() }
})

test("a pull request GitHub no longer offers for review is not written", async () => {
  let state = "open"
  const services = backend({ pull: () => json(200, githubPull(HEAD_SHA, state)) })
  const { controller } = await mounted(services)
  try {
    // The card was read while it was open; GitHub now answers merged.
    state = "merged"
    expect(await controller.reviewLanding(2, "approve", "", REPO)).toContain("no longer be reviewed")
    expect(services.writes).toEqual([])
  } finally { await controller.dispose() }
})

test("a readback at another head is not reported as success", async () => {
  const services = backend({ reviewRequest: [() => json(200, { ...completed(), commit_id: MOVED_SHA })] })
  const { controller } = await mounted(services)
  try {
    expect(await controller.reviewLanding(2, "approve", "", REPO)).toContain("didn't confirm")
  } finally { await controller.dispose() }
})

test("an unverified receipt is not reported as success and is never replayed", async () => {
  const services = backend({ reviewRequest: [() => json(200, { ...completed(), verified: false })] })
  const { controller } = await mounted(services)
  try {
    expect(await controller.reviewLanding(2, "approve", "", REPO)).toContain("didn't confirm")
    expect(reviewWrites(services.writes)).toEqual([`${PULLS}/2/reviews`])
  } finally { await controller.dispose() }
})

/*
 * An uncertain operation: the submit may have reached GitHub. The sentence
 * says so and sends the person to GitHub, and the verdict is NOT submitted
 * again.
 */
test("an uncertain operation stays uncertain and writes once", async () => {
  const services = backend({
    reviewRequest: [() => json(200, { operation_id: OPERATION, state: "uncertain", stage: "submit", code: "github_review_uncertain", verified: false })]
  })
  const { controller } = await mounted(services)
  try {
    const answer = await controller.reviewLanding(2, "approve", "", REPO)
    expect(answer).toContain("unknown")
    expect(answer).toContain("not sent again")
    expect(reviewWrites(services.writes)).toEqual([`${PULLS}/2/reviews`])
  } finally { await controller.dispose() }
})

/*
 * Surviving a reload. The operation lives on the server under a key the
 * SERVER derives from the actor and the intent, so pressing the same verdict
 * after a reload joins it: the door answers the same operation id, and the
 * app reads it rather than submitting again. Here the admission answers
 * `joined` and the operation is already settled.
 */
test("the same verdict after a reload reads the one operation instead of submitting again", async () => {
  const services = backend({
    reviewWrite: [() => json(202, { operationId: OPERATION, requestId: "key", kind: "requested", state: "completed", acceptedAt: "2026-10-16T00:00:00Z", joined: true })]
  })
  const { controller } = await mounted(services)
  try {
    expect(await controller.reviewLanding(2, "approve", "", REPO)).toBeUndefined()
    expect(reviewWrites(services.writes)).toEqual([`${PULLS}/2/reviews`])
    expect(services.reads.filter(read => read === `${REQUESTS}/${OPERATION}`)).toHaveLength(1)
  } finally { await controller.dispose() }
})

/* A still-running operation is reported as still running — which is true. */
test("an operation still running is reported, not retried", async () => {
  const services = backend({ reviewRequest: [() => json(200, { operation_id: OPERATION, state: "running", verified: false })] })
  const { controller } = await mounted(services)
  try {
    const answer = await controller.reviewLanding(2, "approve", "", REPO)
    expect(answer).toContain("still being submitted")
    expect(answer).toContain("Nothing was repeated")
    expect(reviewWrites(services.writes)).toEqual([`${PULLS}/2/reviews`])
  } finally { await controller.dispose() }
}, 60000)

test("a settled refusal names its own act and writes nothing more", async () => {
  for (const [code, sentence] of [
    ["review_head_moved", "moved to a new head commit"],
    ["pull_request_not_open", "no longer open"],
    ["reauthorize_github", "Sign in with GitHub again"],
    ["github_permission", "refused this account"],
    ["actor_changed", "GitHub account changed"],
    ["rate_limited", "rate-limiting"],
    ["github_rejected_review", "refused the review"]
  ] as const) {
    const services = backend({
      reviewRequest: [() => json(200, { operation_id: OPERATION, state: "failed", stage: "submit", code, verified: false })]
    })
    const { controller } = await mounted(services)
    try {
      expect(await controller.reviewLanding(2, "approve", "", REPO)).toContain(sentence)
      expect(reviewWrites(services.writes)).toEqual([`${PULLS}/2/reviews`])
    } finally { await controller.dispose() }
  }
})

test("a revoked GitHub credential is an actionable refusal, not a native write", async () => {
  const services = backend({ reviewWrite: [() => json(403, { code: "github_permission", message: "GitHub did not grant access to a required resource." })] })
  const { controller } = await mounted(services)
  try {
    expect(await controller.reviewLanding(2, "approve", "", REPO)).toContain("couldn't be posted to GitHub")
    expect(reviewWrites(services.writes)).not.toContain(`${CLOUD}/landings/2/reviews`)
  } finally { await controller.dispose() }
})

test("a repository that changed while the source was resolving writes nothing", async () => {
  const services = backend()
  const { store, controller } = await mounted(services)
  const typed = services.fetchImpl
  services.writes.length = 0
  try {
    const pending = controller.reviewLanding(2, "approve", "", REPO)
    await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-out", login: null, admin: false, scopesPlain: null }).isPersisted.promise
    expect(await pending).toContain("changed while")
    expect(services.writes).toEqual([])
    expect(typed).toBe(services.fetchImpl)
  } finally { await controller.dispose() }
})
