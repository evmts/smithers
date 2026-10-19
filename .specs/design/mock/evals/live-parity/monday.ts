import { readFileSync } from "node:fs"
import type { ViewSpec } from "../mock-fidelity/scoring.ts"
import type { ParityOutput, Structure } from "./model.ts"
import { routes } from "./routes.ts"

interface MondayPolicy {
  decision: string; date: string; launchDate: string; activeIncrement: number
  cut: { views: string[]; tabs: string[]; headerPieces: string[]; sidebarBlocks: string[] }
  tabs: { label: string; increment: number; declaredOnly?: boolean }[]
  viewAliases: Record<string, string>
  conditionalViews: Record<string, { increment: number; declaredTab: string }>
  keptViews: Record<string, { increment: number; primary?: string; powers: string }>
}
export const monday = JSON.parse(readFileSync(new URL("./monday-cuts.json", import.meta.url), "utf8")) as MondayPolicy
export const normalizeLabel = (value: string) => value.replace(/\s*[\d,]+\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase()
export const scopeFor = (view: string) => monday.keptViews[monday.viewAliases[view] ?? view]
export const incrementFor = (view: string): number | undefined => scopeFor(view)?.increment ?? monday.conditionalViews[view]?.increment
export const isCutView = (view: string, repo?: string) => monday.cut.views.includes(view) || Boolean(repo && monday.conditionalViews[view] && !routes.repositories?.[repo]?.declaredTabs?.includes(monday.conditionalViews[view]!.declaredTab))
export const cutStory = (route: string) => {
  const path = new URL(`https://${route}`).pathname.replace(/^\/maya\/tinyhttp\/?/, "")
  const subject = path.split("/")[0]!
  return monday.cut.views.includes(subject) || (monday.cut.views.includes("terminal") && /(?:^|\/)terminal(?:\/|$)/.test(path))
}
export const cutOutput = (view: ViewSpec, settings: Pick<ParityOutput, "dist" | "liveBase" | "liveRepo" | "runDir">): ParityOutput | undefined => isCutView(view.id, settings.liveRepo) ? {
  ...settings, view: view.id, spec: view, outcome: "cut", pairs: [], unobservable: [],
  cutReason: `${monday.decision} (${monday.date}): hidden for Monday; route absence is not browser-verified`
} : undefined
export const cutTab = (label: string, repo: string) => {
  const name = normalizeLabel(label)
  if (monday.cut.tabs.some(value => normalizeLabel(value) === name)) return true
  const rule = monday.tabs.find(value => normalizeLabel(value.label) === name)
  return Boolean(rule && (rule.increment > monday.activeIncrement || (rule.declaredOnly && !routes.repositories?.[repo]?.declaredTabs?.some(value => normalizeLabel(value) === name))))
}
// An aside may contain several headed blocks (e.g. "Releases / Sync").
export const sidebarParts = (value: string) => value.split(/\s+\/\s+/).map(normalizeLabel)
export const cutSidebar = (value: string) => monday.cut.sidebarBlocks.some(label => normalizeLabel(label) === normalizeLabel(value))
export const mondayStructure = (structure: Structure, repo: string): Structure => {
  const tabs = structure.tabs.filter(label => !cutTab(label, repo))
  for (const rule of monday.tabs.filter(rule => rule.declaredOnly && !cutTab(rule.label, repo))) {
    if (tabs.some(label => normalizeLabel(label) === normalizeLabel(rule.label))) continue
    const settings = tabs.findIndex(label => normalizeLabel(label) === "settings")
    tabs.splice(settings < 0 ? tabs.length : settings, 0, rule.label)
  }
  return {
  tabs,
  header: Object.fromEntries(Object.entries(structure.header).filter(([key]) => !monday.cut.headerPieces.includes(key))) as Structure["header"],
  sidebars: [...new Set(structure.sidebars.flatMap(sidebarParts).filter(label => !cutSidebar(label)))]
  }
}
export const mondaySpec = (spec: ViewSpec): ViewSpec => {
  const scope = scopeFor(spec.id)
  return { ...spec, ...(scope ? { powers: scope.powers, ...(scope.primary ? { primary: scope.primary } : {}) } : {}),
    anatomy: `Monday ${monday.decision}: GitHub-shaped maximized view and docked Ask; tabs Code, Issues, Pull requests, then Flows and Settings in increment 2. Docs only if live declares it. Waiting on you and Releases sidebar are cut. ${scope?.powers ?? ""}` }
}
