import { FileTabs, type FileTab } from "@smthrs/ui"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useRouterState } from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import { useSyncExternalStore } from "react"

const files: ReadonlyArray<FileTab> = [
  { key: "README.md", label: "README.md", href: "/README.md", active: false },
  { key: "index.html", label: "index.html", href: "/index.html?L=2-4", active: false },
]
const closed = new Set<string>()
let version = 0
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => version
const changed = () => { version++; for (const listener of listeners) listener() }
let release: () => void
const navigation = new Promise<void>((resolve) => { release = resolve })
Object.assign(window, { releaseNavigation: () => release(), closeRemaining: () => { closed.add("index.html"); changed() } })
const root = createRootRoute({ component: () => <><button id="outside">Outside</button><Outlet /></> })
let initial = true
const route = createRoute({
  getParentRoute: () => root,
  path: "/$file",
  pendingComponent: () => <div id="pending" style={{ height: 1 }} />,
  beforeLoad: () => {
    if (initial) { initial = false; return }
    return navigation
  },
  component: function Files() {
    useSyncExternalStore(subscribe, snapshot)
    const path = useRouterState({ select: (state) => state.location.pathname })
    return <FileTabs
      tabs={files.filter((file) => !closed.has(file.key)).map((file) => ({ ...file, active: path === `/${file.key}` }))}
      onOpen={(file) => { void router.navigate({ href: file.href }) }}
      onClose={(file) => {
        closed.add(file.key)
        changed()
        void router.navigate({ href: files.find((next) => !closed.has(next.key))!.href })
      }}
    />
  },
})
const router = createRouter({
  routeTree: root.addChildren([route]),
  history: createMemoryHistory({ initialEntries: ["/README.md"] }),
  // Production's default pending delay; the test controls when navigation completes.
  defaultPendingMs: 1_000,
  defaultPendingMinMs: 0,
})
createRoot(document.getElementById("app")!).render(<RouterProvider router={router} />)
