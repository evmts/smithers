/** Pure contracts and scoring math; no browser, model, or workspace-package imports. */
export interface ViewSpec {
  id: string
  view: string
  patterns: string[]
  purpose: string
  primary: string
  /** False when the primary is opening an item from a list: the view has no solid button (spec principle 3, PM d-iez026). */
  solid?: boolean
  powers: string
  anatomy: string
  readyIds: string[]
  deniedIds: string[]
  screenIds?: string[]
  held: boolean
  noActions?: boolean
  declaration?: { repo?: string; patterns: string[] }
  composer?: boolean
  siteOnly?: boolean
  query?: Record<string, string>
}
export interface Screen { id: string; route: string; label?: string; wait?: number }
export interface SitePayload { site?: string; screens: Screen[]; routes: string[] }
export type State = "ready" | "loading" | "error" | "empty" | "signed-out" | "reader-denied" | "held"
export interface ButtonEvidence {
  name: string
  title: string
  action: boolean
  primary: boolean
  disabled?: boolean
  tag?: string
  className?: string
  area?: string
}
export interface ContentEvidence {
  text: string
  headings: string[]
  buttons: ButtonEvidence[]
  links: Array<{ name: string; href: string; title: string; area?: string; current?: string }>
  primary: ButtonEvidence | null
  primaries: ButtonEvidence[]
}
export interface PageEvidence extends ContentEvidence {
  /** Judge-only partitions; full top-level evidence remains available to deterministic scorers. */
  judgeParts?: {
    content: ContentEvidence
    ask: ContentEvidence & { docked: boolean; suggestions: number }
    frame: Array<ContentEvidence & { selector: string; bounds: { x: number; y: number; width: number; height: number } }>
  }
  layout?: { viewport: number; scrollWidth: number; tabs: string[]; regions: Array<{ selector: string; visible: boolean; x: number; y: number; width: number; height: number; position: string }> }
}
export interface Observation extends PageEvidence {
  id: string
  route: string
  width: number
  theme: "light" | "dark"
  resolved: string | null
  problems: string[]
}
export interface CaseOutput {
  view: string
  dist: string
  states: Record<string, string[]>
  requiredStates: State[]
  routeProblems: string[]
  ready: Observation | null
  screens: Observation[]
  infrastructureError?: string
  notApplicable?: string
}
export interface Score { score: number; reason: string }
export interface Unscorable { inconclusive: string }
export type Assessment = Score | Unscorable

/** Mirrors core/router.tsx, including a trailing wildcard matching no further segments. */
export const matchesPattern = (pattern: string, route: string): boolean => {
  const have = route.split("?")[0]!.replace(/\/+$/, "").split("/")
  const want = pattern.replace(/\/+$/, "").split("/")
  for (let i = 0; i < want.length; i++) {
    if (want[i] === "*") return true
    if (!have[i] || (!want[i]!.startsWith(":") && have[i] !== want[i])) return false
  }
  return have.length === want.length
}
const includes = (id: string, parts: string[]) => parts.some(part => id.toLowerCase().includes(part.toLowerCase()))
/** Product cases require the declared route AND screens for that repository. A
 * generic /evals route alone does not declare either product's customization. */
const queryMatches = (view: ViewSpec, screen: Screen): boolean => Object.entries(view.query ?? {}).every(([key, value]) =>
  new URLSearchParams(screen.route.split("?")[1]).get(key) === value)

export const appliesToSite = (view: ViewSpec, site: SitePayload): boolean =>
  !(view.siteOnly && (!site.site || site.site === "default")) && (!view.declaration ||
  view.declaration.patterns.every(pattern => site.routes.some(route => sameShape(route, pattern))) &&
  site.screens.some(screen => queryMatches(view, screen) && (!view.declaration!.repo || screen.route.split("?")[0]!.startsWith(`smithers.sh/${view.declaration!.repo}/`)) &&
    view.declaration!.patterns.some(pattern => matchesPattern(pattern, screen.route))))

export const viewsForSite = (views: ViewSpec[], site: SitePayload): ViewSpec[] => views.filter(view => appliesToSite(view, site))

/** Cuts are negative expectations, never required cases or state evidence. */
const removedEffectScreen = (screen: Screen): boolean => {
  const path = screen.route.split("?")[0]!
  if (path !== "smithers.sh/Effect-TS/effect" && !path.startsWith("smithers.sh/Effect-TS/effect/")) return false
  const query = new URLSearchParams(screen.route.split("?")[1])
  return /ownership|run[-_ ]affected|check[-_ ](?:this[-_ ])?package|package[-_ ]check|generate[-_ ]docs/i.test(`${screen.id} ${screen.label ?? ""} ${screen.route.split("?")[0]}`) ||
    query.has("check") || /^(?:check|package\.check|docs\.generate|run\.affected)$/.test(query.get("act") ?? "")
}
export const registrationProblemsFor = (site: SitePayload): string[] => site.screens.filter(removedEffectScreen).map(screen => `removed Effect feature screen ${screen.id}: ${screen.route}`)

export const screensFor = (view: ViewSpec, site: SitePayload): Screen[] => {
  if (!appliesToSite(view, site)) return []
  const candidates = site.screens.filter(screen =>
    !removedEffectScreen(screen) && queryMatches(view, screen) &&
    view.patterns.some(pattern => matchesPattern(pattern, screen.route)) &&
    (!view.declaration?.repo || screen.route.split("?")[0] === `smithers.sh/${view.declaration.repo}` ||
      screen.route.startsWith(`smithers.sh/${view.declaration.repo}/`)))
  // Ask shares the home route. Prefer explicit composer stories (query first,
  // then legacy ID substrings); product entries without stories use docked home.
  if (view.composer) {
    const stories = candidates.filter(screen => new URLSearchParams(screen.route.split("?")[1]).has("ask") ||
      includes(screen.id, view.screenIds ?? ["ask"]))
    return stories.length ? stories : candidates
  }
  return candidates
}
export const requirementsFor = (view: ViewSpec): Record<State, string[]> => ({
  ready: view.readyIds,
  loading: ["loading"],
  error: ["error"],
  empty: ["empty"],
  "signed-out": ["signed-out", "signin-wall", "sign-in"],
  "reader-denied": ["denied", ...view.deniedIds],
  held: ["held", "install", "hosted-paused"]
})
/** Shared state rendering is proven on default; site-owned views keep the full contract. */
export const requiredStatesFor = (view: ViewSpec, site?: SitePayload): State[] => {
  if (site?.site && site.site !== "default" && !view.declaration) {
    return ["ready", ...(screensFor(view, site).some(screen => new URLSearchParams(screen.route.split("?")[1]).get("as") === "out") ? ["signed-out" as const] : [])]
  }
  return ["ready", "loading", "error", "empty", "signed-out", "reader-denied", ...(view.held ? ["held" as const] : [])]
}

/** Route flags establish state; IDs only distinguish denial from public reader access. */
export const statesFor = (view: ViewSpec, site: SitePayload): Record<string, string[]> => {
  const candidates = screensFor(view, site)
  return Object.fromEntries(requiredStatesFor(view).map(state => [state, candidates.filter(screen => {
    const query = new URLSearchParams(screen.route.split("?")[1] ?? "")
    const normal = query.get("net") !== "slow" && query.get("net") !== "error" && query.get("data") !== "empty"
    switch (state) {
      case "ready": return normal && query.get("as") === "in" && query.get("role") !== "reader" && !includes(screen.id, ["held", "hosted-paused", "denied", "signin"]) && query.get("hosted") !== "paused"
      case "loading": return query.get("net") === "slow"
      case "error": return query.get("net") === "error"
      case "empty": return query.get("data") === "empty"
      case "signed-out": return query.get("as") === "out"
      case "reader-denied": return query.get("as") === "in" && query.get("role") === "reader" && normal &&
        (includes(screen.id, ["denied", ...view.deniedIds]) || query.has("act") ||
          (view.id === "settings" || view.id === "terminal") && includes(screen.id, ["reader"]))
      case "held": return normal && (includes(screen.id, ["held", "install", "hosted-paused"]) || query.has("act") || query.get("hosted") === "paused") && ((query.get("landing") === "install" && query.get("host") !== "install") || query.get("hosted") === "paused")
    }
  }).map(screen => screen.id)]))
}

const shape = (pattern: string) => pattern.replace(/:[^/]+/g, ":param")
const sameShape = (left: string, right: string) => shape(left) === shape(right)

/** Require declared route shapes AND at least one screen resolving to each declared route. */
export const routeProblemsFor = (view: ViewSpec, site: SitePayload, observations: Observation[]): string[] => {
  // Scope cases observe many shared tabs, but only own their extension routes.
  // crawl.mjs covers shared routes globally, across all repositories/screens;
  // requiring each again within the Effect subset invented six false failures.
  const requiredPatterns = view.declaration?.patterns ?? view.patterns
  const declared = site.routes.filter(pattern => requiredPatterns.some(found => sameShape(found, pattern)))
  const missing = requiredPatterns.filter(pattern => !declared.some(found => sameShape(found, pattern)))
  return [
    ...missing.map(pattern => `missing route ${pattern}`),
    ...declared.filter(pattern => !observations.some(item => item.resolved === pattern)).map(pattern => `route ${pattern} has no resolving screen`),
    ...(observations.length === 0 ? ["case has no screens to audit"] : []),
    ...(view.id === "code-home" ? registrationProblemsFor(site) : [])
  ]
}
/** Infrastructure evidence must never become a quality score or reach a judge. */
export const unscorableReason = (output: CaseOutput): string | undefined => {
  if (output.notApplicable) return `Not applicable: ${output.notApplicable}`
  if (output.infrastructureError) return output.infrastructureError
  const failures = [...output.routeProblems, ...output.screens.flatMap(screen => screen.problems.map(problem => `${screen.id}: ${problem}`))]
    .filter(problem => /screen inspection failed|browser (?:launch |navigation )?failed|navigation failed/i.test(problem))
  if (failures.length) return failures.join("; ")
  if (!output.screens.length) return "No screen inspection evidence"
  return undefined
}
export const crawlClean = (output: CaseOutput): Assessment => {
  const reason = unscorableReason(output)
  if (reason) return { inconclusive: reason }
  const problems = output.routeProblems.length + output.screens.reduce((count, screen) => count + new Set(screen.problems).size, 0)
  // Count occurrences as crawl.mjs does; group diagnostics by the actual finding
  // so six viewport/theme repeats do not hide the next actionable problem.
  const findings = new Map<string, string[]>()
  for (const problem of output.routeProblems) findings.set(problem, ["routes/registration"])
  for (const screen of output.screens) for (const problem of new Set(screen.problems)) {
    const locations = findings.get(problem) ?? []
    locations.push(`${screen.id} (${screen.width}/${screen.theme})`)
    findings.set(problem, locations)
  }
  const details = [...findings].slice(0, 10).map(([problem, locations]) => `${problem} [${locations.slice(0, 3).join(", ")}${locations.length > 3 ? `; +${locations.length - 3} observations` : ""}]`)
  return { score: Math.max(0, 1 - problems / 20), reason: `${problems} crawl problems across ${output.screens.length} screen/viewport/theme observations${details.length ? `; ${details.join("; ")}${findings.size > 10 ? `; +${findings.size - 10} more distinct problems` : ""}` : ""}` }
}
export const statesCovered = (output: CaseOutput): Assessment => {
  const reason = unscorableReason(output)
  if (reason) return { inconclusive: reason }
  const missing = output.requiredStates.filter(state => !output.states[state]?.length)
  return {
    score: output.requiredStates.length === 0 ? 0 : (output.requiredStates.length - missing.length) / output.requiredStates.length,
    reason: missing.length ? `Missing states: ${missing.join(", ")}` : `All ${output.requiredStates.length} required states have screens`
  }
}
export const hasSlashDoor = (title: string): boolean => /(?:^|\s)\/[a-z][a-z0-9_.-]*(?=$|\s)/i.test(title.trim())
export const threeDoors = (output: CaseOutput, view?: ViewSpec): Assessment => {
  const reason = unscorableReason(output)
  if (reason) return { inconclusive: reason }
  // Each visible occurrence counts. Navigation links are collected for the rubric,
  // while buttons with data-inert explicitly opt out of being actions.
  const actions = output.screens.flatMap(screen => screen.buttons.filter(button => button.action))
  if (!actions.length && !view?.noActions) return { inconclusive: "No action buttons observed; the view spec does not declare an action-free view" }
  const missing = actions.filter(button => !hasSlashDoor(button.title))
  return {
    score: actions.length === 0 ? 1 : (actions.length - missing.length) / actions.length,
    reason: `${actions.length - missing.length}/${actions.length} action buttons have slash titles${missing.length ? `; missing: ${[...new Set(missing.map(button => button.name || "(unnamed)"))].join(", ")}` : ""}`
  }
}
