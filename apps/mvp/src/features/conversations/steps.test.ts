// Your conversations' client and steps (docs/features/conversations.md#flows) over an injected `fetch`, for the answers
// ChatApi's routes never give a valid request: no network, a stalled answer, a body it can't read, and each refusal
// (test.faults-by-injection). The routes themselves are worker/branch/ConversationPeople.test.ts; the flows on a device,
// conversations.test.ts.
import { tmpdir } from "node:os"
import { join } from "node:path"
import { WebCrypto } from "@smthrs/crypto"
import { FlowRuntime } from "@smthrs/flow"
import { Effect, Layer, Logger, Metric } from "effect"
import { FetchHttpClient } from "effect/http"
import { describe, expect, test } from "vitest"
import { BranchClient } from "../branch/api"
import { BranchTrackRefused, BranchTrackUnavailable } from "../branch/flows"
import { BranchStore } from "../branch/store"
import { persistenceOn } from "../../test/deviceFixture"
import { ArchiveNotTaken, ConversationsClient } from "./api"
import { NEW_BRANCH_PREFIX } from "./contract"
import { ArchiveRefused, ArchiveUnsent } from "./flows"
import { archives, news } from "./metrics"
import { pinRepository } from "./pin"
import { failureOf, requestArchive, requestNew, stamp } from "./steps"

const ID = "6a3c2d0e-8a8b-5c1f-9e0a-1d2b3c4d5e6f"

/** The services the steps reach ChatApi through, over `fetch`, giving up after 50 ms. */
const clients = (fetch: typeof globalThis.fetch) =>
  Layer.mergeAll(
    ConversationsClient.layer({ origin: "http://chat.test", within: "50 millis" }),
    BranchClient.layer({ origin: "http://chat.test", within: "50 millis" }),
  ).pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)))

/** `effect` over `fetch`: how it ended, its log lines, and a counter's count by attributes. */
const run = async <A, E>(effect: Effect.Effect<A, E, ConversationsClient | BranchClient>, fetch: typeof globalThis.fetch) => {
  const registry: Metric.MetricRegistry = new Map()
  const logs: Array<ReturnType<typeof Logger.formatStructured.log>> = []
  const logger = Logger.make((options) => void logs.push(Logger.formatStructured.log(options)))
  const exit = await Effect.runPromise(
    effect.pipe(
      Effect.match({ onSuccess: (done) => ({ done }), onFailure: (failed) => ({ failed }) }),
      Effect.provide(clients(fetch)),
      Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  )
  const count = (metric: typeof archives, attributes: Record<string, string>) =>
    Effect.runSync(Metric.value(Metric.withAttributes(metric, attributes)).pipe(Effect.provideService(Metric.MetricRegistry, registry)))
      .count
  return { exit, logs, count }
}

const archiveOf = (fetch: typeof globalThis.fetch) =>
  run(Effect.flatMap(ConversationsClient, (client) => client.archive({ conversationId: ID, archived: true, at: 5 })), fetch)

describe("the archive client", () => {
  test("posts the act; a 200 took it, whatever its body says; anything else is ArchiveNotTaken", async () => {
    const posted: Array<{ readonly url: string; readonly body: unknown }> = []
    const recording: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      posted.push({ url: request.url, body: await request.json() })
      return Response.json({ archived: true, txid: 7 })
    }
    expect((await archiveOf(recording)).exit).toEqual({ done: { archived: true } })
    expect(posted).toEqual([
      { url: "http://chat.test/api/conversations/archive", body: { conversationId: ID, archived: true, at: 5 } },
    ])

    // A 200 whose body can't be read still took the act: logged, never sent again.
    const malformed = await archiveOf(async () => new Response("ok"))
    expect(malformed.exit).toEqual({ done: { archived: true } })
    expect(malformed.logs.map((line) => line.message)).toContain("conversation.archive.malformed")

    expect((await archiveOf(() => Promise.reject(new TypeError("offline")))).exit)
      .toEqual({ failed: new ArchiveNotTaken({ reason: "unreachable" }) })
    expect((await archiveOf(() => new Promise(() => {}))).exit).toEqual({ failed: new ArchiveNotTaken({ reason: "timeout" }) })
    expect((await archiveOf(async () => Response.json({ code: "forbidden" }, { status: 403 }))).exit)
      .toEqual({ failed: new ArchiveNotTaken({ status: 403, code: "forbidden" }) })
    expect((await archiveOf(async () => new Response("busy", { status: 503 }))).exit)
      .toEqual({ failed: new ArchiveNotTaken({ status: 503 }) })
  })
})

describe("conversation/archive/request", () => {
  test.each<[number | undefined, ArchiveRefused | ArchiveUnsent]>([
    [400, new ArchiveRefused({ status: 400 })],
    [404, new ArchiveRefused({ status: 404 })],
    [499, new ArchiveRefused({ status: 499 })],
    [408, new ArchiveUnsent()],
    [429, new ArchiveUnsent()],
    [500, new ArchiveUnsent()],
    [399, new ArchiveUnsent()],
    [undefined, new ArchiveUnsent()],
  ])("ChatApi's %s is %s: a 4xx but 408 and 429 is final, anything else is tried again", (status, failure) => {
    expect(failureOf(new ArchiveNotTaken(status === undefined ? {} : { status }))).toEqual(failure)
  })

  /** The step for `request`, run as `executionId`: a person's press, or, `<answer id>/…`, the agent's call. */
  const archiveStep = (
    request: { readonly conversationId?: string; readonly archived: boolean; readonly at: number },
    fetch: typeof globalThis.fetch,
    executionId = "press-1",
  ) =>
    run(
      requestArchive(request).pipe(
        Effect.provideService(FlowRuntime.FlowInstance, { executionId } as FlowRuntime.FlowInstance["Service"]),
      ),
      fetch,
    )

  test("the conversation named; for the agent's call naming none, the one its answer is in; a person's naming none, nothing", async () => {
    const posted: Array<unknown> = []
    const recording: typeof globalThis.fetch = async (input, init) => {
      posted.push(await new Request(input, init).json())
      return Response.json({ archived: true, txid: 1 })
    }
    const answerId = "0B5D7D1C-6F1D-4A65-9D7E-2C1A9C2F4B11"
    expect((await archiveStep({ archived: true, at: 2 }, recording, `${answerId}/call/0`)).exit)
      .toEqual({ done: { archived: true } })
    expect((await archiveStep({ conversationId: ID.toUpperCase(), archived: true, at: 3 }, recording, `${answerId}/call/1`)).exit)
      .toEqual({ done: { archived: true } })
    expect(posted).toEqual([
      { answerId: answerId.toLowerCase(), archived: true, at: 2 },
      { conversationId: ID, archived: true, at: 3 },
    ])
    const none = await archiveStep({ archived: true, at: 4 }, recording)
    expect(none.exit).toEqual({ failed: new ArchiveRefused({ status: 400 }) })
    expect(posted).toHaveLength(2)
  })

  test("sent, refused and unsent are counted and logged by archived and outcome, with ChatApi's status", async () => {
    const step = (fetch: typeof globalThis.fetch) => archiveStep({ conversationId: ID, archived: false, at: 9 }, fetch)
    const sent = await step(async () => Response.json({ archived: false, txid: null }))
    expect(sent.exit).toEqual({ done: { archived: false } })
    expect(sent.count(archives, { archived: "false", outcome: "sent" })).toBe(1)
    expect(sent.logs[0]).toMatchObject({ level: "INFO", message: "conversation.archive", annotations: { conversationId: ID, outcome: "sent" } })

    const refused = await step(async () => Response.json({ code: "not_found" }, { status: 404 }))
    expect(refused.exit).toEqual({ failed: new ArchiveRefused({ status: 404 }) })
    expect(refused.count(archives, { archived: "false", outcome: "refused" })).toBe(1)
    expect(refused.logs[0]).toMatchObject({ level: "WARN", annotations: { outcome: "refused", status: 404 } })

    const unsent = await step(() => Promise.reject(new TypeError("offline")))
    expect(unsent.exit).toEqual({ failed: new ArchiveUnsent() })
    expect(unsent.count(archives, { archived: "false", outcome: "unsent" })).toBe(1)
    expect(unsent.logs[0]!.annotations).not.toHaveProperty("status")
  })
})

describe("conversation/new/request", () => {
  const made = {
    branchId: "0b5d7d1c-6f1d-4a65-9d7e-2c1a9c2f4b11",
    conversationId: ID,
    repoId: "github/octo/hello",
    name: "topic",
    mode: "open",
    access: "owner",
    shared: false,
  }
  const step = (
    request: { readonly repo?: string; readonly branch?: string },
    fetch: typeof globalThis.fetch,
    executionId = "run-1",
  ) =>
    run(
      requestNew({ ...request, at: 77 }).pipe(
        // Only the execution id is read.
        Effect.provideService(FlowRuntime.FlowInstance, { executionId } as FlowRuntime.FlowInstance["Service"]),
        Effect.provide(WebCrypto.layer),
      ),
      fetch,
    )

  test("asks for the branch named, in the repository named as the person typed it, and answers its page's path", async () => {
    const posted: Array<unknown> = []
    const answer = await step({ repo: "Octo/Hello", branch: "topic" }, async (input, init) => {
      posted.push(await new Request(input, init).json())
      return Response.json(made, { status: 201 })
    })
    expect(posted).toEqual([
      { owner: "Octo", name: "Hello", ref: "topic", create: true, request: expect.any(String), openedAt: 77 },
    ])
    expect(answer.exit).toEqual({ done: { ...made, path: "/Octo/Hello/tree/topic" } })
    expect(answer.count(news, { outcome: "made" })).toBe(1)
    expect(answer.logs[0]).toMatchObject({ level: "INFO", message: "conversation.new", annotations: { conversationId: ID } })
    expect(JSON.stringify(answer.logs)).not.toContain("topic")
  })

  test("without a repository or a name: the deployment's own, named for the run, the same name every time it runs", async () => {
    const asked: Array<{ readonly ref: string }> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const body = await new Request(input, init).json() as { readonly ref: string }
      asked.push(body)
      return Response.json({ ...made, repoId: "github/smithersai/smithers", name: body.ref }, { status: 201 })
    }
    const first = await step({}, fetch, "run-7")
    await step({}, fetch, "run-7")
    await step({}, fetch, "run-8")
    expect(asked[0]).toEqual({
      ref: expect.stringMatching(new RegExp(`^${NEW_BRANCH_PREFIX}[0-9a-f]{6}$`)),
      create: true,
      request: expect.stringMatching(/^[0-9a-f-]{36}$/),
      openedAt: 77,
    })
    // The run's request is the same every time it runs, and its name its first six hex digits.
    expect((asked[1] as { readonly request?: string }).request).toBe((asked[0] as { readonly request?: string }).request)
    expect(asked[1]!.ref).toBe(asked[0]!.ref)
    expect(asked[2]!.ref).not.toBe(asked[0]!.ref)
    expect(first.exit).toEqual({ done: expect.objectContaining({ path: `/smithersai/smithers/tree/${asked[0]!.ref}` }) })
  })

  test("a refusal is its reason, counted; no answer is unavailable", async () => {
    const exists = await step({ branch: "taken" }, async () => Response.json({ code: "exists" }, { status: 409 }))
    expect(exists.exit).toEqual({ failed: new BranchTrackRefused({ reason: "exists" }) })
    expect(exists.count(news, { outcome: "exists" })).toBe(1)
    expect(exists.logs[0]).toMatchObject({ level: "WARN", annotations: { outcome: "exists", status: 409 } })

    const down = await step({ branch: "topic" }, () => Promise.reject(new TypeError("offline")))
    expect(down.exit).toEqual({ failed: new BranchTrackUnavailable() })
    expect(down.count(news, { outcome: "unavailable" })).toBe(1)
  })
})

describe("an act's time", () => {
  test("is the payload's when it has one, else the clock's now, as the stamp step records it once", async () => {
    expect(await Effect.runPromise(stamp({ archived: true, at: 5 }))).toEqual({ archived: true, at: 5 })
    const now = await Effect.runPromise(stamp({ repo: "octo/hello" }))
    expect(now).toEqual({ repo: "octo/hello", at: expect.any(Number) })
    expect(Math.abs(now.at - Date.now())).toBeLessThan(5_000)
  })
})

describe("/new's repository", () => {
  const pin = (payload: Record<string, unknown>, current?: { readonly owner: string; readonly repo: string }) =>
    Effect.runPromise(
      current === undefined
        ? pinRepository(payload)
        : Effect.gen(function* () {
          const { current: row } = yield* BranchStore
          yield* Effect.orDie(row.update("current", (draft) => void Object.assign(draft, current)))
          return yield* pinRepository(payload)
        }).pipe(
          Effect.provide(BranchStore.layer),
          // The branch store keeps a row on the device, in a store of this test's own.
          Effect.provide(persistenceOn(join(tmpdir(), `pin-${crypto.randomUUID()}.sqlite`))),
        ),
    )

  test("the branch the tab shows names it; home, or a payload naming one, keeps the payload", async () => {
    expect(await pin({ branch: "x" }, { owner: "octo", repo: "hello" })).toEqual({ branch: "x", repo: "octo/hello" })
    expect(await pin({ repo: "a/b" }, { owner: "octo", repo: "hello" })).toEqual({ repo: "a/b" })
    // Home: the branch store's row names no branch.
    expect(await pin({}, { owner: "", repo: "" })).toEqual({})
    // No branch store at all, as in a frontend without the workspace.
    expect(await pin({}, { owner: "", repo: "hello" })).toEqual({})
    expect(await pin({})).toEqual({})
  })
})
