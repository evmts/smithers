/* Stage 3: effeck.dev and the shared default repository UI, configured by Effeck's dataset. */
import { createRoot } from "react-dom/client"
import { MockProvider } from "./core/mock"
import { allRoutes, resolveRoute, setRoutes, type RouteContext, type Screen } from "./core/router"
import { ScreensPage, screensFor, Shell, SITE } from "./core/Shell"
import { frontRoutes, sharedSmithersPatterns } from "./front/routes"
import { repoRoutes } from "./repo/routes"
import { dataset } from "./repo/fixtures/data/effeck__effeck"

const base = `smithers.sh/${dataset.repo.slug}`
const file = "examples/users/src/main.effeck"
const docs = dataset.docs[0]!.slug
const pull = dataset.pulls.find(value => value.state === "open")!.n
const concrete: Record<string, [string, string]> = {
  actions: ["redirect-actions", "actions"], labels: ["redirect-labels", "labels"], milestones: ["redirect-milestones", "milestones"], "releases/latest": ["redirect-latest", "releases/latest"],
  bug: ["bug", "bug"], "bug/sent/:n": ["bug-sent", "bug/sent/31?receipt=sample"],
  "": ["home", ""],
  "tree/:ref": ["tree", "tree/main"],
  "tree/:ref/*": ["directory", "tree/main/examples/users/src"],
  "blob/:ref/*": ["file", `blob/main/${file}`],
  "blame/:ref/*": ["blame", `blame/main/${file}`],
  "commits/:ref": ["commits", "commits/main"],
  "commits/:ref/*": ["file-history", "commits/main/README.md"],
  "commit/:sha": ["commit", `commit/${dataset.branches.find(value => value.name === dataset.repo.defaultBranch)!.head}`],
  "branches/:branch/terminal": ["terminal", "branches/main/terminal"],
  branches: ["branches", "branches"], tags: ["tags", "tags"],
  issues: ["issues", "issues"], "issues/new": ["new-issue", "issues/new"], "issues/:n": ["issue", "issues/31"],
  pulls: ["pulls", "pulls"], "pull/:n": ["pull", `pull/${pull}`],
  "pull/:n/commits": ["pull-commits", `pull/${pull}/commits`],
  "pull/:n/checks": ["pull-checks", `pull/${pull}/checks`],
  "pull/:n/files": ["pull-files", `pull/${pull}/files`],
  stack: ["stack", "stack"], runs: ["runs", "runs"], "runs/:id": ["run", "runs/run-convert-golden-eval"],
  approvals: ["approvals", "approvals"], flows: ["flows", "flows"], "flows/:name": ["flow", "flows/convert-golden"], agents: ["agents", "agents"],
  evals: ["evals", "evals"], "evals/:suite": ["golden-set", "evals/convert-golden"],
  wiki: ["wiki", "wiki"], "wiki/:page": ["wiki-page", "wiki/Golden-set"],
  docs: ["docs", "docs"], "docs/*": ["docs-page", `docs/${docs}`],
  releases: ["releases", "releases"], "releases/tag/:tag": ["release", `releases/tag/${encodeURIComponent(dataset.releases[0]!.tag)}`],
  settings: ["settings", "settings"], "settings/:section": ["models", "settings/models"],
  search: ["search", "search?q=Users"]
}

const screen = (id: string, path: string, label: string, overrides = ""): Screen => {
  const [pathname, raw = ""] = path.split("?")
  const query = new URLSearchParams("as=in&role=member&landing=install&host=hosted&hosted=up&converter=off&guest=off&model=connected&net=ok&data=full")
  new URLSearchParams(raw).forEach((value, key) => query.set(key, value))
  new URLSearchParams(overrides).forEach((value, key) => query.set(key, value))
  return { id: `effeck-site-${id}`, site: "effeck-site", route: `${base}${pathname ? `/${pathname}` : ""}?${query}`, label,
    ...(query.get("net") === "slow" ? { wait: 100 } : {}) }
}

const readStates = (id: string, path: string, readerDenied = false): Screen[] => [
  screen(`${id}-loading`, path, "Loading", "net=slow"),
  screen(`${id}-error`, path, "Read failed · Retry", "net=error"),
  screen(`${id}-empty`, path, "Empty", "data=empty"),
  screen(`${id}-signed-out`, path, "Read signed out", "as=out"),
  screen(`${id}-${readerDenied ? "reader-denied" : "reader"}`, path, "Read as a reader", "role=reader")
]

const story: Record<string, Screen[]> = {
  "": readStates("home", ""),
  "blob/:ref/*": [screen("file-diagnostic", "blob/main/typescript/effeck/lsp-fixture/src/old-await.effeck", "VibeLang compiler diagnostic")],
  issues: [screen("fixed-by-agents", "issues?q=is:fixed-by-agents", "Fixed by agents · landed fix"), ...readStates("fixed-by-agents", "issues?q=is:fixed-by-agents", true)],
  docs: readStates("docs", "docs", true),
  "issues/:n": [
    ...[32, 33, 34].map(n => screen(`receipt-${n}`, `issues/${n}`, `Factory receipt · #${n}`)),
    screen("implement-held", "issues/50?act=implement", "Implement · hosted held"),
    screen("implement-denied", "issues/50?act=implement", "Implement · members only", "role=reader&landing=open")
  ],
  "issues/new": [screen("new-issue-signed-out", "issues/new", "Sign in to report an issue", "as=out")],
  runs: ["convert-golden", "docs-sync", "implement-issue", "release"].map(flow => screen(`runs-${flow}`, `runs?flow=${flow}`, `Runs · ${flow}`)),
  "runs/:id": [
    screen("run-docs-examples", "runs/run-docs-examples-eval", "Docs compile result"),
    screen("run-release", `runs/${dataset.runs.find(value => value.flow === "release" && value.state === "waiting")!.id}`, "Release · waiting for a person")
  ],
  evals: readStates("evals", "evals"),
  "evals/:suite": [
    ...readStates("golden-set", "evals/convert-golden"),
    ...(dataset.evals?.[0]?.cases ?? []).map(entry => screen(`golden-case-${entry.id}`, `evals/convert-golden?case=${entry.id}`, `Golden case · ${entry.title}`)),
    screen("docs-examples-compile", "evals/docs-examples-compile", "Docs examples compile"),
    screen("eval-held", "evals/convert-golden?act=run", "Model gate not wired · expected-output command"),
    screen("eval-denied", "evals/convert-golden?act=run", "Run eval · members only", "role=reader"),
    screen("eval-signin", "evals/convert-golden?act=run", "Sign in to run eval", "as=out")
  ],
  "docs/*": [
    ...readStates("docs-page", `docs/${docs}`),
    screen("docs-hover-find", `docs/${docs}?hover=find`, "Docs hover · Effect.Effect<User, UserNotFound, Users>"),
    screen("docs-hover-signed-out", `docs/${docs}?hover=find`, "Docs hover · signed out", "as=out"),
    ...dataset.docs.slice(1).map(page => screen(`docs-${page.slug.split("/").at(-1)}`, `docs/${page.slug}`, page.title))
  ],
  settings: [screen("settings-denied", "settings", "Settings require membership", "role=reader"), screen("settings-signin", "settings", "Sign in to open settings", "as=out")],
  "settings/:section": [screen("models-held", "settings/models", "Hosted model connections held")]
}

setRoutes([
  { pattern: "__screens", name: "Review index", render: () => <ScreensPage />, screens: [{ id: "effeck-site-all-screens", route: "__screens", label: "All screens", site: "effeck-site" }] },
  ...frontRoutes.filter(route => route.pattern.startsWith("effeck.dev") || sharedSmithersPatterns.has(route.pattern)).map(route => ({
    ...route,
    screens: route.screens.map(value => ({ ...value, id: `effeck-site-${value.id}`, site: "effeck-site" as const,
      route: value.route.replaceAll("maya%2Ftinyhttp", "effeck%2Feffeck").replaceAll("smithersai%2Fsmithers", "effeck%2Feffeck") }))
  })),
  ...repoRoutes.map(route => {
    const suffix = route.pattern.replace(/^smithers\.sh\/:owner\/:repo\/?/, "")
    const sample = concrete[suffix]
    if (!sample) throw new Error(`VibeLang site needs a concrete screen for ${route.pattern}`)
    return { ...route,
      render: suffix === "evals/:suite" ? (context: RouteContext) => <div className="repo-hovers-eval-details">{route.render(context)}</div> : route.render,
      screens: [screen(sample[0], sample[1], route.name), ...(story[suffix] ?? [])] }
  })
])
;(window as unknown as { __SITE__: unknown }).__SITE__ = {
  site: SITE, routes: allRoutes().map(route => route.pattern), screens: screensFor(SITE),
  resolve: (route: string) => resolveRoute(route)?.route.pattern ?? null
}
createRoot(document.getElementById("root")!).render(<MockProvider><Shell /></MockProvider>)
