import { Persistence } from "@smthrs/effect-tanstack-db"
import { Effect, Layer, Option } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { openTab, type Tab } from "../../test/repoDevice"
import { AuthStore } from "../auth/store"
import { RepoClient, RepoRefused } from "./api"
import { CAPACITY_COPY, FAILURE_COPY, SIGN_IN_TO_CLONE } from "./contract"
import { cloneClicks, clones, opens, permalinkCopies } from "./metrics"
import { VIEW } from "./rows"
import { RepoStore } from "./store"
import { headerOf } from "./view"

// The repository state machine's unhappy paths, driven as React drives it, with no React: RepoApi refusing, unreachable
// or answering without Electric delivering, given to the tab as a faulty `RepoClient`, and a shape source that is
// down (test.faults-by-injection). RepoApi's real answers are in repo.test.ts.

const ORIGIN = "http://smithers.test"

const tabs: Array<Tab> = []
afterEach(async () => {
  for (const tab of tabs.splice(0)) await tab.dispose()
})

/** A client whose `clone` answers `answer`, counting its calls; reads are never expected. */
const cloning = (answer: () => Effect.Effect<{ txid: number; id: string; attempt: number }, RepoRefused>) => {
  const calls: Array<string> = []
  const layer = Layer.succeed(
    RepoClient,
    RepoClient.of({
      clone: (owner, name) => Effect.suspend(() => (calls.push(`${owner}/${name}`), answer())),
      tree: () => Effect.die(new Error("no reads in this test")),
      blob: () => Effect.die(new Error("no reads in this test")),
    }),
  )
  return { calls, layer }
}

const open = async (client: Layer.Layer<RepoClient>, options: { readonly auth?: Layer.Layer<AuthStore> } = {}) => {
  const tab = await openTab({ origin: ORIGIN, client, shapes: "down", confirmWithin: "100 millis", ...options })
  tabs.push(tab)
  return tab
}

/** The header the tab shows for `owner/name`'s view. */
const header = (tab: Tab) => {
  const { repository, clone, view } = tab.view()
  return headerOf(repository, clone, view.signedIn)
}

describe("cloning when RepoApi doesn't take it", () => {
  test("a name that isn't a GitHub repository asks nothing", async () => {
    const client = cloning(() => Effect.die(new Error("not sent")))
    const tab = await open(client.layer)
    expect(tab.repo.actions.clone("api", "x")).toBe(false)
    expect(tab.repo.actions.clone("octocat", "..")).toBe(false)
    expect(client.calls).toEqual([])
    expect(tab.count(cloneClicks, { kind: "clone" })).toBe(0)
  })

  test("signed out (401): the header asks to sign in, counted and logged with the status", async () => {
    const client = cloning(() => Effect.fail(new RepoRefused({ status: 401, code: "authentication" })))
    const tab = await open(client.layer)
    tab.repo.actions.open({ owner: "octocat", name: "Spoon-Knife", kind: "tree", ref: null, path: "", line: null, lineEnd: null })
    expect(tab.repo.actions.clone("octocat", "Spoon-Knife")).toBe(true)
    await vi.waitFor(() => expect(header(tab)).toEqual({ kind: "sign_in", text: SIGN_IN_TO_CLONE }))
    expect(tab.count(clones, { outcome: "sign_in" })).toBe(1)
    expect(tab.lines("repo.clone")[0]!.annotations).toMatchObject({ outcome: "sign_in", status: 401, feature: "repo" })
  })

  test("past the repository limit (429), imports are paused, and Try again asks again", async () => {
    const client = cloning(() => Effect.fail(new RepoRefused({ status: 429, code: "repository_limit" })))
    const tab = await open(client.layer)
    tab.repo.actions.open({ owner: "octocat", name: "Spoon-Knife", kind: "tree", ref: null, path: "", line: null, lineEnd: null })
    tab.repo.actions.clone("octocat", "Spoon-Knife")
    await vi.waitFor(() => expect(header(tab)).toEqual({ kind: "refused", text: CAPACITY_COPY.paused }))
    tab.repo.actions.retryClone("octocat", "Spoon-Knife")
    await vi.waitFor(() => expect(tab.count(clones, { outcome: "limit" })).toBe(2))
    expect(client.calls).toEqual(["octocat/Spoon-Knife", "octocat/Spoon-Knife"])
    expect(tab.count(cloneClicks, { kind: "clone" })).toBe(1)
    expect(tab.count(cloneClicks, { kind: "retry" })).toBe(1)
  })

  test("no answer, or another refusal, fails with Try again; the log names the outcome", async () => {
    let answer: RepoRefused = new RepoRefused({})
    const client = cloning(() => Effect.fail(answer))
    const tab = await open(client.layer)
    tab.repo.actions.open({ owner: "o", name: "n", kind: "tree", ref: null, path: "", line: null, lineEnd: null })
    tab.repo.actions.clone("o", "n")
    await vi.waitFor(() => expect(header(tab)).toEqual({ kind: "refused", text: FAILURE_COPY.unavailable }))
    expect(tab.count(clones, { outcome: "unreachable" })).toBe(1)
    expect(tab.lines("repo.clone")[0]!.annotations).not.toHaveProperty("status")
    answer = new RepoRefused({ status: 503, code: "not_configured" })
    tab.repo.actions.retryClone("o", "n")
    await vi.waitFor(() => expect(tab.count(clones, { outcome: "refused" })).toBe(1))
    expect(header(tab)).toEqual({ kind: "refused", text: FAILURE_COPY.unavailable })
  })

  test("taken, but Electric never delivers the row: failed, unconfirmed", async () => {
    const client = cloning(() => Effect.succeed({ txid: 42, id: "github/o/n", attempt: 1 }))
    const tab = await open(client.layer)
    tab.repo.actions.open({ owner: "o", name: "n", kind: "tree", ref: null, path: "", line: null, lineEnd: null })
    tab.repo.actions.clone("o", "n")
    await vi.waitFor(() => expect(tab.count(clones, { outcome: "unconfirmed" })).toBe(1))
    expect(header(tab)).toEqual({ kind: "refused", text: FAILURE_COPY.unavailable })
  })

  test("Clone shows cloning at once, and a press while the request is on its way sends nothing more", async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const client = cloning(() =>
      Effect.andThen(Effect.promise(() => held), Effect.fail(new RepoRefused({ status: 500 })))
    )
    const tab = await open(client.layer)
    tab.repo.actions.open({ owner: "o", name: "n", kind: "tree", ref: null, path: "", line: null, lineEnd: null })
    tab.repo.actions.clone("o", "n")
    expect(header(tab)).toEqual({ kind: "cloning" })
    tab.repo.actions.clone("o", "n")
    expect(client.calls).toEqual(["o/n"])
    release()
    await vi.waitFor(() => expect(tab.count(clones, { outcome: "refused" })).toBe(1))
  })
})

describe("sign-in, when the app has it", () => {
  test("a signed-out person sees the sign-in link in Clone's place, and a signed-in one Clone", async () => {
    const client = cloning(() => Effect.die(new Error("not sent")))
    const tab = await open(client.layer, { auth: AuthStore.layer.pipe(Layer.provide(Persistence.memory)) })
    tab.repo.actions.open({ owner: "o", name: "n", kind: "tree", ref: null, path: "", line: null, lineEnd: null })
    expect(tab.view().view.signedIn).toBeNull()
    const set = (status: "signed_in" | "signed_out" | "unreachable") =>
      tab.runtime.runPromise(
        Effect.flatMap(Effect.service(AuthStore), ({ session }) =>
          Effect.orDie(session.update("session", (row) => void (row.status = status)))
        ),
      )
    await set("signed_out")
    await vi.waitFor(() => expect(header(tab)).toEqual({ kind: "sign_in", text: SIGN_IN_TO_CLONE }))
    await set("signed_in")
    await vi.waitFor(() => expect(tab.view().view.signedIn).toBe(true))
    expect(header(tab)).toEqual({ kind: "clone" })
    // Sign-in couldn't say: Clone stays, and RepoApi decides.
    await set("unreachable")
    await vi.waitFor(() => expect(tab.view().view.signedIn).toBeNull())
    expect(header(tab)).toEqual({ kind: "clone" })
  })
})

describe("opening a view", () => {
  test("a reserved or invalid name is missing at once, and loads nothing", async () => {
    const client = cloning(() => Effect.die(new Error("not sent")))
    const tab = await open(client.layer)
    tab.repo.actions.openRoute("tree", { owner: "api", repo: "x" }, {})
    expect(tab.view().view).toMatchObject({ missing: true, repoId: null, owner: "api" })
    expect(tab.count(opens, { kind: "tree" })).toBe(1)
    expect(tab.lines("repo.open")[0]!.annotations).toMatchObject({ kind: "tree", feature: "repo" })
  })

  test("a repository the device doesn't have yet waits, holding where the URL said", async () => {
    const client = cloning(() => Effect.die(new Error("not sent")))
    const tab = await open(client.layer)
    tab.repo.actions.openRoute("blob", { owner: "o", repo: "n", ref: "main", _splat: "a.ts" }, { L: "2-5" })
    expect(tab.view().view).toMatchObject({
      repoId: "github/o/n",
      kind: "blob",
      ref: "main",
      path: "a.ts",
      line: 2,
      lineEnd: 5,
      missing: false,
      sha: null,
    })
    expect(tab.view().repository).toBeUndefined()
    expect(tab.tree().tree).toBeUndefined()
    expect(tab.repo.lookups.repository("github/o/n")).toBeUndefined()
    expect(tab.repo.lookups.readme("github/o/n", "f".repeat(40), "")).toBeUndefined()
    // Another location replaces it.
    tab.repo.actions.open({ owner: "o", name: "n", kind: "tree", ref: null, path: "", line: null, lineEnd: null })
    expect(tab.view().view).toMatchObject({ kind: "tree", path: "", line: null })
  })

  test("Copy permalink does nothing before the view has a commit", async () => {
    const client = cloning(() => Effect.die(new Error("not sent")))
    const tab = await open(client.layer)
    tab.repo.actions.copyPermalink()
    await tab.runtime.runPromise(Effect.yieldNow)
    expect(tab.copied).toEqual([])
    expect(tab.count(permalinkCopies, { outcome: "copied" })).toBe(0)
    const view = await tab.runtime.runPromise(
      Effect.flatMap(Effect.service(RepoStore), ({ view }) => view.get(VIEW)),
    )
    expect(Option.getOrThrow(view).sha).toBeNull()
  })
})
