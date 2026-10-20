// Issues on the tab (decision 0012 slice G0, docs/features/issues.md), driven as React drives them: the issues layer's
// plain actions, its live queries and the slash commands, with no React. Each device runs the browser's own layer
// (`appLayer`) on a Node device whose engine leads (src/test/chatApi.ts), against ChatApi's real handler and its git
// routes (worker/github/Api.ts) over the compose Postgres and Electric. No remote host runs here: a test writes what
// GitHub's flows would (the write's settlement and GitHub's row), through the server's own store
// (worker/github/Store.ts). Only the model is scripted. Unhappy paths give the tab a faulty `IssuesClient`, the real one
// behind switches (test.faults-by-injection), or a host capability that fails (an outbox storage that refuses).
import { Outbox } from "@smthrs/effect-tanstack-db"
import { GitHub } from "@smthrs/integrations"
import { Effect, Layer, type ManagedRuntime, Metric } from "effect"
import { SqlClient } from "effect/sql"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Actor } from "../../../worker/Actor.ts"
import * as Store from "../../../worker/github/Store.ts"
import { CHATAPI_ORIGIN, failingWorker, nodeDevice, openTab, openTestApp, type TabOptions, TEST_REPOSITORY, TestChatApi } from "../../test/chatApi"
import { read } from "../../test/otlp"
import { AuthStore, SESSION } from "../auth/store"
import { Chat } from "../chat/chat"
import { ChatStore } from "../chat/store"
import { Commands } from "../commands/commands"
import { repoId } from "../repo/contract"
import { IssuesClient, WriteNotTaken } from "./api"
import { commentId, ISSUES_STREAM, itemId, issuePath, newDraftKey, newIssuePath, commentDraftKey, writeExecutionId } from "./contract"
import { Issues } from "./issues"
import { pendingActions, sends } from "./metrics"
import { IssuesStore } from "./store"
import { commentOf, type CommentRow, listProps, type ListRow, pageOf } from "./view"

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

/** How long a flow may take on the device's engine, its first start included, on a loaded machine. */
const until = (assertion: () => void | Promise<void>, timeout = 40_000) => vi.waitFor(assertion, { timeout, interval: 20 })

/** A test's budget: flows on a fresh device's engine, each with its first start, on a loaded machine. */
const WITHIN = 90_000

const [OWNER, NAME] = TEST_REPOSITORY.split("/") as [string, string]
const REPO_ID = repoId(OWNER, NAME)

/** A signed-in Member with a session: a person's own write runs with that session's GitHub token. */
const maya: Actor = {
  subject: { kind: "person", id: "person-maya" },
  role: "member",
  login: "maya",
  session: "6f1d7c1e-0b7a-4f1c-9d55-2a1c0b8e3f10",
}

const sentinel = () => `sentinel-${crypto.randomUUID()}`

/** A faulty `IssuesClient`: the real one, behind switches. */
const faultyClient = () => {
  const plan: Array<number | "network" | "drop"> = []
  const state = { down: false, writes: 0 }
  const layer = Layer.effect(
    IssuesClient,
    Effect.map(IssuesClient, (real) =>
      IssuesClient.of({
        write: (owner, name, write) =>
          Effect.suspend(() => {
            state.writes += 1
            if (state.down) return Effect.fail(new WriteNotTaken({}))
            const next = plan.shift()
            if (next === undefined) return real.write(owner, name, write)
            // ChatApi took it, and its answer never arrived.
            if (next === "drop") return Effect.andThen(real.write(owner, name, write), Effect.fail(new WriteNotTaken({})))
            return Effect.fail(next === "network" ? new WriteNotTaken({}) : new WriteNotTaken({ status: next }))
          }),
      })),
  ).pipe(Layer.provide(IssuesClient.layer({ origin: CHATAPI_ORIGIN, within: "10 seconds" })))
  return {
    layer,
    state,
    /** The next sends fail with these, in order: a status, no network, or a dropped answer. */
    next: (...faults: Array<number | "network" | "drop">) => void plan.push(...faults),
    /** How many of those are still to come. */
    planned: () => plan.length,
  }
}

type App = ManagedRuntime.ManagedRuntime<Issues | IssuesStore | ChatStore | Chat | Commands | AuthStore, unknown>

/** A tab on `runtime`, with the issues layer's queries started as React starts them. */
const tabOf = async (runtime: App) => {
  const issues = await runtime.runPromise(Effect.service(Issues))
  const store = await runtime.runPromise(Effect.service(IssuesStore))
  const chat = await runtime.runPromise(Effect.service(ChatStore))
  for (const query of Object.values(issues.queries)) query.startSyncImmediate()
  return {
    runtime,
    issues,
    actions: issues.actions,
    store,
    chat,
    /** The list as the screen shows it. */
    list: () => listProps(issues.queries.list.toArray as ReadonlyArray<ListRow>, issues.queries.synced.toArray[0]),
    /** The routed issue's comments as the screen shows them. */
    comments: () => (issues.queries.conversation.toArray as ReadonlyArray<CommentRow>).map(commentOf),
    view: () => issues.queries.view.toArray[0],
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>, attributes: Record<string, string>) =>
      runtime.runSync(Metric.value(Metric.withAttributes(metric, attributes))).count,
  }
}

/** The app on a fresh ChatApi as `actor` (Maya unless set), its device's engine leading. */
const open = async (options: TabOptions = {}, actor: Actor | null = maya) => {
  const runtime: ManagedRuntime.ManagedRuntime<
    Issues | IssuesStore | ChatStore | Chat | Commands | AuthStore | TestChatApi,
    unknown
  > = openTestApp(options, { actor })
  runtimes.push(runtime)
  const api = await runtime.runPromise(Effect.service(TestChatApi))
  return { ...(await tabOf(runtime)), api }
}

/** Another device on the same ChatApi. */
const another = async (api: TestChatApi["Service"], options: TabOptions = {}) => {
  const runtime: App = openTab(api, options)
  runtimes.push(runtime)
  return tabOf(runtime)
}

/** GitHub's issue as the server's flows read it. */
const issue = (number: number, title: string, body: string, login: string | null = "maya"): GitHub.Issues.Issue => ({
  id: 9_000 + number,
  node_id: `I_${number}`,
  number,
  title,
  body,
  state: "open",
  state_reason: null,
  user: login === null ? null : { id: 1, login },
  comments: 0,
  created_at: "2026-10-20T10:00:00Z",
  updated_at: `2026-10-20T10:00:${String(number % 60).padStart(2, "0")}Z`,
  closed_at: null,
})

/** GitHub's comment as the server's flows read it. */
const comment = (id: number, body: string, login: string | null = "maya"): GitHub.Issues.IssueComment => ({
  id,
  node_id: `IC_${id}`,
  body,
  user: login === null ? null : { id: 1, login },
  created_at: "2026-10-20T11:00:00Z",
  updated_at: "2026-10-20T11:00:00Z",
  issue_url: `https://api.github.com/repos/${TEST_REPOSITORY}/issues/1`,
})

/** What GitHub's flows write on the server, through its own store. */
const server = (api: TestChatApi["Service"]) => ({
  write: (writeId: string) => Effect.runPromise(api.github.run(Store.writeOf(writeId))),
  writes: () =>
    Effect.runPromise(
      api.github.run(
        Effect.flatMap(SqlClient.SqlClient, (sql) => sql<{ readonly id: string }>`SELECT id::text AS id FROM github_writes`),
      ),
    ),
  /** GitHub numbered the new issue `writeId` asked for: the write settles, and its row carries the write's marker. */
  opened: (writeId: string, number: number, title: string, body = "") =>
    Effect.runPromise(
      api.github.run(
        Store.settleWrite(
          writeId,
          { status: "done", itemNumber: number, githubId: 9_000 + number },
          Store.upsertIssue(REPO_ID, issue(number, title, GitHub.Issues.withWriteMarker(body, writeId)), Date.now()),
        ),
      ),
    ),
  /** GitHub took the comment `writeId` asked for, as comment `id` on issue `number`. */
  commented: (writeId: string, number: number, id: number, body: string) =>
    Effect.runPromise(
      api.github.run(
        Store.settleWrite(
          writeId,
          { status: "done", itemNumber: number, githubId: id },
          Store.upsertComment(REPO_ID, number, comment(id, GitHub.Issues.withWriteMarker(body, writeId)), Date.now()),
        ),
      ),
    ),
  /** The write settled for good without GitHub taking it. */
  refused: (writeId: string, failure: "not_allowed" | "unavailable") =>
    Effect.runPromise(
      api.github.run(Store.settleWrite(writeId, { status: failure === "unavailable" ? "failed" : "refused", failure })),
    ),
  /** An issue someone opened on GitHub, and a complete walk of the repository. */
  seed: (number: number, title: string, login: string | null = "ben") =>
    Effect.runPromise(
      api.github.run(
        Effect.andThen(
          Store.upsertIssue(REPO_ID, issue(number, title, "Body", login), Date.now()),
          Store.finishSync(REPO_ID, ISSUES_STREAM, { complete: true, failure: null }),
        ),
      ),
    ),
  synced: () =>
    Effect.runPromise(api.github.run(Store.finishSync(REPO_ID, ISSUES_STREAM, { complete: true, failure: null }))),
})

/** Sets the tab's session row as sign-in's `load` sets it from ChatApi's answer: the test ChatApi serves no sign-in routes. */
const signIn = async (runtime: App, actor: Actor) => {
  const { session } = await runtime.runPromise(Effect.service(AuthStore))
  await until(() => expect(session.tanstack.get(SESSION)?.status).not.toBe("loading"))
  await runtime.runPromise(
    session.update(SESSION, (row) => void Object.assign(row, { status: "signed_in", login: actor.login, role: actor.role })),
  )
}

/** Waits until this device's one pending issue is on the list, and answers its write id. */
const pendingIssue = async (tab: Awaited<ReturnType<typeof tabOf>>) => {
  await until(() => expect(tab.list().issues.filter(({ number }) => number === null)).toHaveLength(1))
  return tab.list().issues.find(({ number }) => number === null)!.id!
}

describe("a new issue", () => {
  test("shows Requested at once as #–; ChatApi takes it as the person's; GitHub's row replaces it on every device", async () => {
    const tab = await open()
    const other = await another(tab.api)
    tab.actions.open(OWNER, NAME)
    other.actions.open(OWNER, NAME)
    tab.actions.setNewTitle(OWNER, NAME, "  Fix the crash  ")
    tab.actions.setNewBody(OWNER, NAME, "It crashes on an empty body.")
    expect(tab.view()).toMatchObject({ title: "  Fix the crash  ", body: "It crashes on an empty body.", submitting: false })

    expect(tab.actions.create(OWNER, NAME)).toBe(true)
    expect(tab.view()?.submitting).toBe(true)
    // A second press while the first is on its way runs nothing.
    expect(tab.actions.create(OWNER, NAME)).toBe(false)

    const writeId = await pendingIssue(tab)
    expect(tab.list().issues).toEqual([{ id: writeId, number: null, title: "Fix the crash", state: "open", pending: "requested" }])
    // The step queued it: the draft goes and the form can press again.
    await until(() => expect(tab.view()).toMatchObject({ title: undefined, body: undefined, submitting: false }))
    // The outbox sent it: ChatApi took it as Maya's own, and started its write; the device keeps it Requested.
    await until(async () =>
      expect(await server(tab.api).write(writeId)).toMatchObject({
        _tag: "Some",
        value: { via: "person", op: "issue/create", payload: { title: "Fix the crash", body: "It crashes on an empty body." } },
      })
    )
    expect(tab.api.github.starts).toContainEqual(expect.objectContaining({ executionId: writeExecutionId(writeId) }))
    await until(() => expect(tab.store.requested.tanstack.get(writeId)).toMatchObject({ status: "requested" }))
    expect(tab.store.sending.tanstack.size).toBe(0)
    expect(tab.count(sends, { op: "issue/create", outcome: "started" })).toBe(1)
    // Another device has no row of this device's own.
    expect(other.list().issues).toEqual([])

    await server(tab.api).opened(writeId, 12, "Fix the crash", "It crashes on an empty body.")

    for (const device of [tab, other]) {
      await until(() =>
        expect(device.list().issues).toEqual([
          {
            id: itemId(REPO_ID, 12),
            number: 12,
            title: "Fix the crash",
            state: "open",
            author: "maya",
            comments: 0,
            updatedAt: expect.any(String),
          },
        ])
      )
    }
    // The follower dropped the requested write: GitHub's row shows in its place.
    await until(() => expect(tab.store.requested.tanstack.size).toBe(0))
  }, WITHIN)

  test("only the tab that pressed queues its write; a tab that hears the step's call but didn't start it leaves it", async () => {
    const opened = await open({ answers: false })
    const device = nodeDevice({ agent: opened.api })
    const tab = await another(opened.api, { host: device })
    // A tab on the same engine channel whose engine never leads: it hears every call, and started none.
    const listener = await another(opened.api, { host: nodeDevice({ engineName: device.engineName! }) })
    tab.actions.open(OWNER, NAME)
    listener.actions.open(OWNER, NAME)
    tab.actions.setNewTitle(OWNER, NAME, "From one tab")
    tab.actions.create(OWNER, NAME)
    const writeId = await pendingIssue(tab)
    await until(async () => expect(await server(opened.api).writes()).toEqual([{ id: writeId }]))
    await until(() => expect(tab.view()?.submitting).toBe(false))
    expect(listener.store.sending.tanstack.size + listener.store.requested.tanstack.size).toBe(0)
  }, WITHIN)

  test("a press with no title, or a title over the limit, runs nothing", async () => {
    const tab = await open()
    tab.actions.open(OWNER, NAME)
    expect(tab.actions.create(OWNER, NAME)).toBe(false)
    tab.actions.setNewTitle(OWNER, NAME, "   ")
    expect(tab.actions.create(OWNER, NAME)).toBe(false)
    tab.actions.setNewTitle(OWNER, NAME, "x".repeat(257))
    expect(tab.actions.create(OWNER, NAME)).toBe(false)
    expect(tab.view()?.submitting).toBe(false)
  }, WITHIN)
})

describe("a comment", () => {
  test("shows Requested on the issue's page, then GitHub's comment in its place", async () => {
    const tab = await open()
    await server(tab.api).seed(7, "Crash on start")
    tab.actions.open(OWNER, NAME, 7)
    await until(() => expect(tab.issues.queries.item.toArray[0]).toMatchObject({ number: 7, title: "Crash on start" }))
    expect(pageOf(tab.issues.queries.item.toArray[0], tab.issues.queries.synced.toArray[0])).toBe("shown")
    expect(tab.actions.comment(OWNER, NAME, 7)).toBe(false)
    tab.actions.setCommentDraft(OWNER, NAME, 7, "Looks good")
    expect(tab.view()).toMatchObject({ number: 7, body: "Looks good" })

    expect(tab.actions.comment(OWNER, NAME, 7)).toBe(true)
    await until(() => expect(tab.comments()).toEqual([expect.objectContaining({ body: "Looks good", pending: "requested" })]))
    const writeId = tab.comments()[0]!.id
    await until(() => expect(tab.view()).toMatchObject({ body: undefined, submitting: false }))
    await until(async () =>
      expect(await server(tab.api).write(writeId)).toMatchObject({
        _tag: "Some",
        value: { via: "person", op: "issue/comment", payload: { number: 7, body: "Looks good" } },
      })
    )

    await server(tab.api).commented(writeId, 7, 501, "Looks good")

    await until(() =>
      expect(tab.comments()).toEqual([
        {
          id: commentId(REPO_ID, 501),
          author: "maya",
          createdAt: expect.any(String),
          body: "Looks good",
          pending: undefined,
          reason: undefined,
          editable: false,
        },
      ])
    )
    await until(() => expect(tab.store.requested.tanstack.size).toBe(0))
  }, WITHIN)
})

describe("loading", () => {
  test("a list is loading before the repository's first complete sync, never empty; then empty is empty", async () => {
    const tab = await open()
    tab.actions.open(OWNER, NAME)
    expect(tab.list()).toEqual({ issues: [], loading: true, notSent: [] })
    tab.actions.open(OWNER, NAME, 3)
    expect(pageOf(tab.issues.queries.item.toArray[0], tab.issues.queries.synced.toArray[0])).toBe("loading")

    await server(tab.api).synced()

    tab.actions.open(OWNER, NAME)
    await until(() => expect(tab.list()).toEqual({ issues: [], loading: false, notSent: [] }))
    tab.actions.open(OWNER, NAME, 3)
    await until(() =>
      expect(pageOf(tab.issues.queries.item.toArray[0], tab.issues.queries.synced.toArray[0])).toBe("missing")
    )
  }, WITHIN)
})

describe("who reads a repository's issues", () => {
  test("a visitor only once GitHub said the repository is public; a person with no role gets Not found", async () => {
    const visitor = await open({}, null)
    visitor.actions.open(OWNER, NAME)
    const access = (tab: Awaited<ReturnType<typeof tabOf>>) => tab.issues.queries.access.toArray[0]
    // GitHub hasn't said: the shape is refused, and the page asks to sign in instead of loading forever.
    await until(() => expect(access(visitor)).toMatchObject({ status: "sign_in" }))
    const refused = listProps([], undefined, access(visitor))
    expect(refused).toMatchObject({ refused: "sign_in", loading: false })
    visitor.actions.open(OWNER, NAME, 1)
    expect(pageOf(undefined, undefined, access(visitor))).toBe("sign_in")

    const outsider = await open({}, { ...maya, role: null })
    outsider.actions.open(OWNER, NAME)
    await until(() => expect(access(outsider)).toMatchObject({ status: "forbidden" }))
    expect(pageOf(undefined, undefined, access(outsider))).toBe("missing")

    // GitHub says it is public: a visitor's next page reads it.
    await Effect.runPromise(visitor.api.github.run(Store.recordRepository(REPO_ID, { githubId: 1, private: false })))
    await server(visitor.api).seed(4, "Public issue")
    const later = await another(visitor.api)
    later.actions.open(OWNER, NAME)
    await until(() => expect(access(later)).toMatchObject({ status: "allowed" }))
    await until(() => expect(later.list().issues.map(({ title }) => title)).toEqual(["Public issue"]))
  }, WITHIN)
})

describe("refused writes stay Not sent, with Edit and Discard", () => {
  test("ChatApi refuses a person with no role on the repository (403): Edit puts the issue back in the form", async () => {
    const tab = await open({}, { ...maya, role: null })
    tab.actions.open(OWNER, NAME)
    tab.actions.setNewTitle(OWNER, NAME, "Please fix")
    tab.actions.setNewBody(OWNER, NAME, "Details")
    tab.actions.create(OWNER, NAME)
    const writeId = await pendingIssue(tab)
    await until(() => expect(tab.list().notSent).toEqual([{ id: writeId, title: "Please fix", reason: "Not allowed" }]))
    expect(tab.list().issues).toEqual([{ id: writeId, number: null, title: "Please fix", state: "open", pending: "not_sent" }])
    expect(tab.count(sends, { op: "issue/create", outcome: "refused" })).toBe(1)
    expect(await server(tab.api).writes()).toEqual([])

    expect(tab.actions.edit(writeId)).toBe(newIssuePath(OWNER, NAME))
    expect(tab.store.drafts.tanstack.get(newDraftKey(REPO_ID))).toMatchObject({ title: "Please fix", body: "Details" })
    expect(tab.list().notSent).toEqual([])
    expect(tab.count(pendingActions, { action: "edit" })).toBe(1)
    // A write the device no longer has: nothing to edit or discard.
    expect(tab.actions.edit(writeId)).toBeUndefined()
    tab.actions.discard(writeId)
    expect(tab.count(pendingActions, { action: "discard" })).toBe(0)
  }, WITHIN)

  test("a conflict (409) and a body too large (413) stay Not sent; Edit puts the comment back, Discard drops it", async () => {
    const client = faultyClient()
    const tab = await open({ replace: client.layer })
    await server(tab.api).seed(4, "Flaky test")
    tab.actions.open(OWNER, NAME, 4)
    client.next(409, 413)
    tab.actions.setCommentDraft(OWNER, NAME, 4, "First")
    tab.actions.comment(OWNER, NAME, 4)
    await until(() => expect(tab.comments()).toHaveLength(1))
    await until(() => expect(tab.view()?.submitting).toBe(false))
    tab.actions.setCommentDraft(OWNER, NAME, 4, "Second")
    tab.actions.comment(OWNER, NAME, 4)
    await until(() =>
      expect(tab.comments().map(({ body, pending, reason, editable }) => ({ body, pending, reason, editable }))).toEqual([
        { body: "First", pending: "not_sent", reason: "Conflict", editable: true },
        { body: "Second", pending: "not_sent", reason: "Too long", editable: true },
      ])
    )
    const [first, second] = tab.comments()

    expect(tab.actions.edit(second!.id)).toBe(issuePath(OWNER, NAME, 4))
    expect(tab.store.drafts.tanstack.get(commentDraftKey(REPO_ID, 4))).toMatchObject({ body: "Second" })
    tab.actions.discard(first!.id)
    expect(tab.comments()).toEqual([])
    expect(tab.count(pendingActions, { action: "discard" })).toBe(1)
    expect(await server(tab.api).writes()).toEqual([])
  }, WITHIN)

  test("a write GitHub's flow settled refused or failed turns Not sent with its failure", async () => {
    const tab = await open()
    await server(tab.api).seed(5, "Docs")
    tab.actions.open(OWNER, NAME, 5)
    tab.actions.setCommentDraft(OWNER, NAME, 5, "One")
    tab.actions.comment(OWNER, NAME, 5)
    await until(() => expect(tab.store.requested.tanstack.size).toBe(1))
    await until(() => expect(tab.view()?.submitting).toBe(false))
    tab.actions.setCommentDraft(OWNER, NAME, 5, "Two")
    tab.actions.comment(OWNER, NAME, 5)
    await until(() => expect(tab.store.requested.tanstack.size).toBe(2))
    const [one, two] = tab.comments()

    await server(tab.api).refused(one!.id, "not_allowed")
    await server(tab.api).refused(two!.id, "unavailable")

    await until(() =>
      expect(tab.comments().map(({ body, pending, reason }) => ({ body, pending, reason }))).toEqual([
        { body: "One", pending: "not_sent", reason: "Not allowed" },
        { body: "Two", pending: "not_sent", reason: "GitHub unavailable" },
      ])
    )
  }, WITHIN)
})

describe("sending", () => {
  test("offline, the issue waits in the outbox as Requested; back online, it is sent once", async () => {
    const client = faultyClient()
    const tab = await open({ replace: client.layer })
    tab.actions.open(OWNER, NAME)
    client.state.down = true
    tab.actions.setNewTitle(OWNER, NAME, "Offline issue")
    tab.actions.create(OWNER, NAME)
    const writeId = await pendingIssue(tab)
    await until(() => expect(tab.count(sends, { op: "issue/create", outcome: "retry" })).toBeGreaterThan(0))
    expect(tab.store.sending.tanstack.get(writeId)).toMatchObject({ title: "Offline issue", via: "person" })
    expect(tab.list().issues).toEqual([expect.objectContaining({ id: writeId, number: null, pending: "requested" })])

    // A step asking again for a write the outbox holds finds it queued.
    const again = await tab.runtime.runPromise(
      tab.store.queue({ id: writeId, repo: TEST_REPOSITORY, op: "issue/create", via: "person", title: "x", number: 0, body: "" }),
    )
    expect(again).toEqual({ queued: true })

    client.state.down = false
    // A gateway answers 503 once, and the send after it gets through.
    client.next(503)
    await tab.runtime.runPromise(tab.chat.retryNow)
    await until(() => expect(client.planned()).toBe(0))
    await tab.runtime.runPromise(tab.chat.retryNow)
    await until(() => expect(tab.count(sends, { op: "issue/create", outcome: "started" })).toBe(1))
    expect(await server(tab.api).writes()).toEqual([{ id: writeId }])
    // ChatApi has it: a step asking again finds it queued, and nothing is sent.
    await until(() => expect(tab.store.requested.tanstack.get(writeId)).toBeDefined())
    expect(
      await tab.runtime.runPromise(
        tab.store.queue({ id: writeId, repo: TEST_REPOSITORY, op: "issue/create", via: "person", title: "x", number: 0, body: "" }),
      ),
    ).toEqual({ queued: true })
  }, WITHIN)

  test("an answer lost on the way back: the outbox sends it again, and ChatApi answers that it has it", async () => {
    const client = faultyClient()
    const tab = await open({ replace: client.layer })
    tab.actions.open(OWNER, NAME)
    client.next("drop")
    tab.actions.setNewTitle(OWNER, NAME, "Dropped answer")
    tab.actions.create(OWNER, NAME)
    const writeId = await pendingIssue(tab)
    await until(() => expect(tab.count(sends, { op: "issue/create", outcome: "retry" })).toBe(1))
    await tab.runtime.runPromise(tab.chat.retryNow)
    await until(() => expect(tab.count(sends, { op: "issue/create", outcome: "existing" })).toBe(1))
    expect(await server(tab.api).writes()).toEqual([{ id: writeId }])
    expect(tab.store.requested.tanstack.get(writeId)).toMatchObject({ status: "requested" })
  }, WITHIN)

  // The step asks its tab again for 30 s (`QUEUE_RETRY`), then fails `not_admitted`.
  test("an outbox that can't store the write: the flow fails, nothing is queued, and the draft stays", async () => {
    const opened = await open({ answers: false })
    const device = nodeDevice({ agent: opened.api })
    const real = device.outbox.storage
    const storage: Outbox.Options<never>["storage"] = {
      get: (key) => real.get(key),
      keys: () => real.keys(),
      delete: (key) => real.delete(key),
      clear: () => real.clear(),
      set: () => Promise.reject(new Error("quota")),
    }
    const tab = await another(opened.api, { host: { ...device, outbox: { ...device.outbox, storage } } })
    tab.actions.open(OWNER, NAME)
    tab.actions.setNewTitle(OWNER, NAME, "Not stored")
    tab.actions.create(OWNER, NAME)
    await until(() => expect(tab.view()?.submitting).toBe(false), 75_000)
    expect(tab.view()).toMatchObject({ title: "Not stored" })
    expect(tab.list().issues).toEqual([])
  }, WITHIN)

  test("a tab with no engine: the flow never runs, and the draft stays", async () => {
    const opened = await open({ answers: false })
    const tab = await another(opened.api, { host: nodeDevice({ engineWorker: failingWorker }) })
    tab.actions.open(OWNER, NAME)
    tab.actions.setNewTitle(OWNER, NAME, "No engine")
    tab.actions.create(OWNER, NAME)
    await until(() => expect(tab.view()?.submitting).toBe(false))
    expect(tab.view()).toMatchObject({ title: "No engine" })
  }, WITHIN)
})

describe("doors", () => {
  test("the agent's call opens the issue as the App, for the person; its door is the agent's", async () => {
    const tab = await open()
    tab.actions.open(OWNER, NAME)
    const chat = await tab.runtime.runPromise(Effect.service(Chat))
    const asked = chat.actions.ask("Open an issue about the crash")
    if (!asked.asked) throw new Error("not asked")
    const first = await Effect.runPromise(tab.api.answerTo("Open an issue about the crash"))
    first.cell(
      `const opened = await ctx.call("issue/create", { repo: "${TEST_REPOSITORY}", title: "Crash on empty body" })\n` +
        `console.log(JSON.stringify(opened))`,
    )
    const writeId = await pendingIssue(tab)
    ;(await Effect.runPromise(tab.api.answerTo("Open an issue about the crash", 1))).cell(`ctx.done("Requested.")`)
    await until(async () =>
      expect(await server(tab.api).write(writeId)).toMatchObject({
        _tag: "Some",
        value: { via: "agent", op: "issue/create", payload: { title: "Crash on empty body", body: "" } },
      })
    )
  }, WITHIN)

  test("/issue owner/repo <title> opens one with that title, and /comment owner/repo <n> <text> comments", async () => {
    const tab = await open()
    await server(tab.api).seed(9, "Slow build")
    tab.actions.open(OWNER, NAME)
    await signIn(tab.runtime, maya)
    const commands = await tab.runtime.runPromise(Effect.service(Commands))
    const send = (line: string) => {
      commands.actions.type(line)
      commands.actions.submit(line)
    }
    send(`/issue ${TEST_REPOSITORY} Fix the crash`)
    const writeId = await pendingIssue(tab)
    await until(async () =>
      expect(await server(tab.api).write(writeId)).toMatchObject({
        _tag: "Some",
        value: { via: "person", payload: { title: "Fix the crash", body: "" } },
      })
    )
    send(`/comment ${TEST_REPOSITORY} 9 Looks good to me`)
    await until(async () => expect(await server(tab.api).writes()).toHaveLength(2))
    tab.actions.open(OWNER, NAME, 9)
    await until(() => expect(tab.comments()).toEqual([expect.objectContaining({ body: "Looks good to me" })]))
  }, WITHIN)
})

describe("records", () => {
  test("carry ids, operations and outcomes, never a title or a body", async () => {
    const secret = sentinel()
    const tab = await open()
    await server(tab.api).seed(2, "Seeded", null)
    tab.actions.open(OWNER, NAME)
    tab.actions.setNewTitle(OWNER, NAME, `Title ${secret}`)
    tab.actions.setNewBody(OWNER, NAME, `Body ${secret}`)
    tab.actions.create(OWNER, NAME)
    const writeId = await pendingIssue(tab)
    await until(() => expect(tab.count(sends, { op: "issue/create", outcome: "started" })).toBe(1))
    // An issue whose author GitHub no longer has shows none.
    expect(tab.list().issues.find(({ number }) => number === 2)?.author).toBeUndefined()
    for (const each of runtimes.splice(0).reverse()) await each.dispose()

    const records = read(tab.api.telemetry)
    expect(records.span("issues.write.send")).toContainEqual(
      expect.objectContaining({ attributes: expect.objectContaining({ writeId, op: "issue/create", via: "person", outcome: "started" }) }),
    )
    expect(records.log("issues.write.send")).toContainEqual(
      expect.objectContaining({ attributes: expect.objectContaining({ writeId, outcome: "started", feature: "issues" }) }),
    )
    expect(records.point("smithers_issue_write_sends", { op: "issue/create", outcome: "started" })?.value).toBe(1)
    expect(tab.api.telemetry.map(({ body }) => body).join("\n")).not.toContain(secret)
    expect(JSON.stringify(tab.api.spans.map((span) => [...span.attributes]))).not.toContain(secret)
  }, WITHIN)
})
