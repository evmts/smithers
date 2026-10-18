/* Effect uses the default repository UI. Repository-declared views precede generic routes. */
import { createRoot } from "react-dom/client"
import { MockProvider } from "./core/mock"
import { allRoutes, resolveRoute, setRoutes, type Route, type Screen } from "./core/router"
import { ScreensPage, screensFor, Shell, SITE } from "./core/Shell"
import { frontRoutes, sharedSmithersPatterns } from "./front/routes"
import { repoRoutes } from "./repo/routes"
import { commits, releases as repositoryReleases, selectRepo } from "./repo/fixtures"
import { effectRoutes } from "./effect/routes"

const base = "smithers.sh/Effect-TS/effect"
selectRepo("Effect-TS/effect")
const flags = "as=in&role=member&net=ok&data=full&landing=open&hosted=up&host=hosted&model=connected"
const concreteRoute = (pattern: string) => {
  const path = pattern.replace("smithers.sh/:owner/:repo", base)
  const wildcard = pattern.includes("/docs") ? "sql-pg" : pattern.includes("/tree") ? "packages/sql/pg/src" : "packages/sql/pg/src/PgClient.ts"
  const params: Record<string, string> = {
    branch: encodeURIComponent("fix/pg-aborted-commit"), ref: "main", sha: commits[0]!.sha,
    n: pattern.includes("/issues") || pattern.includes("/bug/sent/") ? "42" : "101", id: "run-4802", name: "affected",
    tag: encodeURIComponent(repositoryReleases[0]!.tag), section: "models", page: "architecture", suite: "agent"
  }
  return path.replace(/:(\w+)/g, (_, key: string) => {
    if (!(key in params)) throw new Error(`Missing screen parameter: ${key}`)
    return params[key]!
  }).replace("*", wildcard)
}
const curated = (route: Route): Route => {
  const suffix = route.pattern.replace("smithers.sh/:owner/:repo", "").replace(/\//g, "-").replace(/:/g, "").replace(/\*/g, "path") || "-home"
  const ready: Screen = { id: `effect-repo${suffix}`, route: `${concreteRoute(route.pattern)}?${flags}`, label: route.pattern.includes("/evals") ? "Undeclared tab · not found" : route.name, site: "effect" }
  const screens = [ready]
  if (route.pattern === "smithers.sh/:owner/:repo") {
    screens.push(...[
      ["loading", "net=slow", "Loading repository"], ["error", "net=error", "Repository read failed"],
      ["empty", "data=empty", "Empty repository"], ["signed-out", "as=out", "Public repository"],
      ["scoped", "package=sql-pg", "Repository with package scope"]
    ].map(([id, query, label]) => {
      const params = new URLSearchParams(flags)
      for (const [key, value] of new URLSearchParams(query)) params.set(key, value)
      return { id: `effect-repo-home-${id}`, route: `${base}?${params}`, label, site: "effect" as const, ...(id === "loading" ? { wait: 120 } : {}) }
    }))
  }
  if (route.pattern.endsWith("/tree/:ref/*")) screens.push({ id: "effect-package-inferred-tree", route: `${base}/tree/main/packages/sql/pg/src?${flags}`, label: "Package inferred from directory", site: "effect" })
  if (route.pattern.endsWith("/blob/:ref/*")) screens.push({ id: "effect-package-inferred-file", route: `${base}/blob/main/packages/sql/pg/src/PgClient.ts?${flags}`, label: "Package inferred from source file", site: "effect" })
  return { ...route, screens }
}
const extensions = effectRoutes
const overridden = new Set(extensions.map(route => route.pattern))
setRoutes([
  { pattern: "__screens", name: "Review index", render: () => <ScreensPage />, screens: [{ id: "effect-all-screens", route: "__screens", label: "All Effect screens", site: "effect" }] },
  ...frontRoutes.filter(route => sharedSmithersPatterns.has(route.pattern)).map(route => ({
    ...route, screens: route.screens.slice(0, 1).map(screen => ({ ...screen, id: `effect-${screen.id}`, route: screen.route.replace(/smithers\.sh\/maya\/tinyhttp/g, base), site: "effect" as const }))
  })),
  ...extensions,
  ...repoRoutes.filter(route => !overridden.has(route.pattern)).map(curated)
])
;(window as unknown as { __SITE__: unknown }).__SITE__ = {
  site: SITE,
  routes: allRoutes().map(route => route.pattern),
  screens: screensFor(SITE),
  resolve: (route: string) => resolveRoute(route)?.route.pattern ?? null
}
createRoot(document.getElementById("root")!).render(<MockProvider><Shell /></MockProvider>)
