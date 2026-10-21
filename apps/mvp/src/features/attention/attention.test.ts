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
import { panel as panelActs, shown } from "./metrics"
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
  for (const query of [store.stack, store.stackHere, store.list, store.listHere, store.feed, store.unread, store.needs]) {
    query.tanstack.startSyncImmediate()
  }
  for (const query of [store.panelState, store.detail]) query.tanstack.startSyncImmediate()
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
    feed: () => store.feed.tanstack.toArray.map((row) => row.id),
    unread: () => store.unread.tanstack.toArray.length,
    needs: () => store.needs.tanstack.toArray.map((row) => row.id),
    panel: () => store.panel.tanstack.toArray[0]!,
    detail: () => store.details.tanstack.toArray[0],
    pending: () => store.pending.tanstack.toArray.map((row) => row.id),
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
    // Ben opens it from a page: it takes him to the conversation, at the run's answer.
    benDevice.attention.actions.open(subject, "page")
    expect(benDevice.host.navigated).toEqual([`/app#${answerId}`])

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

describe("the notifications panel", { timeout: ENGINE_WITHIN }, () => {
  const panelCount = (device: Device, attributes: Record<string, string>) =>
    device.count(Metric.withAttributes(panelActs, attributes))

  test("newest first with the unread count; an entry expands in place, reads, answers and opens at its answer", async () => {
    const api = await openApi()
    const ann = await openDevice(api)
    const annToo = await openDevice(api)

    const doneId = ask(ann, "Summarize the release notes")
    const done = `run:${doneId}`
    ;(await Effect.runPromise(api.answerTo("Summarize the release notes"))).cell(`ctx.done("Three fixes, one feature.")`)
    await until(() => expect(ann.entry(done)).toMatchObject({ state: "done", listed: true, unread: true }))
    const askId = ask(ann, "Deploy the docs preview")
    const asks = `run:${askId}`
    ;(await Effect.runPromise(api.answerTo("Deploy the docs preview"))).cell(
      askCell(`{ kind: "question", prompt: "Which branch should I deploy?", options: ["main", "docs-v2"] }`),
    )
    await until(() => expect(ann.entry(asks)).toMatchObject({ state: "needs_you", action: "answer" }))
    // Newest first, whatever the stack's order; both unread; the question waits on her.
    expect(ann.feed()).toEqual([asks, done])
    expect(ann.unread()).toBe(2)
    expect(ann.needs()).toEqual([asks])

    // The bell opens at the run waiting on her, expanded and read; again, it closes.
    expect(ann.panel()).toMatchObject({ open: false, expanded: null })
    ann.attention.actions.togglePanel("bell")
    expect(ann.panel()).toMatchObject({ open: true, focus: asks, expanded: asks })
    await until(() => expect(ann.unread()).toBe(1))
    ann.attention.actions.togglePanel("bell")
    expect(ann.panel().open).toBe(false)
    expect(panelCount(ann, { act: "open", via: "bell" })).toBe(1)

    // Expanding the finished entry reads it on both devices and shows the answer's text.
    ann.attention.actions.openPanel("key")
    expect(ann.panel()).toMatchObject({ open: true, focus: asks })
    ann.attention.actions.expand(done)
    expect(ann.panel()).toMatchObject({ open: true, expanded: done })
    await until(() => expect(ann.detail()).toMatchObject({ id: done, note: "Three fixes, one feature.", question: null }))
    await until(() => expect(annToo.entry(done)!.unread).toBe(false))
    await until(() => expect(ann.unread()).toBe(0))
    expect(panelCount(ann, { act: "expand" })).toBe(1)
    // Expanding it again collapses it; nothing is shown in detail.
    ann.attention.actions.expand(done)
    expect(ann.panel().expanded).toBeNull()
    await until(() => expect(ann.detail()).toBeUndefined())

    // A, in the panel, expands the question, asks its field to take focus, and reads it; the draft is the card's.
    ann.attention.actions.answer(asks, "panel")
    expect(ann.panel()).toMatchObject({ expanded: asks, answer: 1 })
    await until(() =>
      expect(ann.detail()).toMatchObject({
        id: asks,
        question: { kind: "question", prompt: "Which branch should I deploy?", options: ["main", "docs-v2"], draft: "" },
      })
    )
    // Its step so far: the question it asked.
    await until(() => expect(ann.detail()!.steps).toEqual([expect.objectContaining({ label: "app/agent/ask" })]))
    ann.status.actions.setDraft(askId, "docs-v2")
    await until(() => expect(ann.detail()!.question).toMatchObject({ draft: "docs-v2" }))
    // Expanding another entry forgets the field's focus request; A on an entry with nothing to answer does nothing.
    ann.attention.actions.expand(done)
    expect(ann.panel()).toMatchObject({ expanded: done, answer: 0 })
    ann.attention.actions.answer(done, "panel")
    ann.attention.actions.answer("run:nowhere", "panel")
    expect(ann.panel()).toMatchObject({ expanded: done, answer: 0 })
    // Marking an entry read that is read already sends nothing.
    ann.attention.actions.read(done)
    expect(ann.pending().filter((id) => id.startsWith(done))).toEqual([])

    // Answer over this conversation focuses the existing card without navigating away.
    const focused = ann.focus(askId) ?? 0
    ann.attention.actions.answer(asks, "conversation")
    await until(() => expect(ann.focus(askId)).toBe(focused + 1))
    expect(ann.host.navigated).toEqual([])
    expect(ann.panel().open).toBe(false)
    ann.attention.actions.openPanel("key", done)

    // Answering from the panel answers the run, and it no longer waits on her.
    ann.attention.actions.expand(asks)
    ann.status.actions.answer(askId, "docs-v2")
    await until(() => expect(ann.detail()!.question).toBeNull())
    await until(() => expect(ann.needs()).toEqual([]))
    ;(await Effect.runPromise(api.answerTo("Deploy the docs preview", 1))).cell(`ctx.done("Deploying docs-v2.")`)
    await until(() => expect(ann.detail()).toMatchObject({ id: asks, note: "Deploying docs-v2." }))
    // A settled answer has nothing to answer, and its draft isn't kept.
    ann.status.actions.answer(askId, "main")
    ann.status.actions.setDraft(askId, "late")
    expect(ann.detail()!.question).toBeNull()

    // Open from the panel closes it and goes to the run's answer.
    ann.attention.actions.open(done, "page")
    expect(ann.panel().open).toBe(false)
    expect(ann.host.navigated).toEqual([`/app#${doneId}`])
    // A toast's E opens the panel at its entry, expanded; Close closes it.
    ann.attention.actions.openPanel("toast", asks)
    expect(ann.panel()).toMatchObject({ open: true, focus: asks, expanded: asks })
    ann.attention.actions.closePanel()
    expect(ann.panel()).toMatchObject({ open: false, focus: null })
    expect(panelCount(ann, { act: "open", via: "toast" })).toBe(1)
    // A on a toast is its Answer: over the conversation, the question's card takes focus. This one is answered.
    ann.attention.actions.answer(asks, "conversation")
    expect(ann.host.navigated).toEqual([`/app#${doneId}`])
  })

  test("Retry on a failed run asks its question again and dismisses the entry; elsewhere it does nothing", async () => {
    const api = await openApi()
    const ann = await openDevice(api)
    const failedId = ask(ann, "Fail, please")
    const failed = `run:${failedId}`
    // Nothing waits on her: the panel opens at its first entry.
    ann.attention.actions.openPanel("more")
    expect(ann.panel()).toMatchObject({ open: true, focus: null, expanded: null })
    ann.attention.actions.closePanel()
    ;(await Effect.runPromise(api.answerTo("Fail, please"))).fail()
    await until(() => expect(ann.entry(failed)).toMatchObject({ state: "failed", listed: true }))
    // Not expanded: nothing to retry from.
    ann.attention.actions.retry(failed)
    ann.attention.actions.retry("run:nowhere")
    ann.attention.actions.expand(failed)
    await until(() => expect(ann.detail()).toMatchObject({ id: failed, note: "Model error", retry: true }))
    ann.chat.queries.conversation.startSyncImmediate()
    ann.attention.actions.retry(failed)
    await until(() => expect(ann.entry(failed)).toBeUndefined())
    // Asked again, under new ids: the model hears it a second time.
    await until(() =>
      expect(ann.chat.queries.conversation.toArray.filter((row) => row.role === "user" && row.text === "Fail, please"))
        .toHaveLength(2)
    )
    ;(await Effect.runPromise(api.answerTo("Fail, please", 1))).cell(`ctx.done("Done this time.")`)
    expect(panelCount(ann, { act: "retry" })).toBe(1)
    // A finished entry, expanded, has no Retry.
    const doneId = ask(ann, "Say hi")
    ;(await Effect.runPromise(api.answerTo("Say hi"))).cell(`ctx.done("Hi.")`)
    await until(() => expect(ann.entry(`run:${doneId}`)).toMatchObject({ state: "done" }))
    ann.attention.actions.expand(`run:${doneId}`)
    await until(() => expect(ann.detail()).toMatchObject({ id: `run:${doneId}`, retry: false }))
    ann.attention.actions.retry(`run:${doneId}`)
    expect(panelCount(ann, { act: "retry" })).toBe(1)
  })

  test("a branch's question answered from the panel while the tab shows home", async () => {
    const api = await openApi()
    const ann = await openDevice(api)
    const branchId = crypto.randomUUID()
    const conversationId = crypto.randomUUID()
    await Effect.runPromise(api.branches.run(Effect.flatMap(SqlClient.SqlClient, (sql) =>
      Effect.all([
        sql`INSERT INTO branches (id, repo_id, name, mode) VALUES (${branchId}, 'github/acme/widgets', 'feature', 'open')`,
        sql`INSERT INTO conversations (id, repo_id, branch_id) VALUES (${conversationId}, 'github/acme/widgets', ${branchId})`,
        sql`INSERT INTO branch_shares (branch_id, grantee, access) VALUES (${branchId}, 'repository', 'edit')`,
      ], { discard: true }))))
    await ann.run(show(conversationId))
    const answerId = ask(ann, "Rename the feature branch")
    const subject = `run:${answerId}`
    ;(await Effect.runPromise(api.answerTo("Rename the feature branch"))).cell(
      askCell(`{ kind: "approval", prompt: "Rename feature to feature-2?" }`),
    )
    await until(() => expect(ann.entry(subject)).toMatchObject({ state: "needs_you", here: true }))
    // Home again: the conversation there doesn't hold the branch's answer.
    await ann.run(show(null))
    await until(() => expect(ann.entry(subject)).toMatchObject({ here: false, conversationId }))
    ann.attention.actions.openPanel("more", subject)
    await until(() =>
      expect(ann.detail()).toMatchObject({ id: subject, question: { kind: "approval", prompt: "Rename feature to feature-2?" } })
    )
    ann.status.actions.answer(answerId, true)
    await until(() => expect(ann.detail()!.question).toBeNull())
    ;(await Effect.runPromise(api.answerTo("Rename the feature branch", 1))).cell(`ctx.done("Renamed.")`)
    await until(() => expect(ann.entry(subject)).toMatchObject({ state: "done" }))
    // Open takes the person to the branch, at the answer.
    ann.attention.actions.open(subject, "conversation")
    expect(ann.host.navigated).toEqual([`/acme/widgets/tree/feature#${answerId}`])
    // Answering what isn't open, or a run this device has no row of, does nothing.
    ann.status.actions.answer(answerId, false)
    ann.status.actions.setDraft(crypto.randomUUID(), "x")
    expect(ann.detail()).toMatchObject({ id: subject, question: null })

    // Her tablet never showed the branch: its entry expands to its row alone, with no steps.
    const tablet = await openDevice(api, { answers: false })
    await until(() => expect(tablet.entry(subject)).toMatchObject({ state: "done" }))
    tablet.attention.actions.expand(subject)
    await until(() =>
      expect(tablet.detail()).toMatchObject({ id: subject, meta: null, steps: [], note: null, question: null, retry: false })
    )

    // `main` moving, and a run that no conversation holds: who pushed; nothing more of the run.
    const orphan = crypto.randomUUID()
    await Effect.runPromise(api.github.run(Effect.flatMap(SqlClient.SqlClient, (sql) =>
      Effect.all([
        sql`INSERT INTO notifications (recipient, subject, kind, state, repo_id, actor, title, ref, href)
          VALUES ('person-member', 'main:github/acme/widgets', 'main', 'update', 'github/acme/widgets', 'dana', 'Ship it',
            ${"a".repeat(40)}, '/acme/widgets')`,
        sql`INSERT INTO notifications (recipient, subject, kind, state, mine, run_id, href)
          VALUES ('person-member', ${`run:${orphan}`}, 'run', 'done', true, ${orphan}, '/app')`,
      ], { discard: true }))))
    await until(() => expect(tablet.entry("main:github/acme/widgets")).toMatchObject({ listed: true }))
    tablet.attention.actions.expand("main:github/acme/widgets")
    await until(() => expect(tablet.detail()).toMatchObject({ id: "main:github/acme/widgets", meta: "dana", steps: [] }))
    await until(() => expect(tablet.entry(`run:${orphan}`)).toMatchObject({ conversationId: null }))
    tablet.attention.actions.expand(`run:${orphan}`)
    await until(() => expect(tablet.detail()).toMatchObject({ id: `run:${orphan}`, steps: [], note: null }))
    // Open on main goes to the repository, with no answer to scroll to.
    tablet.attention.actions.open("main:github/acme/widgets", "page")
    expect(tablet.host.navigated).toEqual(["/acme/widgets"])
  })
})

describe("a clone in the feed", { timeout: ENGINE_WITHIN }, () => {
  test("Ann's clone shows its stage; once it fails, Try again runs repo/clone for its repository again", async () => {
    const api = await openApi()
    const ann = await openDevice(api)
    const subject = "clone:github/acme/widgets"
    const write = (state: string, ref: string, version: number) =>
      Effect.runPromise(api.github.run(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`INSERT INTO notifications (recipient, subject, kind, state, mine, repo_id, title, ref, href, version)
          VALUES ('person-member', ${subject}, 'clone', ${state}, true, 'github/acme/widgets', 'acme/widgets', ${ref},
            '/acme/widgets', ${version})
          ON CONFLICT (recipient, subject) DO UPDATE SET state = EXCLUDED.state, ref = EXCLUDED.ref,
            version = EXCLUDED.version, updated_at = now()`)))
    await write("working", `fetching:${2 * 1024 * 1024}`, 1)
    await until(() =>
      expect(ann.entry(subject)).toMatchObject({
        kind: "clone",
        word: "Clone",
        detail: "acme/widgets · Fetching 2.0 MB",
        action: "open",
        stack: true,
      })
    )
    await write("failed", "failed:not_found", 2)
    await until(() =>
      expect(ann.entry(subject)).toMatchObject({ state: "failed", detail: "acme/widgets · Not found", action: "retry" })
    )
    ann.attention.actions.expand(subject)
    await until(() => expect(ann.detail()).toMatchObject({ id: subject, retry: true }))
    ann.attention.actions.retry(subject)
    // This ChatApi has no Code Storage, so RepoApi refuses the clone; the flow ran, from the person's button.
    await until(() =>
      expect(ann.count(Metric.withAttributes(dispatches, { flow: "repo/clone", door: "button", outcome: "failed" }))).toBe(1)
    )
    expect(ann.count(Metric.withAttributes(panelActs, { act: "retry" }))).toBe(1)
    // Open goes to the repository.
    ann.attention.actions.open(subject, "page")
    expect(ann.host.navigated).toEqual(["/acme/widgets"])
  })
})
