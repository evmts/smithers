// The personal feed on the tab, driven as React drives it: through the feed layer's plain actions, reading its live
// queries, with no React. Two people, Ann and Ben, each on their own Node devices (src/test/chatApi.ts), run the
// browser's own layer (`appLayer`) against ChatApi's real handler over the compose Postgres and Electric. Only the model
// is scripted. Proves decision 0009's first slice: a tab follows the conversation it shows; Ann's run reaches her feed
// on both her devices and Ben's as a quiet toast, because he is on its branch; Read, Hide and Dismiss on one of Ann's
// devices reach the other; a finished toast hides by itself.
import { Effect, type ManagedRuntime, Metric } from "effect"
import { SqlClient } from "effect/sql"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Actor } from "../../../worker/Actor.ts"
import { dispatches } from "../../flows/dispatch"
import { asPerson, nodeDevice, type NodeDevice, openTab, openTestApp, TestChatApi } from "../../test/chatApi"
import { SESSION } from "../auth/store"
import { AuthStore } from "../auth/store"
import { show } from "../chat/actions"
import { Chat } from "../chat/chat"
import { ChatStore } from "../chat/store"
import { Status } from "../status/status"
import { StatusStore } from "../status/store"
import { Attention } from "./attention"
import { shown } from "./metrics"
import { AttentionStore } from "./store"

/** A test that drives devices' engines through model calls and sync: seconds each, more on a loaded machine. */
const ENGINE_WITHIN = 120_000

const ben: Actor = { subject: { kind: "person", id: "person-ben" }, role: "maintainer", login: "ben" }

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const until = (assertion: () => void | Promise<void>, timeout = 60_000) =>
  vi.waitFor(assertion, { timeout, interval: 20 })

/** ChatApi, from a first tab whose engine never leads; Ben may sign in to it too. */
const openApi = async () => {
  const runtime = openTestApp({ answers: false }, { people: { ben } })
  runtimes.push(runtime)
  return runtime.runPromise(Effect.service(TestChatApi))
}

type Tab = ManagedRuntime.ManagedRuntime<
  Chat | Attention | AttentionStore | Status | StatusStore | AuthStore | ChatStore,
  unknown
>

/** A device with a tab on it, whose engine leads unless `answers` is false. */
const openDevice = async (api: TestChatApi["Service"], options: { readonly answers?: boolean } = {}) => {
  const host: NodeDevice = nodeDevice(options.answers === false ? {} : { agent: api })
  const runtime: Tab = openTab(api, { host })
  runtimes.push(runtime)
  const chat = await runtime.runPromise(Effect.service(Chat))
  const attention = await runtime.runPromise(Effect.service(Attention))
  const store = await runtime.runPromise(Effect.service(AttentionStore))
  const status = await runtime.runPromise(Effect.service(Status))
  const statuses = await runtime.runPromise(Effect.service(StatusStore))
  for (const query of [store.stack, store.stackHere, store.list, store.listHere]) query.tanstack.startSyncImmediate()
  return {
    host,
    chat,
    attention,
    status,
    run: <A, E>(effect: Effect.Effect<A, E, AuthStore | ChatStore>) => runtime.runPromise(effect),
    entry: (subject: string) => store.entries.tanstack.toArray.find((row) => row.id === subject),
    stack: () => store.stack.tanstack.toArray.map((row) => row.id),
    stackHere: () => store.stackHere.tanstack.toArray.map((row) => row.id),
    list: () => store.list.tanstack.toArray.map((row) => row.id),
    focus: (id: string) => statuses.statuses.tanstack.toArray.find((row) => row.id === id)?.focus,
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>) => runtime.runSync(Metric.value(metric)).count,
  }
}

type Device = Awaited<ReturnType<typeof openDevice>>

const ask = (device: Device, text: string) => {
  const asked = device.chat.actions.ask(text)
  if (!asked.asked) throw new Error(`the question was refused: ${asked.reason}`)
  return asked.answerId
}

const askCell = (need: string) => `const heard = await ctx.call("app/agent/ask", ${need})\nconsole.log(JSON.stringify(heard))`

/** What Postgres holds of `principal`'s watches. */
const watchesOf = (api: TestChatApi["Service"], principal: string) =>
  Effect.runPromise(api.github.run(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql<{ readonly subject: string }>`SELECT subject FROM watches WHERE principal_id = ${principal} ORDER BY subject`)))

/** How many times this device ran `watch/set` to the end. */
const watched = (device: Device) =>
  device.count(Metric.withAttributes(dispatches, { flow: "watch/set", door: "view", outcome: "done" }))

describe("the feed on two people's devices", { timeout: ENGINE_WITHIN }, () => {
  test("Ann's run reaches both her devices and Ben's; her acts on one device reach the other; done toasts hide", async () => {
    const api = await openApi()
    const ann = await openDevice(api)
    const annToo = await openDevice(api)
    const benDevice = await openDevice(asPerson(api, "ben"))
    // Each tab shows the home conversation, so each person follows its branch and repository.
    await until(async () => expect(await watchesOf(api, "person-member")).toHaveLength(2))
    await until(async () => expect(await watchesOf(api, "person-ben")).toHaveLength(2))

    const answerId = ask(ann, "Deploy the docs preview")
    const subject = `run:${answerId}`
    const first = await Effect.runPromise(api.answerTo("Deploy the docs preview"))
    // Live: Ann sees it in the conversation, so no toast over it; Ben sees a quiet toast naming her on any page.
    await until(() => expect(benDevice.entry(subject)).toMatchObject({ state: "working", stack: true, listed: false }))
    expect(benDevice.entry(subject)!.detail).toContain("Deploy the docs preview")
    expect(benDevice.stackHere()).not.toContain(subject)
    await until(() => expect(ann.entry(subject)).toMatchObject({ state: "working", mine: true, stack: true, listed: true }))
    expect(ann.stackHere()).not.toContain(subject)

    // The agent asks Ann: her question toasts on both her devices, over the conversation too; Ben's reads waiting.
    first.cell(askCell(`{ kind: "question", prompt: "Which branch should I deploy?", options: ["main", "docs-v2"] }`))
    for (const device of [ann, annToo]) {
      await until(() =>
        expect(device.entry(subject)).toMatchObject({
          state: "needs_you",
          action: "answer",
          detail: "Which branch should I deploy?",
          stackHere: true,
          unread: true,
        })
      )
    }
    await until(() => expect(benDevice.entry(subject)).toMatchObject({ state: "waiting", stack: true }))
    // Ben opens it from a page: it takes him to the conversation.
    benDevice.attention.actions.open(subject, "page")
    expect(benDevice.host.navigated).toEqual(["/app"])

    // Ann answers from her second device's toast: Read lands, and the question's card takes focus there.
    annToo.attention.actions.open(subject, "conversation")
    await until(() => expect(annToo.entry(subject)!.unread).toBe(false))
    expect(annToo.focus(answerId)).toBe(1)
    expect(annToo.host.navigated).toEqual([])
    await until(() => expect(ann.entry(subject)!.unread).toBe(false))
    // Hide on her first device hides the toast on both, and keeps the entry in her list.
    ann.attention.actions.hide(subject)
    ann.attention.actions.hide(subject)
    await until(() => expect(ann.entry(subject)).toMatchObject({ stack: false, listed: true }))
    await until(() => expect(annToo.entry(subject)).toMatchObject({ stack: false, stackHere: false, listed: true }))
    expect(annToo.list()).toContain(subject)
    // Nothing happens for an entry that isn't there.
    ann.attention.actions.open("run:nowhere", "page")
    expect(ann.host.navigated).toEqual([])

    annToo.status.actions.answer(answerId, "docs-v2")
    ;(await Effect.runPromise(api.answerTo("Deploy the docs preview", 1))).cell(`ctx.done("Deploying docs-v2.")`)
    // Done: a new version, so it shows again, unread, then hides by itself after 4 s and stays in Ann's list.
    await until(() => expect(ann.entry(subject)).toMatchObject({ state: "done", stack: true, unread: true }))
    await until(() => expect(benDevice.entry(subject)).toMatchObject({ state: "done", stack: true }))
    await until(() => expect(ann.entry(subject)).toMatchObject({ stack: false, listed: true }), 10_000)
    // Ben's, someone else's, leaves his feed altogether.
    await until(() => expect(benDevice.entry(subject)).toBeUndefined(), 10_000)

    // Dismiss on one device closes it on both.
    annToo.attention.actions.dismiss(subject)
    await until(() => expect(annToo.entry(subject)).toBeUndefined())
    await until(() => expect(ann.entry(subject)).toBeUndefined())
    expect(ann.count(Metric.withAttributes(shown, { state: "done" }))).toBe(1)
  })

  test("an act a device can't send yet shows at once and keeps up with a newer version", async () => {
    const api = await openApi()
    const ann = await openDevice(api)
    // Ann's tablet: its engine never leads, so what it dispatches never runs, and its acts stay its own.
    const tablet = await openDevice(api, { answers: false })
    const answerId = ask(ann, "Clean up old previews")
    const subject = `run:${answerId}`
    const first = await Effect.runPromise(api.answerTo("Clean up old previews"))
    first.cell(askCell(`{ kind: "approval", prompt: "Delete the stale preview docs-v1?" }`))
    await until(() => expect(tablet.entry(subject)).toMatchObject({ state: "needs_you" }))
    tablet.attention.actions.dismiss(subject)
    await until(() => expect(tablet.entry(subject)).toBeUndefined())
    ann.status.actions.answer(answerId, true)
    ;(await Effect.runPromise(api.answerTo("Clean up old previews", 1))).cell(`ctx.done("Deleted docs-v1.")`)
    // Done is a new version: it shows on the tablet again until dismissed there too.
    await until(() => expect(tablet.entry(subject)).toMatchObject({ state: "done", listed: true }))
    tablet.attention.actions.dismiss(subject)
    await until(() => expect(tablet.entry(subject)).toBeUndefined())
    expect(ann.entry(subject)).toMatchObject({ state: "done", listed: true })
  })

  test("a tab follows each conversation it shows once per person, and not while signed out or a Guest", async () => {
    const api = await openApi()
    const benDevice = await openDevice(asPerson(api, "ben"))
    await until(() => expect(watched(benDevice)).toBe(1))
    // A branch the team shares: showing its conversation follows it.
    const branchId = crypto.randomUUID()
    const conversationId = crypto.randomUUID()
    await Effect.runPromise(api.branches.run(Effect.flatMap(SqlClient.SqlClient, (sql) =>
      Effect.all([
        sql`INSERT INTO branches (id, repo_id, name, mode) VALUES (${branchId}, 'github/acme/widgets', 'feature', 'open')`,
        sql`INSERT INTO conversations (id, repo_id, branch_id) VALUES (${conversationId}, 'github/acme/widgets', ${branchId})`,
        sql`INSERT INTO branch_shares (branch_id, grantee, access) VALUES (${branchId}, 'repository', 'edit')`,
      ], { discard: true }))))
    await benDevice.run(show(conversationId))
    await until(async () => expect(await watchesOf(api, "person-ben")).toContainEqual({ subject: `branch:${branchId}` }))
    await until(() => expect(watched(benDevice)).toBe(2))
    // Back home: followed already from this tab.
    await benDevice.run(show(null))
    const session = (row: object) =>
      benDevice.run(Effect.flatMap(AuthStore, (auth) => Effect.orDie(auth.session.update(SESSION, (draft) => void Object.assign(draft, row)))))
    // Signed out, or a Guest, the tab asks nothing; once sign-in says who, it follows home again as them.
    await session({ status: "signed_out", login: null, role: null })
    await session({ status: "signed_in", login: "ben", role: "guest" })
    await session({ status: "signed_in", login: "ben", role: "maintainer" })
    await until(() => expect(watched(benDevice)).toBe(3))
  })
})
