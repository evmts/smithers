import { SmithersUiStyles } from "@smthrs/ui"
import { BrowserCollectionCoordinator, createBrowserWASQLitePersistence } from "@tanstack/browser-db-sqlite-persistence"
import { SharedSqlite, StoragePersistence, WebLock } from "@smthrs/platform-browser"
import { IndexedDBAdapter, startOfflineExecutor, WebOnlineDetector } from "@tanstack/offline-transactions"
import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ChatProvider } from "./AppContext"
import { type BootOptions, type Host, realServices, start } from "./boot"
import { AttentionProvider } from "./features/attention/components/AttentionContext"
import { AuthProvider } from "./features/auth/components/AuthContext"
import { BranchProvider } from "./features/branch/components/BranchContext"
import { CodeIntelProvider } from "./features/code-intel/components/CodeIntelContext"
import { CommandsProvider } from "./features/commands/components/CommandsContext"
import { IssuesProvider } from "./features/issues/components/IssuesContext"
import { RepoProvider } from "./features/repo/components/RepoContext"
import { RunsProvider } from "./features/runs/components/RunsContext"
import { FlowsUiProvider } from "./features/flows-ui/components/FlowsUiContext"
import { HomeProvider } from "./features/home/components/HomeContext"
import { THEME_ATTRIBUTE, THEME_MIRROR_KEY } from "./features/theme/contract"
import { ENGINE_NAME } from "./flows/contract"
import { ThemeProvider } from "./features/theme/components/ThemeButton"
import { StatusProvider } from "./features/status/components/StatusContext"
import { SpendProvider } from "./features/spend/components/SpendContext"
import { TerminalProvider } from "./features/terminal/components/TerminalContext"
import { TodosProvider } from "./features/todos/components/TodosContext"
import { ViewsProvider } from "./features/views/components/ViewsContext"
import { WebProvider } from "./features/web/components/WebContext"
import { router } from "./router"
import { activationGate, boundFetch, DeviceIdentityRefused, IDENTITY_MESSAGE, OWNER_KEY, readOwner, readSession, type DeviceOwner } from "./device/identity"
import { memoryStorage, pageWipe, unwiped } from "./wipe"
import "./styles/fonts.css"

// The page: `start` runs the app's one program, and React renders the chat, sign-in, theme, repository and slash-command
// layers it hands over.
// This is the browser's host: everything platform-specific the app's layers take as arguments
// (docs/decisions/0002-local-first.md §6).
const root = createRoot(document.getElementById("root")!)

// Sign-out's wipe (src/wipe.ts, decision 0008 §4.6): this page hears wipes from the start and holds the device's data
// while it runs. A boot a sign-out marked deletes the engine's OPFS directory (the engine's store and the device store)
// and the outbox's IndexedDB database once no other page and no engine worker has them open. The theme's mirror stays.
const OUTBOX_DATABASE = "smithers-outbox"
const wipe = pageWipe(
  {
    locks: navigator.locks,
    // Read when used: a browser that blocks storage throws on reaching `localStorage`.
    marks: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    },
    directory: () => navigator.storage.getDirectory(),
    indexedDB,
    channel: (name) => new BroadcastChannel(name),
    reload: () => window.location.reload(),
  },
  { engine: ENGINE_NAME, outbox: OUTBOX_DATABASE },
)

// The device store: the app's shared SQLite database in the engine worker's OPFS pool (@smthrs/platform-browser's
// `SharedSqlite`), one per origin, reached by every tab through the leading tab's worker. The outbox: IndexedDB,
// sending when the browser says it can, led by one tab through @smthrs/platform-browser's Web Lock service.
let deviceOwner: DeviceOwner | undefined
try { deviceOwner = readOwner(localStorage.getItem(OWNER_KEY)) } catch {}
let identityWorker: Worker | undefined
const activation = activationGate(30_000, (reason) => {
  // A leader from an earlier build cannot report ownership. End this tab's engine as well as selecting memory.
  identityWorker?.terminate()
  identityWorker?.dispatchEvent(new ErrorEvent("error", { error: new DeviceIdentityRefused({ reason: `activation_${reason}` }) }))
})
const identityKnown = activation.ready
const memoryOutbox = memoryStorage()
let retainedOutbox: IndexedDBAdapter | undefined
const outboxStorage = async () => {
  await identityKnown
  return activation.state() === "retained" ? (retainedOutbox ??= new IndexedDBAdapter(OUTBOX_DATABASE, "transactions")) : memoryOutbox
}
let identityChecking = false
const acceptIdentity = async (snapshot: { owner?: DeviceOwner; outcome: string }) => {
  if (identityChecking || activation.state() !== "pending") return
  identityChecking = true
  deviceOwner = snapshot.owner
  if (snapshot.outcome === "changed") { await wipe.wipe(); return }
  let signedOut = snapshot.outcome === "signed_out"
  try {
    const response = await window.fetch(`${window.location.origin}/api/auth/session`, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
    if (response.ok) {
      const session = readSession(await response.json())
      if (session === undefined) signedOut = true
      else if (session.signedIn && session.personId !== deviceOwner?.personId) { await wipe.wipe(); return }
      signedOut ||= session !== undefined && !session.signedIn && deviceOwner !== undefined
    }
  } catch {}
  if (activation.state() !== "pending") return
  if (signedOut) activation.refuse()
  else activation.allow()
  if (deviceOwner !== undefined) {
    try { localStorage.setItem(OWNER_KEY, JSON.stringify(deviceOwner)) } catch {}
  }
}
const identityChannel = new BroadcastChannel(IDENTITY_MESSAGE)
identityChannel.onmessage = (event) => {
  if (event.data?._tag === IDENTITY_MESSAGE) void acceptIdentity(event.data)
}
const identityFailed = () => {
  if (!identityChecking) activation.refuse()
}
const host: Host = {
  persistence: {
    open: async () => {
      await identityKnown
      if (activation.state() !== "retained") throw new DeviceIdentityRefused({ reason: "signed_out" })
      return SharedSqlite.open({ name: ENGINE_NAME })
    },
    make: (database, coordinator) => createBrowserWASQLitePersistence({ database, ...(coordinator ? { coordinator } : {}) }),
    coordinator: () => new BrowserCollectionCoordinator({ dbName: "smithers" }),
  },
  outbox: {
    start: startOfflineExecutor,
    storage: {
      get: async (key) => (await outboxStorage()).get(key),
      set: async (key, value) => (await outboxStorage()).set(key, value),
      delete: async (key) => (await outboxStorage()).delete(key),
      keys: async () => (await outboxStorage()).keys(),
      clear: async () => (await outboxStorage()).clear(),
    },
    online: new WebOnlineDetector(),
  },
  lock: WebLock.make(navigator.locks),
  isOnline: () => navigator.onLine,
  storage: StoragePersistence.make(navigator.storage),
  // The theme paints `<html data-theme>`, which @smthrs/ui's palette reads, and mirrors the mode into localStorage,
  // which index.html paints from before the store opens. Without a preference the page follows the system.
  theme: {
    paint: (mode) => document.documentElement.setAttribute(THEME_ATTRIBUTE, mode),
    mirror: (mode) => {
      try {
        localStorage.setItem(THEME_MIRROR_KEY, mode)
      } catch {
        // Storage blocked: the store still has the mode, and the next load paints it once the store opens.
      }
    },
    system: () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    painted: () => {
      const mode = document.documentElement.getAttribute(THEME_ATTRIBUTE)
      return mode === "dark" || mode === "light" ? mode : undefined
    },
  },
  // Copy permalink writes here; the browser refuses without the page's focus or permission.
  clipboard: (text) => navigator.clipboard.writeText(text),
  // `app/navigate` moves this tab through the router, never `history` or `location`. The location changes at once;
  // the route's loader then opens what it shows.
  navigate: (path) => void router.navigate({ href: path }),
  // `app/web/open` (src/features/web/url.ts): `http:` pages on this machine open in a new tab only under the dev
  // server. A person's own `/web … tab` opens its tab here, inside their keypress, when the browser still allows it:
  // `window.open` takes the click's activation when it opens a tab, so an activation still there after it means the
  // browser refused, and the flow adds a card instead. A browser that can't say opens nothing here.
  web: {
    policy: { localHttp: import.meta.env.DEV, appOrigin: window.location.origin },
    openTab: (href) => {
      const activation = navigator.userActivation
      if (activation === undefined || !activation.isActive) return false
      window.open(href, "_blank", "noopener,noreferrer")
      return !activation.isActive
    },
  },
  // The repository view's language server: TypeScript in a worker of its own, started when a TypeScript or JavaScript
  // file first shows, so its bundle loads only then (docs/features/code-intelligence.md).
  codeIntelWorker: () => new Worker(new URL("./features/code-intel/language.worker.ts", import.meta.url), { type: "module" }),
  // This tab's engine worker: it runs every client flow, the agent among them, once its tab leads (decision 0011). Under
  // the dev server, `?agent=<script>` names a scripted model for the end-to-end tests (src/test/scriptedAgent.ts); the
  // worker reads it from its name, and a production build drops the branch.
  engineName: ENGINE_NAME,
  engineWorker: () => {
    // Refusal may precede worker creation (a slow wipe/preflight). Never attach a real client afterward.
    if (activation.state() === "memory") return unwiped(host).engineWorker()
    // Vite reads the worker's `type` statically, so it comes after the spread.
    const worker = new Worker(new URL("./flows/engine.worker.ts", import.meta.url), {
      ...(import.meta.env.DEV && new URLSearchParams(window.location.search).has("agent")
        ? { name: `agent:${new URLSearchParams(window.location.search).get("agent")}` }
        : {}),
      type: "module",
    })
    identityWorker = worker
    worker.addEventListener("error", identityFailed)
    worker.addEventListener("message", (event) => {
      if (event.data?._tag === "@smthrs/platform-browser/EngineStopped") identityFailed()
      if (event.data?._tag === IDENTITY_MESSAGE) void acceptIdentity(event.data)
    })
    identityChannel.postMessage({ request: true })
    worker.postMessage({ _tag: IDENTITY_MESSAGE, owner: deviceOwner })
    return worker
  },
  // The tab's title, which counts the agent's open questions (decision 0015).
  title: { read: () => document.title, write: (title) => void (document.title = title) },
  // Sign-out's wipe: mark it and tell every page, this one included; each stops and loads again (src/wipe.ts).
  wipe: wipe.wipe,
}

const render: BootOptions["render"] = (
  chat,
  auth,
  theme,
  repo,
  commands,
  views,
  web,
  status,
  branch,
  terminal,
  issues,
  runs,
  flows,
  home,
  spend,
  attention,
  todos,
  codeIntel,
) =>
  root.render(
    <StrictMode>
      <SmithersUiStyles withTheme />
      <ChatProvider value={chat}>
        <AuthProvider value={auth}>
          <ThemeProvider value={theme}>
            <RepoProvider value={repo}>
              <CodeIntelProvider value={codeIntel}>
              <CommandsProvider value={commands}>
                <ViewsProvider value={views}>
                  <WebProvider value={web}>
                    <StatusProvider value={status}>
                      <SpendProvider value={spend}>
                        <BranchProvider value={branch}>
                          <TerminalProvider value={terminal}>
                            {/* The routes' loaders open what they show through `repo`, `views`, `branch` and `terminal`
                                (src/router.tsx). */}
                            <IssuesProvider value={issues}>
                              <TodosProvider value={todos}>
                              <RunsProvider value={runs}>
                                <FlowsUiProvider value={flows}>
                                  <HomeProvider value={home}>
                                    {/* The one toast stack reads the feed (decision 0009). */}
                                    <AttentionProvider value={attention}>
                                      <RouterProvider
                                        router={router}
                                        context={{ repo, home, views, branch, terminal, issues, todos, runs, flows }}
                                      />
                                    </AttentionProvider>
                                  </HomeProvider>
                                </FlowsUiProvider>
                              </RunsProvider>
                              </TodosProvider>
                            </IssuesProvider>
                          </TerminalProvider>
                        </BranchProvider>
                      </SpendProvider>
                    </StatusProvider>
                  </WebProvider>
                </ViewsProvider>
              </CommandsProvider>
              </CodeIntelProvider>
            </RepoProvider>
          </ThemeProvider>
        </AuthProvider>
      </ChatProvider>
    </StrictMode>,
  )

const page = {
  origin: window.location.origin,
  fetch: boundFetch(window.fetch.bind(window), () => deviceOwner, window.location.origin, identityKnown, async () => {
    console.info("auth.device_identity", { outcome: "reauthorizing" })
    await wipe.wipe()
  }),
  reload: () => window.location.reload(),
  host,
  target: window,
  startedAt: performance.timeOrigin,
  render,
}

// Under the dev server, `?faults` opens the app on faulty services for the end-to-end tests of unhappy paths
// (src/test/e2e.ts). A production build drops this branch, and the test module with it. Either way, a wipe a sign-out
// marked finishes first, and a page whose wipe couldn't delete starts on stores that aren't the device's
// (src/wipe.ts `unwiped`). Leaving on a wipe drops the view, then stops the program.
void wipe.open().then(async (wiped) => {
  try { deviceOwner = readOwner(localStorage.getItem(OWNER_KEY)) } catch {}
  // Verify a known owner before opening any collection, even when this tab follows an already-running engine.
  // The worker performs the same check on the SQLite upgrade source when no mirror exists yet.
  let retainedSession = false
  if (deviceOwner !== undefined) {
    try {
      const response = await window.fetch(`${page.origin}/api/auth/session`, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
      if (response.ok) {
        const session = readSession(await response.json())
        if (session === undefined) retainedSession = true
        else if (session.signedIn && session.personId !== deviceOwner.personId) {
          await wipe.wipe()
          return
        }
        retainedSession ||= session !== undefined && !session.signedIn
      }
    } catch {}
  }
  if (!wiped || retainedSession) activation.refuse()
  const opened = wiped && !retainedSession ? page : { ...page, host: unwiped(host) }
  const leaving = (stop: () => Promise<void>) =>
    wipe.started(() => {
      root.unmount()
      return stop()
    })
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("faults")) {
    void import("./test/e2e")
      .then((e2e) => e2e.startWithFaults(opened, window.location.search, window))
      .then(({ stop }) => leaving(stop))
  } else {
    leaving(start(opened, realServices(opened)).stop)
  }
})
