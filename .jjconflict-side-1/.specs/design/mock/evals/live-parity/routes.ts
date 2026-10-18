import { readFileSync } from "node:fs"
import { screensFor, statesFor, viewsForSite, type Screen, type SitePayload, type ViewSpec } from "../mock-fidelity/scoring.ts"
export interface RouteMap {
  defaultRepo?: string
  repositories?: Record<string, { paths?: Record<string, string | null>; declaredTabs?: string[] }>
  paths: Record<string, string | null>
  views?: Record<string, string | null>
  notes?: Record<string, string>
}
export const routes = JSON.parse(readFileSync(new URL("./live-routes.json", import.meta.url), "utf8")) as RouteMap
export const stageOneSite = (site: SitePayload): SitePayload => ({ ...site, site: "default", screens: site.screens.filter(s => /^smithers\.sh\/maya\/tinyhttp(?:\/|\?|$)/.test(s.route)) })
export const stageOneViews = (views: ViewSpec[], site: SitePayload) => viewsForSite(views, stageOneSite(site))
export const storiesFor = (view: ViewSpec, site: SitePayload, auth: boolean) => {
  site = stageOneSite(site)
  const states = statesFor(view, site)
  return screensFor(view, site).flatMap(screen => {
    const state = states["signed-out"]?.includes(screen.id) ? "signed-out" : states.ready?.includes(screen.id) ? "ready" : undefined
    return state && (auth || state === "signed-out") ? [{ ...screen, state: state as "ready" | "signed-out" }] : []
  })
}
export type Mapped = { outcome: "mapped"; url: string } | { outcome: "not deployed"; reason: string }
/** Only genuine URL queries survive; fixture and interaction flags never reach live. */
export const mapRoute = (screen: Screen, view: string, base: string, repo: string, map: RouteMap = routes): Mapped => {
  const baseUrl = new URL(base)
  if (!/^https?:$/.test(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new Error("LIVE_BASE must be an HTTP(S) base URL without credentials, query or hash")
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.split("/").some(s => s === "." || s === "..")) throw new Error("LIVE_REPO must be owner/repo")
  const source = new URL(`https://${screen.route}`)
  if (source.hostname !== "smithers.sh" || !/^\/maya\/tinyhttp(?:\/|$)/.test(source.pathname)) return { outcome: "not deployed", reason: "Outside stage 1 repository" }
  let path = source.pathname.replace(/^\/maya\/tinyhttp/, "") || "/"
  const viewOverride = map.views?.[view]
  if (viewOverride === null) return { outcome: "not deployed", reason: map.notes?.[view] ?? "No live equivalent configured for this view" }
  // Interaction stories require their own live route; dropping a dialog flag
  // cannot turn the base page into evidence of a working dialog.
  if (["act", "dialog", "ask", "todo", "preview", "evidence"].some(key => source.searchParams.has(key))) return { outcome: "not deployed", reason: "Mock interaction has no GET-only live route" }
  const paths = { ...map.paths, ...map.repositories?.[repo]?.paths }
  const match = Object.keys(paths).sort((a, b) => b.length - a.length).find(key => key.endsWith("/*") ? path.startsWith(key.slice(0, -1)) : path === key)
  if (match) {
    const target = paths[match]
    if (target === null) return { outcome: "not deployed", reason: `No live equivalent configured for ${path}` }
    path = match.endsWith("/*") ? target! + path.slice(match.length - 1) : target!
  } else if (/^\/(?:tree|blob|blame|commit|commits|pull|issues|runs|flows|wiki|branches|releases\/tag|docs)\/.+/.test(path) && !/^\/(?:issues\/new|commits\/main|tree\/main)$/.test(path)) {
    return { outcome: "not deployed", reason: `Add a fixture equivalent for ${path} to live-routes.json` }
  }
  if (viewOverride) path = viewOverride
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("?") || path.includes("#") || path.split("/").some(s => decodeURIComponent(s) === "..")) throw new Error("Live route targets must be repository-relative paths without query/hash")
  const url = new URL(`${baseUrl.pathname.replace(/\/$/, "")}/${repo}${path === "/" ? "" : path}`, baseUrl.origin)
  for (const key of ["q", "page"]) for (const value of source.searchParams.getAll(key)) url.searchParams.append(key, value)
  return { outcome: "mapped", url: url.href }
}
