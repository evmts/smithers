/*
 * Entry for the site mocks: node .specs/design/mock/build.mjs --site=effeck|smithers.
 * One bundle holds both apps' routes, so a link from effeck.dev to smithers.sh stays inside the mock; the site
 * picks the start page and the screen list. front/ owns the landings, docs, launcher and sign-in; app/ owns the
 * smithers.sh app (repo home, code, issues, changes, runs and every card). Front routes match first.
 */
import { createRoot } from "react-dom/client"
import { appRoutes } from "./app/routes"
import { MockProvider } from "./core/mock"
import { allRoutes, resolveRoute, setRoutes } from "./core/router"
import { ScreensPage, screensFor, Shell, SITE } from "./core/Shell"
import { frontRoutes } from "./front/routes"

setRoutes([
  { pattern: "__screens", name: "Review index", render: () => <ScreensPage />, screens: [{ id: "all-screens", route: "__screens", label: "All screens" }] },
  ...frontRoutes,
  ...appRoutes
])

/* For crawl.mjs and shot.mjs --all. */
;(window as unknown as { __SITE__: unknown }).__SITE__ = {
  site: SITE,
  /* Routes this mock must show: those with a screen for this site, and any route with no screen at all (a gap). */
  routes: allRoutes().filter(route => route.screens.length === 0 || route.screens.some(screen => screen.site === undefined || screen.site === SITE)).map(route => route.pattern),
  screens: screensFor(SITE),
  resolve: (route: string) => resolveRoute(route)?.route.pattern ?? null
}

createRoot(document.getElementById("root")!).render(<MockProvider><Shell /></MockProvider>)
