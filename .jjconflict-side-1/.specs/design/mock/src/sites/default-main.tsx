/* Default repo site entry. Front routes precede repository routes; family views register in repo/routes.tsx. */
import { createRoot } from "react-dom/client"
import { MockProvider } from "./core/mock"
import { allRoutes, resolveRoute, setRoutes } from "./core/router"
import { ScreensPage, screensFor, Shell, SITE } from "./core/Shell"
import { frontRoutes, sharedSmithersPatterns } from "./front/routes"
import { repoRoutes } from "./repo/routes"
import { effectRoutes } from "./effect/routes"

const extensions = effectRoutes.map(route => ({
  ...route,
  screens: [
    ...(repoRoutes.find(candidate => candidate.pattern === route.pattern)?.screens ?? []),
    ...route.screens.map(screen => ({ ...screen, site: undefined }))
  ]
}))
const overridden = new Set(extensions.map(route => route.pattern))
setRoutes([
  { pattern: "__screens", name: "Review index", render: () => <ScreensPage />, screens: [{ id: "all-screens", route: "__screens", label: "All screens" }] },
  ...frontRoutes.filter(route => sharedSmithersPatterns.has(route.pattern)).map(route => ({ ...route, screens: route.screens.map(screen => ({ ...screen, site: undefined })) })),
  ...extensions,
  ...repoRoutes.filter(route => !overridden.has(route.pattern)).map(route => ({
    ...route,
    screens: route.pattern.includes("/evals") ? route.screens.map(screen => ({ ...screen, site: undefined })) : route.screens
  }))
])
;(window as unknown as { __SITE__: unknown }).__SITE__ = {
  site: SITE,
  routes: allRoutes().map(route => route.pattern),
  screens: screensFor(SITE),
  resolve: (route: string) => resolveRoute(route)?.route.pattern ?? null
}
createRoot(document.getElementById("root")!).render(<MockProvider><Shell /></MockProvider>)
