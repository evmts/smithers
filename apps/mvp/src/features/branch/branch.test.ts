// Opening a branch's page (decision 0013 §1-§2, docs/features/branch-workspace.md#tracking-a-branch): the browser's own
// layer (`appLayer`) on a Node device whose engine leads, against ChatApi's real `POST /api/branches`
// (worker/branch/Branches.ts, src/test/chatApi.ts) over the compose Postgres and Electric. The forge is GitHub with no
// credential, and GitHub is scripted at the network (worker/test/branch.ts `gitHost`). `branch/track`'s client and step
// are also driven over an injected `fetch` for the answers ChatApi's route never gives a valid request: a body cut
// short, a stalled answer, 400 and 413 (test.faults-by-injection).
import { Uuid, WebCrypto } from "@smthrs/crypto"
import { Effect, Layer, Logger, Metric } from "effect"
import { FetchHttpClient } from "effect/http"
import { SqlClient } from "effect/sql"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Actor } from "../../../worker/Actor.ts"
import { shaOf } from "../../../worker/test/branch.ts"
import { dispatches } from "../../flows/dispatch"
import {
  type ChatApiOptions,
  failingWorker,
  nodeDevice,
  openTestApp,
  type TabOptions,
  TestChatApi,
} from "../../test/chatApi"
import { Chat } from "../chat/chat"
import { BranchClient, TrackRefused } from "./api"
import { Branch } from "./branch"
import { CONVERSATION_NAMESPACE } from "./contract"
import { BranchTrackRefused, BranchTrackUnavailable } from "./flows"
import { opens, tracks } from "./metrics"
import { requestTrack } from "./steps"

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

/** How long a flow may take on the device's engine, its first start included, on a loaded machine. */
const until = (assertion: () => void | Promise<void>, timeout = 40_000) => vi.waitFor(assertion, { timeout, interval: 20 })

/** A test's budget: flows on a fresh device's engine, each with its first start, on a loaded machine. */
const WITHIN = 90_000

const conversationOf = (branchId: string) =>
  Effect.runPromise(Uuid.v5(CONVERSATION_NAMESPACE, branchId).pipe(Effect.provide(WebCrypto.layer)))

/** The app on a ChatApi whose GitHub has `octo/hello`, with `main` (its default) and `feature/one`. */
const open = async (options: TabOptions = {}, chatApi: ChatApiOptions = {}) => {
  const runtime = openTestApp(options, chatApi)
  runtimes.push(runtime)
  const branch = await runtime.runPromise(Effect.service(Branch))
  const chat = await runtime.runPromise(Effect.service(Chat))
  const api = await runtime.runPromise(Effect.service(TestChatApi))
  branch.queries.current.startSyncImmediate()
  chat.queries.place.startSyncImmediate()
  api.branches.github.publish("octo", "hello", {
    defaultBranch: "main",
    branches: { main: shaOf("main"), "feature/one": shaOf("feature/one") },
  })
  return {
    runtime,
    api,
    actions: branch.actions,
    current: () => branch.queries.current.toArray[0],
    /** The conversation this tab shows and asks in: a branch's id, or `null` for the home one. */
    place: () => chat.queries.place.toArray[0]?.conversationId,
    /** The branch's rows Postgres holds for `octo/hello`. */
    rows: () =>
      runtime.runPromise(api.branches.run(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly name: string; readonly mode: string }>`
          SELECT name, mode FROM branches WHERE repo_id = 'github/octo/hello' ORDER BY name`))),
    opened: (outcome: string) => runtime.runSync(Metric.value(Metric.withAttributes(opens, { outcome }))).count,
    dispatched: () =>
      runtime.runSync(
        Metric.value(Metric.withAttributes(dispatches, { flow: "branch/track", door: "view", outcome: "done" })),
      ).count,
  }
}

const none = { owner: "", repo: "", name: "", status: "none", branchId: null, conversationId: null, mode: null }

describe("opening a branch", () => {
  test("tracking at once, then ready with its ids and mode; the tab shows and asks in its conversation", async () => {
    const tab = await open()
    expect(tab.current()).toMatchObject(none)

    const opening = tab.actions.open("octo", "hello", "feature/one")

    // The page renders tracking before anything waits.
    expect(tab.current()).toMatchObject({ owner: "octo", repo: "hello", name: "feature/one", status: "tracking", branchId: null })
    const branchId = await opening
    const conversationId = await conversationOf(branchId!)
    expect(tab.current()).toMatchObject({
      id: "current",
      owner: "octo",
      repo: "hello",
      name: "feature/one",
      status: "ready",
      branchId,
      conversationId,
      mode: "open",
    })
    expect(tab.place()).toBe(conversationId)
    expect(tab.opened("ready")).toBe(1)
    expect(await tab.rows()).toEqual([{ name: "feature/one", mode: "open" }])

    // The repository's default branch is locked: changes reach it only by merge.
    await tab.actions.open("octo", "hello", "main")
    expect(tab.current()).toMatchObject({ name: "main", status: "ready", mode: "locked" })
    expect(tab.place()).toBe(tab.current()?.conversationId)

    // Leaving shows the home conversation again.
    await tab.actions.leave()
    expect(tab.current()).toMatchObject(none)
    expect(tab.place()).toBeNull()

    // A branch the app tracks answers at once: GitHub isn't read again, and Postgres keeps one row.
    const reads = tab.api.branches.github.seen.length
    expect(await tab.actions.open("octo", "hello", "feature/one")).toBe(branchId)
    expect(tab.api.branches.github.seen).toHaveLength(reads)
    expect(await tab.rows()).toEqual([{ name: "feature/one", mode: "open" }, { name: "main", mode: "locked" }])
    expect(tab.dispatched()).toBe(3)
  }, WITHIN)

  test("an answer that comes after the tab moved on, to another branch or home, isn't shown", async () => {
    const tab = await open()

    // Home before the branch is tracked: its answer leaves the tab at home.
    const left = tab.actions.open("octo", "hello", "feature/one")
    await tab.actions.leave()
    expect(await left).toBeUndefined()
    expect(tab.current()).toMatchObject(none)
    expect(tab.place()).toBeNull()

    // Another branch's page before the first answers: the tab shows the one it moved to.
    const first = tab.actions.open("octo", "hello", "feature/one")
    const second = tab.actions.open("octo", "hello", "main")
    expect(await first).toBeUndefined()
    const mainId = await second
    expect(tab.current()).toMatchObject({ name: "main", status: "ready", branchId: mainId, mode: "locked" })
    expect(tab.place()).toBe(tab.current()?.conversationId)
    expect(tab.opened("ready")).toBe(1)
    // Both were tracked: only showing them waited on the page.
    expect(await tab.rows()).toEqual([{ name: "feature/one", mode: "open" }, { name: "main", mode: "locked" }])
  }, WITHIN)

  test("a name that can't be a branch or a repository, such as a commit's path, is missing and asks nobody", async () => {
    const tab = await open()

    for (const [owner, repo, ref] of [["octo", "hello", "a..b"], ["octo", "hello", ""], ["-octo", "hello", "main"]]) {
      expect(await tab.actions.open(owner!, repo!, ref!)).toBeUndefined()
      expect(tab.current()).toMatchObject({ owner, repo, name: ref, status: "missing", branchId: null, conversationId: null })
    }

    expect(tab.api.branches.github.seen).toEqual([])
    expect(tab.dispatched()).toBe(0)
    // Counted by the dispatch's outcome, which these never had.
    expect(tab.opened("missing")).toBe(0)
    expect(tab.place()).toBeNull()
  }, WITHIN)

  test("a branch GitHub doesn't have is missing, at once: a refusal isn't tried again", async () => {
    const tab = await open()

    expect(await tab.actions.open("octo", "hello", "nope")).toBeUndefined()

    expect(tab.current()).toMatchObject({ name: "nope", status: "missing", branchId: null, conversationId: null, mode: null })
    expect(tab.opened("missing")).toBe(1)
    // One read of the branch, never a second: the flow ended with the refusal.
    expect(tab.api.branches.github.seen.map(({ method, prefixes }) => [method, prefixes])).toEqual([
      ["POST", ["refs/heads/nope"]],
    ])
    expect(await tab.rows()).toEqual([])
    expect(tab.place()).toBeNull()
  }, WITHIN)

  test("ChatApi unavailable is tried again by the step's retry policy, and the branch is tracked once", async () => {
    const tab = await open()
    // GitHub's first answer never comes: ChatApi answers 503, and the step asks again 500 ms later.
    tab.api.branches.github.fail("POST", "throw")

    const branchId = await tab.actions.open("octo", "hello", "feature/one")

    expect(branchId).toEqual(expect.any(String))
    expect(tab.current()).toMatchObject({ status: "ready", branchId })
    expect(tab.api.branches.github.seen.map(({ method }) => method)).toEqual(["POST", "POST", "GET"])
    expect(await tab.rows()).toEqual([{ name: "feature/one", mode: "open" }])
  }, WITHIN)

  test.each<[string, Actor | null, string]>([
    ["signed out", null, "sign_in"],
    ["a Guest", { subject: { kind: "person", id: "person-guest" }, role: "guest" }, "forbidden"],
  ])("%s may not watch a branch: %s, and nothing is recorded", async (_who, actor, status) => {
    const tab = await open({}, { actor })

    expect(await tab.actions.open("octo", "hello", "feature/one")).toBeUndefined()

    expect(tab.current()).toMatchObject({ status, branchId: null, conversationId: null })
    expect(tab.opened(status)).toBe(1)
    expect(tab.api.branches.github.seen).toEqual([])
    expect(await tab.rows()).toEqual([])
  }, WITHIN)

  test("a tab whose engine can't run fails to open the branch, and keeps the home conversation", async () => {
    const tab = await open({ host: nodeDevice({ engineWorker: failingWorker }) })

    expect(await tab.actions.open("octo", "hello", "feature/one")).toBeUndefined()

    expect(tab.current()).toMatchObject({ name: "feature/one", status: "failed", branchId: null })
    expect(tab.opened("failed")).toBe(1)
    expect(tab.place()).toBeNull()
  }, WITHIN)
})

/** `BranchClient` over `fetch`, as the engine's host builds it: what one track answers, or its refusal. */
const client = (fetch: typeof globalThis.fetch, within?: "50 millis") =>
  Effect.runPromise(
    Effect.flatMap(Effect.service(BranchClient), (branches) =>
      branches.track({ owner: "octo", name: "hello", ref: "feature/one" })).pipe(
        Effect.match({ onSuccess: (tracked) => tracked, onFailure: (refused) => refused }),
        Effect.provide(
          BranchClient.layer({ origin: "http://chat.test", ...(within === undefined ? {} : { within }) }).pipe(
            Layer.provide(FetchHttpClient.layer),
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
          ),
        ),
      ),
  )

const trackedBody = {
  branchId: "0b5d7d1c-6f1d-4a65-9d7e-2c1a9c2f4b11",
  conversationId: "6a3c2d0e-8a8b-5c1f-9e0a-1d2b3c4d5e6f",
  repoId: "github/octo/hello",
  name: "feature/one",
  mode: "open",
}

describe("the branch client", () => {
  test("posts the branch; 200 or 201 with the branch is tracked, and anything else is a TrackRefused", async () => {
    const posted: Array<{ readonly url: string; readonly body: unknown }> = []
    const recording: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      posted.push({ url: request.url, body: await request.json() })
      return Response.json(trackedBody, { status: 201 })
    }
    expect(await client(recording)).toEqual(trackedBody)
    expect(posted).toEqual([{ url: "http://chat.test/api/branches", body: { owner: "octo", name: "hello", ref: "feature/one" } }])
    expect(await client(async () => Response.json(trackedBody))).toEqual(trackedBody)

    expect(await client(() => Promise.reject(new TypeError("offline")))).toEqual(new TrackRefused({}))
    expect(await client(() => new Promise(() => {}), "50 millis")).toEqual(new TrackRefused({}))
    expect(await client(async () => Response.json({ code: "not_found" }, { status: 404 }))).toEqual(
      new TrackRefused({ status: 404, code: "not_found" }),
    )
    // A code the contract doesn't name, or no JSON at all, is still a refusal, by its status.
    expect(await client(async () => Response.json({ code: "teapot" }, { status: 418 }))).toEqual(
      new TrackRefused({ status: 418 }),
    )
    expect(await client(async () => new Response("busy", { status: 503 }))).toEqual(new TrackRefused({ status: 503 }))
    const cut = new ReadableStream({ start: (controller) => controller.error(new TypeError("cut")) })
    expect(await client(async () => new Response(cut, { status: 502 }))).toEqual(new TrackRefused({ status: 502 }))
    // A success outside the contract can't be shown: refused, by its status.
    expect(await client(async () => Response.json({ branchId: 1 }, { status: 200 }))).toEqual(
      new TrackRefused({ status: 200 }),
    )
  })
})

describe("the step", () => {
  /** `branch/track/request` over a client that answers `answer`: how it ended, and every record it left. */
  const step = async (answer: () => Promise<Response>, branch = "feature/one") => {
    const registry: Metric.MetricRegistry = new Map()
    const logs: Array<ReturnType<typeof Logger.formatStructured.log>> = []
    const logger = Logger.make((options) => void logs.push(Logger.formatStructured.log(options)))
    const exit = await Effect.runPromise(
      requestTrack({ repo: "octo/hello", branch }).pipe(
        Effect.match({ onSuccess: (tracked) => ({ tracked }), onFailure: (failed) => ({ failed }) }),
        Effect.provide(
          BranchClient.layer({ origin: "http://chat.test", within: "50 millis" }).pipe(
            Layer.provide(FetchHttpClient.layer),
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, () => answer())),
          ),
        ),
        Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
    )
    const count = (outcome: string) =>
      Effect.runSync(
        Metric.value(Metric.withAttributes(tracks, { outcome })).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
      ).count
    return { exit, logs, count }
  }

  test.each<[number, BranchTrackRefused | BranchTrackUnavailable, string]>([
    [400, new BranchTrackRefused({ reason: "invalid" }), "invalid"],
    [413, new BranchTrackRefused({ reason: "invalid" }), "invalid"],
    [401, new BranchTrackRefused({ reason: "sign_in" }), "sign_in"],
    [403, new BranchTrackRefused({ reason: "forbidden" }), "forbidden"],
    [404, new BranchTrackRefused({ reason: "not_found" }), "not_found"],
    [503, new BranchTrackUnavailable(), "unavailable"],
    [409, new BranchTrackUnavailable(), "unavailable"],
  ])("ChatApi's %s is %s, counted and logged by its outcome and status", async (status, failure, outcome) => {
    const { exit, logs, count } = await step(async () => Response.json({ code: "x" }, { status }))

    expect(exit).toEqual({ failed: failure })
    expect(count(outcome)).toBe(1)
    expect(logs).toEqual([
      expect.objectContaining({
        level: "WARN",
        message: "branch.track",
        annotations: expect.objectContaining({ outcome, status, feature: "branch", durationMs: expect.any(Number) }),
      }),
    ])
  })

  test("tracked is counted and logged as Info; no answer at all is unavailable, with no status; never the branch's name", async () => {
    const sentinel = "feature/sentinel-41c9"
    const tracked = await step(async () => Response.json({ ...trackedBody, name: sentinel }, { status: 201 }), sentinel)
    expect(tracked.exit).toEqual({ tracked: { ...trackedBody, name: sentinel } })
    expect(tracked.count("tracked")).toBe(1)
    expect(tracked.logs).toEqual([
      expect.objectContaining({
        level: "INFO",
        message: "branch.track",
        annotations: expect.objectContaining({ outcome: "tracked", feature: "branch" }),
      }),
    ])
    expect(tracked.logs[0]!.annotations).not.toHaveProperty("status")

    const stalled = await step(() => new Promise(() => {}), sentinel)
    expect(stalled.exit).toEqual({ failed: new BranchTrackUnavailable() })
    expect(stalled.count("unavailable")).toBe(1)
    expect(stalled.logs[0]).toMatchObject({ level: "WARN", annotations: { outcome: "unavailable" } })
    expect(stalled.logs[0]!.annotations).not.toHaveProperty("status")

    expect(JSON.stringify([tracked.logs, stalled.logs])).not.toContain("sentinel")
  })
})
