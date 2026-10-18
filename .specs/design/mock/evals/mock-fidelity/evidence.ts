import type { CaseOutput, Observation } from "./scoring.ts"

/** ~48k prose tokens at 4 chars/token, leaving ample prompt/output headroom.
 * Char/token ratios vary (notably code); context errors still halve this once. */
export const judgeLimits = { totalChars: 192_000, observationChars: 24_000, textChars: 12_000 }
export interface EvidenceDrop {
  id: string; width: number; theme: string
  reason: "duplicate" | "truncated" | "budget"
  chars: number
  fields?: string[]
}
export interface EvidenceAudit {
  case: string; dist: string; budget: number; original: number; included: number; serializedChars: number; originalChars: number; dropped: EvidenceDrop[]
}

/** Keep structured JSON valid while bounding long labels and repeated controls. */
const clip = (value: unknown, stringLimit: number, arrayLimit: number): unknown => {
  if (typeof value === "string") return value.slice(0, stringLimit)
  if (Array.isArray(value)) return value.slice(0, arrayLimit).map(item => clip(item, stringLimit, arrayLimit))
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clip(item, stringLimit, arrayLimit)]))
  return value
}
const boundedObservation = (screen: Record<string, unknown> & { text: string }) => {
  const original = JSON.stringify(screen).length
  let arrayLimit = 100
  let stringLimit = 1_000
  let textLimit = judgeLimits.textChars
  let result: Record<string, unknown>
  do {
    const body = clip({ ...screen, text: undefined }, stringLimit, arrayLimit) as Record<string, unknown>
    result = {
      ...body,
      text: screen.text.slice(0, textLimit),
      textTruncated: screen.text.length > textLimit,
      evidenceTruncated: JSON.stringify({ ...screen, text: undefined }) !== JSON.stringify(body) || screen.text.length > textLimit
    }
    arrayLimit = Math.max(1, Math.floor(arrayLimit / 2))
    stringLimit = Math.max(1, Math.floor(stringLimit / 2))
    textLimit = Math.max(1, Math.floor(textLimit / 2))
  } while (JSON.stringify(result).length > judgeLimits.observationChars)
  const fields = Object.keys(screen).filter(key => JSON.stringify(screen[key]) !== JSON.stringify(result[key]))
  return { result, fields, removed: Math.max(0, original - JSON.stringify({ ...result, textTruncated: undefined, evidenceTruncated: undefined }).length) }
}

export const buildJudgeEvidence = (output: CaseOutput, budget = judgeLimits.totalChars) => {
  const dropped: EvidenceDrop[] = []
  const audit: EvidenceAudit = { case: output.view, dist: output.dist, budget, original: output.screens.length, included: 0, serializedChars: 0, originalChars: JSON.stringify(output).length, dropped }
  const ready = output.ready
  const rank = (screen: Observation) => screen.theme === "light" && screen.width === 1440 &&
    (ready ? screen.id === ready.id && screen.route === ready.route : output.states.ready?.includes(screen.id)) ? 0 :
    screen.theme === "light" && screen.width === 390 ? 1 : 2
  const ordered = [...output.screens]
  if (ready && !ordered.some(screen => JSON.stringify(screen) === JSON.stringify(ready))) ordered.push(ready)
  ordered.sort((a, b) => rank(a) - rank(b) || (a.theme === "light" ? 0 : 1) - (b.theme === "light" ? 0 : 1))
  const seen = new Set<string>()
  const frameIds = new Map<string, string>()
  const framePool: Array<{ id: string; content: Record<string, unknown>; viewports: Array<{ width: number; theme: string }> }> = []
  const prepared = ordered.map(screen => {
    const { judgeParts, ...full } = screen
    if (!judgeParts) return full // Legacy observations cannot be safely partitioned by text matching.
    const frame = judgeParts.frame.map(part => {
      const key = JSON.stringify(part)
      let id = frameIds.get(key)
      if (!id) {
        id = `frame-${framePool.length + 1}`
        frameIds.set(key, id)
        framePool.push({ id, content: boundedObservation({ ...part }).result, viewports: [] })
      }
      const entry = framePool.find(item => item.id === id)!
      if (!entry.viewports.some(item => item.width === screen.width && item.theme === screen.theme)) entry.viewports.push({ width: screen.width, theme: screen.theme })
      return id
    })
    const { docked, suggestions, ...ask } = judgeParts.ask
    return { ...full, ...(output.view === "ask" ? ask : judgeParts.content), frame,
      // Tab labels/controls live in the shared frame, including viewport variants.
      ...(full.layout ? { layout: { ...full.layout, tabs: undefined } } : {}),
      ...(docked && output.view !== "ask" ? { ask: `Ask docked; ${suggestions} suggestions.` } : {}) }
  })
  const evidence = {
    ready: ready ? { id: ready.id, width: ready.width, theme: ready.theme } : null,
    // Counts preserve registration context without repeating every ID.
    states: Object.fromEntries(Object.entries(output.states).map(([state, ids]) => [state, ids.length])),
    requiredStates: output.requiredStates,
    routeProblems: clip(output.routeProblems, 400, 20),
    frames: [] as typeof framePool,
    screens: [] as Record<string, unknown>[],
    omissions: { duplicate: 0, truncated: 0, budget: 0 }
  }
  for (const screen of prepared) {
    const { theme: _theme, ...identity } = screen
    const key = JSON.stringify(identity)
    const location = { id: screen.id, width: screen.width, theme: screen.theme }
    if (seen.has(key)) {
      dropped.push({ ...location, reason: "duplicate", chars: JSON.stringify(screen).length })
      evidence.omissions.duplicate++
      continue
    }
    seen.add(key)
    const { result, removed, fields } = boundedObservation({ ...screen })
    evidence.screens.push(result)
    const previousFrames = evidence.frames
    const needed = new Set(evidence.screens.flatMap(item => (item.frame ?? []) as string[]))
    evidence.frames = framePool.filter(item => needed.has(item.id))
    // Reserve room for final omission counters; never cut serialized JSON.
    if (JSON.stringify(evidence).length + 64 > budget) {
      evidence.screens.pop()
      evidence.frames = previousFrames
      dropped.push({ ...location, reason: "budget", chars: JSON.stringify(screen).length })
      evidence.omissions.budget++
    } else if (removed) {
      dropped.push({ ...location, reason: "truncated", chars: removed, fields })
      evidence.omissions.truncated++
    }
  }
  audit.included = evidence.screens.length
  audit.serializedChars = JSON.stringify(evidence).length
  return { evidence, audit }
}
