import { crawlClean, type Assessment, type CaseOutput, type Observation } from "../mock-fidelity/scoring.ts"
import { monday, cutTab, cutSidebar, sidebarParts, mondayStructure, normalizeLabel, scopeFor } from "./monday.ts"
import type { Capture, Pair, ParityOutput } from "./model.ts"
export const compared = (output: ParityOutput) => output.pairs.filter((p): p is Pair & { mock: Capture; live: Capture } => p.outcome === "compared" && Boolean(p.mock && p.live))
export const unavailable = (output: ParityOutput) => output.infrastructureError ?? (output.outcome !== "compared" ? `${output.outcome}: ${output.unobservable.join("; ")}` : compared(output).length ? undefined : "No comparable evidence")
export const caseEvidence = (output: ParityOutput, side: "mock" | "live"): CaseOutput => {
  const pairs = compared(output)
  const screens = pairs.map(pair => ({ ...pair[side], parityState: pair.state }))
  return { view: output.view, dist: side === "mock" ? output.dist : output.liveBase, screens, ready: screens.find(s => s.width === 1440) ?? null,
    states: Object.fromEntries(["ready", "signed-out"].map(state => [state, pairs.filter(p => p.state === state).map(p => p[side].id)])), requiredStates: [], routeProblems: [] }
}
export const liveClean = (output: ParityOutput): Assessment => {
  const reason = unavailable(output)
  return reason ? { inconclusive: reason } : crawlClean(caseEvidence(output, "live"))
}
export const labelClass = (label: string): string => {
  const text = label.toLowerCase().replace(/\s+/g, " ").trim()
  for (const [key, pattern] of Object.entries({ "sign-in": /sign in|log in/, retry: /retry|try again/, ask: /ask|send/, copy: /copy|permalink/, create: /new |create |add /, save: /save|update/, run: /run |start |execute/, edit: /edit/, open: /open |browse |view /, type: /type|command/ })) if (pattern.test(text)) return key
  return text
}
export const copyKeys = (text: string) => Object.entries({
  "signed-out": /sign in|log in/i, denied: /access denied|permission denied|not authorized|members only/i,
  error: /\bretry\b|try again/i, loading: /\bloading\b/i, empty: /no (?:issues|pull requests|runs|results|files|releases|branches|flows)|nothing here|no .* yet/i,
  "human-review": /your review is next/i, "checks-passed": /checks passed/i, "install-only": /install.only|open install instructions/i
}).filter(([, regex]) => regex.test(text)).map(([key]) => key).sort()
const stateCopy = (screen: Capture) => {
  // A removed sidebar's empty-state sentence cannot make the kept page empty.
  const text = screen.judgeParts?.content.text ?? screen.text
  const subjects = monday.cut.views.join("|")
  return copyKeys(text.replace(new RegExp(`\\bno (?:${subjects})\\b[^.!?\\n]*(?:[.!?]|$)`, "gi"), ""))
}
const tab = normalizeLabel
const primary = (screen: Observation, ask: boolean) => (ask ? screen.judgeParts?.ask : screen.judgeParts?.content)?.primaries ?? screen.primaries
/** List primaries are navigation, never invented solid Open buttons. */
const listActionPresent = (screen: Observation, view: string) => {
  const links = screen.judgeParts?.content.links ?? screen.links
  const patterns: Record<string, RegExp> = { blame: /\/commit\/[^/?#]+/, commits: /\/commit\/[^/?#]+/, branches: /\/tree\/[^/?#]+/, releases: /\/releases\/tag\/[^/?#]+/, search: /\/(?:blob|issues|pull|runs|wiki)\/[^/?#]+/ }
  return links.some(link => Boolean(link.name) && patterns[view]?.test(link.href))
}
/** Visible cuts remain negative expectations even if a judge overlooks them. */
export const visibleCuts = (output: ParityOutput): string[] => compared(output).flatMap(pair => {
  const prefix = `${pair.id} ${pair.width}: cut feature visible: `
  const live = pair.live, structure = live.structure
  const found = [
    ...(structure?.tabs ?? live.layout?.tabs ?? []).filter(label => cutTab(label, output.liveRepo)).map(label => `tab ${tab(label)}`),
    ...monday.cut.headerPieces.filter(key => structure?.header[key as keyof StructureHeader]).map(key => `header ${key}`),
    ...(structure?.sidebars ?? []).flatMap(sidebarParts).filter(cutSidebar).map(label => `sidebar ${label}`),
    ...live.links.filter(link => cutLink(link.href, output, live.finalUrl)).map(link => `link ${link.name || link.href}`)
  ]
  return [...new Set(found)].map(value => prefix + value)
})
type StructureHeader = NonNullable<Capture["structure"]>["header"]
export const cutLink = (href: string, output: Pick<ParityOutput, "liveBase" | "liveRepo">, pageUrl?: string) => {
  try {
    const base = new URL(output.liveBase)
    const repoPath = `${base.pathname.replace(/\/$/, "")}/${output.liveRepo}/`
    const target = new URL(href, pageUrl ?? new URL(repoPath, base).href)
    // README links to other repos or GitHub releases are repository content.
    if (target.origin !== base.origin || !target.pathname.startsWith(repoPath)) return false
    const path = target.pathname.slice(repoPath.length), subject = path.split("/")[0]!
    return monday.cut.views.includes(subject) || (monday.cut.views.includes("terminal") && /(?:^|\/)terminal(?:\/|$)/.test(path))
  } catch { return false }
}
export interface StructureResult { score?: number; inconclusive?: string; reason: string; gaps: string[]; cuts: string[]; checks: number; passed: number }
export const structureParity = (output: ParityOutput): StructureResult => {
  const failure = unavailable(output)
  if (failure) return { inconclusive: failure, reason: failure, gaps: [], cuts: [], checks: 0, passed: 0 }
  const gaps: string[] = [], cuts: string[] = []
  let checks = 0, passed = 0
  const check = (same: boolean, gap: string) => { checks++; if (same) passed++; else gaps.push(gap) }
  for (const pair of compared(output)) {
    const context = `${pair.id} ${pair.width}`
    const mock = pair.mock, live = pair.live
    const m = mock.structure, l = live.structure
    const base = m ?? { tabs: mock.layout?.tabs ?? [], header: { waiting: false, ask: false, sync: false }, sidebars: [] }
    const expected = mondayStructure(base, output.liveRepo)
    const mt = expected.tabs.map(tab), lt = (l?.tabs ?? live.layout?.tabs ?? []).map(tab)
    const cutTabs = lt.filter(label => cutTab(label, output.liveRepo))
    const cutMessage = (items: string[]) => items.length ? `; cut feature visible: ${items.join(", ")}` : ""
    check(JSON.stringify(mt) === JSON.stringify(lt), `${context}: tabs expected [${mt.join(", ")}], live [${lt.join(", ")}]${cutMessage(cutTabs)}`)
    for (const key of [...new Set(["waiting", "ask", "sync", ...monday.cut.headerPieces])] as (keyof StructureHeader)[]) {
      const isCut = monday.cut.headerPieces.includes(key)
      const wanted = isCut ? false : Boolean(base.header[key])
      check(wanted === Boolean(l?.header[key]), `${context}: header ${key} expected ${wanted}, live ${Boolean(l?.header[key])}${isCut && l?.header[key] ? "; cut feature visible" : ""}`)
      if (isCut && !l?.header[key]) cuts.push(`${context}: header ${key}: cut`)
    }
    const optionalSync = (label: string) => output.view === "code-home" && /^(?:github )?sync(?: state)?$/.test(label)
    const ms = expected.sidebars.filter(label => !optionalSync(label)).sort(), ls = [...new Set((l?.sidebars ?? []).flatMap(sidebarParts))].filter(label => !optionalSync(label)).sort()
    check(JSON.stringify(ms) === JSON.stringify(ls), `${context}: sidebar regions expected [${ms}], live [${ls}]${cutMessage(ls.filter(cutSidebar))}`)
    for (const label of monday.cut.tabs) if (!lt.includes(tab(label))) cuts.push(`${context}: tab ${label}: cut`)
    for (const label of monday.cut.sidebarBlocks) if (!ls.includes(tab(label))) cuts.push(`${context}: sidebar ${label}: cut`)
    const mp = primary(mock, output.view === "ask"), lp = primary(live, output.view === "ask")
    const list = output.spec.solid === false
    if (!(scopeFor(output.view)?.primary && pair.state === "ready")) {
      check(list ? listActionPresent(mock, output.view) === listActionPresent(live, output.view) : mp.length === lp.length,
      list ? `${context}: list primary presence expected ${listActionPresent(mock, output.view)}, live ${listActionPresent(live, output.view)}` : `${context}: expected ${mp.length} primaries, live ${lp.length}`)
      const mc = mp.map(p => labelClass(p.name)), lc = lp.map(p => labelClass(p.name))
      check(JSON.stringify(mc) === JSON.stringify(lc), `${context}: primary label classes expected [${mc}], live [${lc}]`)
    }
    const mk = stateCopy(mock), lk = stateCopy(live)
    check(JSON.stringify(mk) === JSON.stringify(lk), `${context}: state-copy keys expected [${mk}], live [${lk}]`)
  }
  // A cut link is a gap even when it is outside a nav/header/sidebar region.
  for (const gap of visibleCuts(output).filter(gap => gap.includes("cut feature visible: link "))) check(false, gap)
  return { score: passed / checks, reason: `${passed}/${checks} structure checks match${gaps.length ? `; ${gaps.slice(0, 8).join("; ")}` : ""}`, gaps, cuts, checks, passed }
}
