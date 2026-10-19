/* Stage 2: the unchanged front pages, followed by the default repo UI with Smithers' dataset. */
import { createRoot } from "react-dom/client"
import { MockProvider } from "./core/mock"
import { allRoutes, resolveRoute, setRoutes, type Screen } from "./core/router"
import { ScreensPage, screensFor, Shell, SITE } from "./core/Shell"
import { frontRoutes, sharedSmithersPatterns } from "./front/routes"
import { repoRoutes } from "./repo/routes"
import { dataset } from "./repo/fixtures/data/smithers-canary__smithers"

const base = `smithers.sh/${dataset.repo.slug}`
const file = "packages/smithers/src/IssueTodoDraft.ts"
const issue = dataset.issues.find(value => value.receipt)?.n ?? dataset.issues[0]!.n
const pull = dataset.pulls.find(value => value.state === "open")!.n
const run = dataset.runs.find(value => value.flow === "release")!.id
const concrete: Record<string, [string, string]> = {
  actions: ["redirect-actions", "actions"], labels: ["redirect-labels", "labels"], milestones: ["redirect-milestones", "milestones"], "releases/latest": ["redirect-latest", "releases/latest"],
  bug: ["bug", "bug"], "bug/sent/:n": ["bug-sent", "bug/sent/4218?receipt=sample"],
  "": ["home", ""],
  "tree/:ref": ["tree", "tree/main"],
  "tree/:ref/*": ["directory", "tree/main/packages/smithers/docs"],
  "blob/:ref/*": ["file", `blob/main/${file}`],
  "blame/:ref/*": ["blame", `blame/main/${file}`],
  "commits/:ref": ["commits", "commits/main"],
  "commits/:ref/*": ["file-history", "commits/main/packages/smithers/test/FaultTiers.test.ts"],
  "commit/:sha": ["commit", `commit/${dataset.branches.find(value => value.name === dataset.repo.defaultBranch)!.head}`],
  "branches/:branch/terminal": ["terminal", "branches/main/terminal"],
  branches: ["branches", "branches"], tags: ["tags", "tags"],
  issues: ["issues", "issues"], "issues/new": ["new-issue", "issues/new"], "issues/:n": ["issue", `issues/${issue}`],
  pulls: ["pulls", "pulls"], "pull/:n": ["pull", `pull/${pull}`],
  "pull/:n/commits": ["pull-commits", `pull/${pull}/commits`],
  "pull/:n/checks": ["pull-checks", `pull/${pull}/checks`],
  "pull/:n/files": ["pull-files", `pull/${pull}/files`],
  stack: ["landing-queue", "stack"], runs: ["runs", "runs"], "runs/:id": ["run", `runs/${run}`], approvals: ["approvals", "approvals"],
  flows: ["flows", "flows"], "flows/:name": ["flow", "flows/land"], agents: ["agents", "agents"],
  evals: ["evals", "evals"], "evals/:suite": ["eval-suite", "evals/review-seeded-bugs"],
  wiki: ["wiki", "wiki"], "wiki/:page": ["wiki-page", "wiki/landing-queue"],
  docs: ["docs", "docs"], "docs/*": ["docs-page", "docs/installation"],
  releases: ["releases", "releases"], "releases/tag/:tag": ["release", `releases/tag/${dataset.releases[0]!.tag}`],
  settings: ["settings", "settings"], "settings/:section": ["models", "settings/models"], search: ["search", "search?q=flow"]
}
const screen = (id: string, path: string, label: string, overrides = ""): Screen => {
  const [pathname, raw = ""] = path.split("?")
  const query = new URLSearchParams("as=in&role=member&landing=install&host=hosted&hosted=up&model=connected&net=ok&data=full")
  new URLSearchParams(raw).forEach((value, key) => query.set(key, value))
  new URLSearchParams(overrides).forEach((value, key) => query.set(key, value))
  return { id: `smithers-site-${id}`, route: `${base}${pathname ? `/${pathname}` : ""}?${query}`, label, site: "smithers-site", ...(query.get("net") === "slow" ? { wait: 100 } : {}) }
}
const readStates = (id: string, path: string): Screen[] => [
  screen(`${id}-loading`, path, "Loading", "net=slow"),
  screen(`${id}-error`, path, "Read failed · Retry", "net=error"),
  screen(`${id}-empty`, path, "Empty", "data=empty"),
  screen(`${id}-signed-out`, path, "Read signed out", "as=out"),
  screen(`${id}-reader-denied`, path, "Read as a reader", "role=reader")
]
const story: Record<string, Screen[]> = {
  "": [screen("home-signed-out", "", "Smithers home · signed out", "as=out"), screen("home-loading", "", "Home · loading", "net=slow"), screen("home-error", "", "Home · sync failed", "net=error"), screen("home-empty", "", "Home · empty", "data=empty")],
  issues: [screen("fixed-by-agents", "issues?q=is:fixed-by-agents", "Four issues fixed by agents"), ...readStates("fixed-by-agents", "issues?q=is:fixed-by-agents")],
  docs: readStates("docs", "docs"),
  "docs/*": readStates("docs-page", "docs/installation"),
  "issues/:n": [4218, 4217, 4214, 4209].map(n => screen(`receipt-${n}`, `issues/${n}`, `Fix receipt · #${n}`)),
  stack: [screen("queue-reader", "stack", "Landing queue · reader", "role=reader")],
  runs: ["issue-triage", "docs-sync", "land", "release"].map(flow => screen(`runs-${flow}`, `runs?flow=${flow}`, `Runs · ${flow}`)),
  "settings/:section": [screen("settings-denied", "settings/models", "Settings require membership", "role=reader")]
}

setRoutes([
  { pattern: "__screens", name: "Review index", render: () => <ScreensPage />, screens: [{ id: "smithers-site-all-screens", route: "__screens", label: "All screens", site: "smithers-site" }] },
  ...frontRoutes.filter(route => sharedSmithersPatterns.has(route.pattern)).map(route => ({
    ...route, screens: route.screens.map(value => ({ ...value, site: "smithers-site" as const,
      route: value.route.replaceAll("maya%2Ftinyhttp", "smithers-canary%2Fsmithers").replaceAll("smithersai%2Fsmithers", "smithers-canary%2Fsmithers") }))
  })),
  ...repoRoutes.map(route => {
    const suffix = route.pattern.replace(/^smithers\.sh\/:owner\/:repo\/?/, "")
    const sample = concrete[suffix]
    if (!sample) throw new Error(`Smithers site needs a concrete screen for ${route.pattern}`)
    return { ...route, screens: [
      ...route.screens.filter(value => value.route.split("?")[0] === base || value.route.startsWith(`${base}/`)).map(value => ({ ...value, site: "smithers-site" as const })),
      screen(sample[0], sample[1], route.name), ...(story[suffix] ?? [])
    ] }
  })
])
;(window as unknown as { __SITE__: unknown }).__SITE__ = {
  site: SITE, routes: allRoutes().map(route => route.pattern), screens: screensFor(SITE),
  resolve: (route: string) => resolveRoute(route)?.route.pattern ?? null
}
createRoot(document.getElementById("root")!).render(<MockProvider><Shell /></MockProvider>)
