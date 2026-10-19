import { createRoot } from "react-dom/client"
import { MockProvider } from "../../core/mock"
import { allRoutes, resolveRoute, setRoutes } from "../../core/router"
import { ScreensPage, screensFor, Shell, SITE } from "../../core/Shell"
import { frontRoutes } from "../../front/routes"
import { repoRoutes } from "../../repo/routes"
import { dataset } from "../../repo/fixtures/data/smithers-canary__smithers"
import { selectRepo } from "../../repo/fixtures"
import { routes } from "./routes"
selectRepo(dataset.repo.slug)
setRoutes([
  { pattern: "__screens", name: "Review index", render: () => <ScreensPage/>, screens: [] },
  ...frontRoutes, ...routes, ...repoRoutes
])
;(window as unknown as { __SITE__: unknown }).__SITE__ = {
  site: SITE, routes: allRoutes().map(route => route.pattern), screens: screensFor(SITE),
  resolve: (route: string) => resolveRoute(route)?.route.pattern ?? null
}
createRoot(document.getElementById("root")!).render(<MockProvider><Shell/></MockProvider>)
