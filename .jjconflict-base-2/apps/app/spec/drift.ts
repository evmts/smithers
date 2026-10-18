import type { RunResult, State } from "./results"
import type { IssueOwnerReader } from "./issueOwner"
import { readRoutes } from "./routes/reads"
import { decode, unknownFieldsOf } from "./wire"

export interface DriftJourney { readonly id: string; readonly owner?: string; readonly capabilities?: readonly string[]; readonly stale?: { readonly by: string; readonly reason: string } }
export interface DriftInput {
  readonly runs: readonly RunResult[]
  readonly journeys: readonly DriftJourney[]
  readonly previous?: readonly { readonly id: string; readonly state: State; readonly wasShipped?: boolean }[]
  readonly ahead: Readonly<Record<string, string | undefined>>
  readonly capabilities: readonly string[]
  readonly productionCapabilities?: readonly string[]
  readonly captures?: readonly { readonly schema: string; readonly response: unknown; readonly unknownFields?: readonly unknown[] }[]
  readonly builtAt: string
  readonly now?: number
  readonly aheadMaxDays: number
}
const outcome = (run: RunResult | undefined): "pass" | "fail" | "unknown" => {
  if (!run || run.reason && run.reason !== "Pair mock/live evidence in drift before assigning shipped or ahead" || !run.steps.length || run.steps.some(step => step.status === "skipped")) return "unknown"
  const assertions = run.steps.flatMap(step => step.assertions).filter(assertion => assertion.blocking !== false)
  if (run.steps.some(step => step.status === "failed") || assertions.some(assertion => assertion.ok === false)) return "fail"
  if (!assertions.length || assertions.some(assertion => assertion.ok === null || ["uncertain", "missing", "stale", "inconclusive"].includes(assertion.verdict ?? ""))) return "unknown"
  return "pass"
}
/** One cycle pairs newest receipts, retaining history without treating missing evidence as green. */
export const drift = async (input: DriftInput, readOwner: IssueOwnerReader) => {
  const now = input.now ?? Date.now()
  if (!Number.isFinite(Date.parse(input.builtAt)) || !Number.isFinite(now) || !Number.isFinite(input.aheadMaxDays) || input.aheadMaxDays < 0) throw new Error("Invalid drift clock or policy")
  const owners = new Map<string, ReturnType<IssueOwnerReader>>()
  const owner = (reference: string) => { if (!owners.has(reference)) owners.set(reference, readOwner(reference)); return owners.get(reference)! }
  const rows = []
  for (const journey of input.journeys) {
    const latest = (mode: RunResult["mode"]) => input.runs.filter(run => run.journey === journey.id && run.mode === mode).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0]
    const mock = outcome(latest("mock")), live = outcome(latest("live"))
    const previous = input.previous?.find(row => row.id === journey.id)
    const wasShipped = previous?.state === "shipped" || previous?.wasShipped === true
    let state: State = "unverified", reason = "Missing or inconclusive evidence"
    let ownership: { issue: string; ageDays: number; warning: boolean } | undefined
    if (mock === "pass" && live === "pass") { state = "shipped"; reason = "Both pass" }
    else if (mock === "fail") {
      if (journey.stale?.by && journey.stale.reason) { state = "stale"; reason = journey.stale.reason }
      else reason = "Mock failed; Product decision required"
    } else if (mock === "pass" && live === "fail") {
      const references = [...new Set([journey.owner, ...(journey.capabilities ?? []).map(capability => input.ahead[capability])].filter((value): value is string => !!value))]
      let unavailable = false
      for (const reference of references) {
        try {
          const issue = await owner(reference)
          if (issue.state === "open" && !ownership) {
            const ageDays = Math.max(0, (now - Date.parse(issue.createdAt)) / 86_400_000)
            ownership = { issue: reference, ageDays, warning: ageDays > input.aheadMaxDays }
          }
        } catch { unavailable = true }
      }
      if (ownership) { state = "ahead"; reason = "Open issue owns the gap" }
      else if (unavailable) reason = "Issue ownership unavailable"
      else if (wasShipped) { state = "regressed"; reason = "Previously shipped; live failed" }
      else reason = "Live failed without shipped history or an open owner"
    }
    rows.push({ id: journey.id, state, reason, wasShipped: wasShipped || state === "shipped", ...(ownership ? { owner: ownership } : {}) })
  }
  const capability = []
  if (input.productionCapabilities) for (const name of input.capabilities.filter(name => !input.productionCapabilities!.includes(name))) {
    const reference = input.ahead[name]
    try { if (reference && (await owner(reference)).state === "open") continue }
    catch { capability.push({ capability: name, state: "unverified", reason: "Issue ownership unavailable" }); continue }
    capability.push({ capability: name, state: "drift", reason: "No open owning issue" })
  }
  const wire = (input.captures ?? []).flatMap((capture, index) => {
    let decoded: unknown
    try { decoded = decode(capture.schema, capture.response) } catch { return [{ index, schema: capture.schema, reason: "Route schema rejected capture" }] }
    return (capture.unknownFields?.length || unknownFieldsOf(capture.response, decoded).length) ? [{ index, schema: capture.schema, reason: "Unknown fields in capture" }] : []
  })
  const latestLive = new Map<string, RunResult>()
  for (const run of input.runs.filter(run => run.mode === "live")) if (!latestLive.has(run.journey) || Date.parse(run.startedAt) > Date.parse(latestLive.get(run.journey)!.startedAt)) latestLive.set(run.journey, run)
  // Invalid captures are refused by wire.capture before writing an override.
  // The runner retains their redacted decoder error on the action receipt.
  const rejectedCaptures = [...latestLive.values()].flatMap(run => {
    const reasons = [run.reason, ...run.steps.flatMap(step => step.assertions.filter(assertion => assertion.kind === "action").map(assertion => assertion.reason))].filter((value): value is string => !!value)
    return readRoutes.flatMap(route => {
      const schema = `${route.method} ${route.path}`
      return reasons.some(reason => reason.includes(schema + ":")) ? [{ journey: run.journey, schema, reason: "Route schema rejected capture" }] : []
    })
  })
  return { builtAt: input.builtAt, builtMinutes: Math.max(0, Math.floor((now - Date.parse(input.builtAt)) / 60_000)), ahead: rows.filter(row => row.state === "ahead").length, regressed: rows.filter(row => row.state === "regressed").length, rows, capability, wire: [...wire, ...rejectedCaptures] }
}
