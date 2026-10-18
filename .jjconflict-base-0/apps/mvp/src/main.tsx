import { SmithersUiStyles } from "@smthrs/ui"
import { BrowserCollectionCoordinator, createBrowserWASQLitePersistence } from "@tanstack/browser-db-sqlite-persistence"
import { SharedSqlite, StoragePersistence, WebLock } from "@smthrs/platform-browser"
import { IndexedDBAdapter, startOfflineExecutor, WebOnlineDetector } from "@tanstack/offline-transactions"
import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ChatProvider } from "./AppContext"
import { type BootOptions, type Host, realServices, start } from "./boot"
import { AuthProvider } from "./features/auth/components/AuthContext"
import { RepoProvider } from "./features/repo/components/RepoContext"
import { THEME_ATTRIBUTE, THEME_MIRROR_KEY } from "./features/theme/contract"
import { ENGINE_NAME } from "./flows/contract"
import { ThemeProvider } from "./features/theme/components/ThemeButton"
import { router } from "./router"
import "./styles/fonts.css"

// The page: `start` runs the app's one program, and React renders the chat, sign-in, theme and repository layers it
// hands over.
// This is the browser's host: everything platform-specific the app's layers take as arguments
// (docs/decisions/0002-local-first.md §6).
const root = createRoot(document.getElementById("root")!)

// What sign-out wipes (decision 0008 §4.6): the engine's OPFS directory (@smthrs/platform-browser's
// `BrowserRuntime.layerHost`), which holds the engine's store and the device store, the app's shared database, and
// the outbox's IndexedDB database. The theme's mirror stays.
const ENGINE_DIRECTORY = ["smithers", ENGINE_NAME] as const
const OUTBOX_DATABASE = "smithers-outbox"

// A worker's open handle blocks deleting an OPFS file, so a wipe only marks itself and has every tab reload; the next
// boot deletes before anything opens. The mark is a localStorage key, and the other tabs hear of it on this channel.
const WIPE_MARK = "smithers-wipe"
const wipes = new BroadcastChannel(WIPE_MARK)
wipes.onmessage = () => window.location.reload()

const marked = () => {
  try {
    return localStorage.getItem(WIPE_MARK) !== null
  } catch {
    return false
  }
}

/** Removes `name` from `directory`; one already gone is fine. */
const removeEntry = async (directory: FileSystemDirectoryHandle, name: string) => {
  try {
    await directory.removeEntry(name, { recursive: true })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error
  }
}

/** Deletes an IndexedDB database; fails when another tab still holds it open. */
const deleteDatabase = (name: string) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new DOMException("blocked", "InvalidStateError"))
  })

/**
 * Finishes a wipe a sign-out marked, before `start` opens anything: one tab at a time, under an exclusive Web Lock,
 * deletes the device's databases, then clears the mark. When deleting fails, as when another tab still holds a
 * database open, the mark stays and the next boot tries again.
 */
const finishWipe = async () => {
  if (!marked()) return
  await navigator.locks.request(WIPE_MARK, { mode: "exclusive" }, async () => {
    if (!marked()) return
    const root = await navigator.storage.getDirectory()
    const [parent, engine] = ENGINE_DIRECTORY
    const engines = await root.getDirectoryHandle(parent).catch(() => undefined)
    if (engines !== undefined) await removeEntry(engines, engine)
    await deleteDatabase(OUTBOX_DATABASE)
    localStorage.removeItem(WIPE_MARK)
  })
}

// The device store: the app's shared SQLite database in the engine worker's OPFS pool (@smthrs/platform-browser's
// `SharedSqlite`), one per origin, reached by every tab through the leading tab's worker. The outbox: IndexedDB,
// sending when the browser says it can, led by one tab through @smthrs/platform-browser's Web Lock service.
const host: Host = {
  persistence: {
    open: () => SharedSqlite.open({ name: ENGINE_NAME }),
    make: (database, coordinator) => createBrowserWASQLitePersistence({ database, ...(coordinator ? { coordinator } : {}) }),
    coordinator: () => new BrowserCollectionCoordinator({ dbName: "smithers" }),
  },
  outbox: {
    start: startOfflineExecutor,
    storage: new IndexedDBAdapter(OUTBOX_DATABASE, "transactions"),
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
  // This tab's engine worker: it runs every client flow, the agent among them, once its tab leads (decision 0011).
  engineWorker: () => new Worker(new URL("./flows/engine.worker.ts", import.meta.url), { type: "module" }),
  // Sign-out's wipe: mark it, have the other tabs reload, and reload; `finishWipe` deletes at the next boot.
  wipe: async () => {
    localStorage.setItem(WIPE_MARK, "1")
    wipes.postMessage("wipe")
    window.location.reload()
  },
}

const render: BootOptions["render"] = (chat, auth, theme, repo) =>
  root.render(
    <StrictMode>
      <SmithersUiStyles withTheme />
      <ChatProvider value={chat}>
        <AuthProvider value={auth}>
          <ThemeProvider value={theme}>
            <RepoProvider value={repo}>
              {/* The repository routes' loaders open their location through `repo` (src/router.tsx). */}
              <RouterProvider router={router} context={{ repo }} />
            </RepoProvider>
          </ThemeProvider>
        </AuthProvider>
      </ChatProvider>
    </StrictMode>,
  )

const page = {
  origin: window.location.origin,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => window.fetch(input, init),
  reload: () => window.location.reload(),
  host,
  target: window,
  startedAt: performance.timeOrigin,
  render,
}

// Under the dev server, `?faults` opens the app on faulty services for the end-to-end tests of unhappy paths
// (src/test/e2e.ts). A production build drops this branch, and the test module with it. Either way, a wipe a sign-out
// marked finishes first.
void finishWipe()
  .catch(() => {
    // The mark stays, and the next boot deletes again.
  })
  .then(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("faults")) {
      void import("./test/e2e").then((e2e) => e2e.startWithFaults(page, window.location.search, window))
    } else {
      start(page, realServices(page))
    }
  })
