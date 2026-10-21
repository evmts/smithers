import { branchRenderer, DeniedBranchHeader } from "./offline-render"
// A fresh device with tracking held at the injected engine service, as a durable branch/track waiting offline.
// The app, router, stores and components are real; releasing the fault runs the real flow against ChatApi.
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { Effect } from "effect"
import { ShapeSource } from "@smthrs/effect-electric"
import { afterEach, expect, test, vi } from "vitest"
import { shaOf } from "../../../worker/test/branch.ts"
import { Attention } from "../../features/attention/attention"
import { Auth } from "../../features/auth/auth"
import { Branch } from "../../features/branch/branch"
import { BranchStore } from "../../features/branch/store"
import { Chat } from "../../features/chat/chat"
import { CodeIntel } from "../../features/code-intel/codeIntel"
import { FlowsUi } from "../../features/flows-ui/flowsUi"
import { Commands } from "../../features/commands/commands"
import { Home } from "../../features/home/home"
import { Issues } from "../../features/issues/issues"
import { Pulls } from "../../features/pulls/pulls"
import { Repo } from "../../features/repo/repo"
import { Runs } from "../../features/runs/runs"
import { Status } from "../../features/status/status"
import { Terminal } from "../../features/terminal/terminal"
import { TerminalStore } from "../../features/terminal/store"
import { Theme } from "../../features/theme/theme"
import { Todos } from "../../features/todos/todos"
import { Views } from "../../features/views/views"
import { router as productionRouter } from "../../router"
import { openFaultyApp, TestChatApi } from "../../test/chatApi"
import { EngineFaults } from "../../test/faults"
import { dialing, roomHost } from "../../test/rooms"
import { read } from "../../test/otlp"

const disposables: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of disposables.splice(0).reverse()) await dispose()
})

const open = async () => {
  const room = await roomHost()
  disposables.push(room.close)
  const runtime = openFaultyApp({ webSocket: dialing(room.origin, { id: "person-member", name: "member" }) })
  disposables.push(() => runtime.dispose())
  const [repo, home, views, branch, terminal, issues, pulls, todos, runs, flows, chat, attention, auth, intel, fault, api, status, commands, theme] =
    await runtime.runPromise(Effect.all([
      Effect.service(Repo), Effect.service(Home), Effect.service(Views), Effect.service(Branch),
      Effect.service(Terminal), Effect.service(Issues), Effect.service(Pulls), Effect.service(Todos),
      Effect.service(Runs), Effect.service(FlowsUi), Effect.service(Chat), Effect.service(Attention),
      Effect.service(Auth), Effect.service(CodeIntel), Effect.service(EngineFaults), Effect.service(TestChatApi),
      Effect.service(Status), Effect.service(Commands), Effect.service(Theme),
    ]))
  await runtime.runPromise(fault.holdStarts)
  const terminalStore = await runtime.runPromise(Effect.service(TerminalStore))
  const branchStore = await runtime.runPromise(Effect.service(BranchStore))
  const shapes = await runtime.runPromise(Effect.service(ShapeSource.Faults))
  // Tracking verifies the default branch too; HEAD must resolve to a published ref.
  api.branches.github.publish("octo", "hello", { defaultBranch: "main", branches: { main: shaOf("main"), work: shaOf("work") } })
  for (const query of [
    ...Object.values(repo.queries), branch.queries.current, branch.presence.queries.room, branch.presence.queries.participants,
    chat.queries.connection, chat.queries.place, chat.queries.queued, intel.queries.state, terminal.queries.panel, terminal.queries.tabs,
    attention.queries.unread, attention.queries.needs, attention.queries.panel, auth.queries.session,
  ]) query.startSyncImmediate()
  return {
    context: { repo, home, views, branch, terminal, issues, pulls, todos, runs, flows },
    current: () => branch.queries.current.toArray[0],
    release: () => runtime.runPromise(fault.releaseStarts),
    downShapes: () => runtime.runPromise(shapes.down()),
    upShapes: () => runtime.runPromise(shapes.heal),
    previousBranch: () => runtime.runPromise(Effect.gen(function* () {
      repo.actions.openRoute("tree", { owner: "old-owner", repo: "old-repo", ref: "previous" }, {})
      yield* branchStore.current.update("current", (row) => void Object.assign(row,
        { owner: "old-owner", repo: "old-repo", name: "previous", status: "ready", branchId: "previous-branch",
          conversationId: crypto.randomUUID(), mode: "open", access: "owner" }))
      yield* terminalStore.panel.update("panel", (row) => void Object.assign(row,
        { branchId: "previous-branch", terminalId: "previous-terminal", phase: "open", access: "write" }))
      yield* terminalStore.tabs.insert({ id: "previous-terminal", ownerId: "previous-owner", ownerLogin: "previous-owner",
        mine: false, status: "open", createdAt: "2026-10-21T00:00:00Z" })
    })),
    exported: async () => { await runtime.dispose(); return read(api.telemetry) },
    render: branchRenderer({ chat, auth, repo, branch, intel, status, commands, theme, terminal, attention }),
  }
}

const onBranch = (context: Awaited<ReturnType<typeof open>>["context"], terminal = false) => createRouter({
  ...productionRouter.options,
  context,
  origin: "http://localhost",
  history: createMemoryHistory({ initialEntries: [`/octo/hello/tree/work${terminal ? "?terminal=me" : ""}`] }),
})

// Node's server renderer does not mount the client's Suspense acknowledgement effects. Render the production route's
// actual selected pending component under the same route; the navigation/loader and its held services remain real.
const pendingView = async (tab: Awaited<ReturnType<typeof open>>, terminal = false) => {
  const root = createRootRoute()
  const route = createRoute({ getParentRoute: () => root, path: "/$owner/$repo/tree/$ref/$",
    component: productionRouter.routesById["/$owner/$repo/tree/$ref/$"].options.pendingComponent,
  })
  const router = createRouter({ routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [`/octo/hello/tree/work${terminal ? "?terminal=me" : ""}`] }),
  })
  await router.load()
  return () => tab.render(router)
}

test("an evicted device renders branch chrome while tracking waits, then opens the verified workspace", async () => {
  const tab = await open()
  const router = onBranch(tab.context)
  const entering = router.load()
  const render = () => tab.render(router)
  try {
    await vi.waitFor(() => expect(tab.current()?.status).toBe("tracking"), { timeout: 10_000 })
    const html = (await pendingView(tab))()
    expect(html).toContain('aria-label="Branch"')
    expect(html).toContain("octo / hello")
    expect(html).toContain('href="/octo/hello/tree/work"')
    expect(html).toContain('href="/octo/hello/tree/work?terminal=me"')
    expect(html).toContain('aria-label="Connection"')
    expect(html).not.toMatch(/>Owner<|>Can edit<|>Can view<|>Share</)
    expect(html).not.toContain('aria-label="Conversation"')
    expect(html).not.toContain('data-slot="chat-composer"')
  } finally {
    await tab.release()
    await entering
  }
  expect(tab.current()?.status).toBe("ready")
  const verified = render()
  expect(verified).toContain("Owner")
  expect(verified).toContain("Share")
  expect(verified).toContain('aria-label="Conversation"')

  // A revoked owner's stored grant cannot keep Share or its dialog visible.
  const root = createRootRoute()
  const route = createRoute({ getParentRoute: () => root, path: "/$owner/$repo/tree/$ref",
    component: DeniedBranchHeader,
  })
  const denied = createRouter({ routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/octo/hello/tree/work"] }),
  })
  await denied.load()
  expect(tab.render(denied)).toBe("")
  const records = await tab.exported()
  expect(records.log("branch.open")).toContainEqual(expect.objectContaining({
    attributes: expect.objectContaining({ feature: "branch", outcome: "tracking" }),
    traceId: expect.any(String),
  }))
}, 90_000)

test("pending chrome names the destination and hides the previous branch through terminal preload", async () => {
  const tab = await open()
  await tab.previousBranch()
  const router = onBranch(tab.context, true)
  const entering = router.load()
  const render = () => tab.render(router)
  try {
    const pending = await pendingView(tab, true)
    const warming = pending()
    expect(warming).toContain("octo / hello")
    expect(warming).toContain("work")
    expect(warming).not.toMatch(/old-owner|old-repo|previous|>Owner<|>Share</)
    await vi.waitFor(() => expect(tab.current()?.status).toBe("tracking"), { timeout: 10_000 })
    await tab.downShapes()
    await tab.release()
    await vi.waitFor(() => expect(tab.current()?.status).toBe("ready"), { timeout: 40_000 })
    // Tracking is verified but the full route still waits for B's live parts. A's terminal remains hidden.
    const tracked = pending()
    expect(tracked).toContain('aria-label="Branch"')
    expect(tracked).not.toContain('aria-label="Terminal"')
    expect(tracked).not.toContain('aria-label="Conversation"')
    expect(tracked).not.toMatch(/previous|>Owner<|>Share<|Open terminal/)
  } finally {
    await tab.release()
    await tab.upShapes()
    await entering
  }
  expect(tab.context.terminal.queries.panel.toArray[0]?.branchId).toBe(tab.current()?.branchId)
  const verified = render()
  expect(verified).toContain('aria-label="Terminal"')
  expect(verified).not.toContain("previous-owner")
}, 90_000)
