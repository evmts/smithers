import * as Rubric from "../../../packages/smithers/agent/scorers/src/Rubric.ts"
import { passHatK } from "../../../packages/smithers/agent/evals/src/Trials.ts"
import type { JudgePolicy } from "../../../packages/smithers/build/targets/src/Factory.ts"
import { readFile } from "node:fs/promises"
import type { RubricData } from "./judgments.ts"

export interface Label {
  readonly journey: string
  readonly step: number
  readonly mode: "mock" | "live"
  readonly revision: string
  readonly thumb: "up" | "down"
  readonly assertions: ReadonlyArray<{
    readonly rubric: string
    readonly rubricVersion: string
    readonly model: string
    readonly identity: string
    readonly verdict: "pass" | "fail" | "uncertain"
    readonly trials: 3
    readonly passes: number
    readonly seededDefect?: boolean
  }>
  readonly by: string
  readonly at: string
  readonly note?: string
}

/** Reject malformed labels rather than promoting on partial or contradictory data. */
export const readLabels = async (path: string): Promise<readonly Label[]> => {
  const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return ""
    throw error
  })
  return text.split("\n").filter((line) => line.trim() !== "").map((line, index) => {
    const label: Label = JSON.parse(line)
    if (!label || typeof label.journey !== "string" || !Number.isSafeInteger(label.step) || label.step < 0 || !["mock", "live"].includes(label.mode) || typeof label.revision !== "string" || !["up", "down"].includes(label.thumb) || typeof label.by !== "string" || !Number.isFinite(Date.parse(label.at)) || !Array.isArray(label.assertions)) throw new Error(`Invalid label ${path}:${index + 1}`)
    for (const assertion of label.assertions) {
      if (!assertion || [assertion.rubric, assertion.rubricVersion, assertion.model, assertion.identity].some((value) => typeof value !== "string" || !value) || assertion.trials !== 3 || !Number.isInteger(assertion.passes) || assertion.passes < 0 || assertion.passes > 3 || assertion.verdict !== (assertion.passes === 3 ? "pass" : assertion.passes === 0 ? "fail" : "uncertain") || (assertion.seededDefect !== undefined && typeof assertion.seededDefect !== "boolean")) throw new Error(`Invalid assertion ${path}:${index + 1}`)
    }
    return label
  })
}

export interface AgreementReport {
  readonly rubric: string
  readonly labels: number
  readonly agreement: Rubric.Agreement
  readonly pass3: number
  readonly seededDefects: number
  readonly seededDefectsFail: boolean
  readonly promoted: boolean
}

/** Latest owner label per content identity wins. Other people and old models never calibrate this judge. */
export const agreement = (rubric: RubricData, policy: typeof JudgePolicy.Type, labels: readonly Label[], owner = "will"): AgreementReport => {
  const observations = new Map<string, { label: Label; assertion: Label["assertions"][number] }>()
  for (const label of [...labels].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (label.by.toLowerCase() !== owner.toLowerCase()) continue
    for (const assertion of label.assertions) {
      if (assertion.rubric === rubric.id && assertion.rubricVersion === rubric.version && assertion.model === policy.engines.rubric.model) observations.set(assertion.identity, { label, assertion })
    }
  }
  const cases = [...observations.values()]
  const ordinary = cases.filter(({ assertion }) => !assertion.seededDefect)
  const seeded = cases.filter(({ assertion }) => assertion.seededDefect)
  const pairs = ordinary.map(({ label, assertion }) => {
    const expected = label.thumb === "up" ? "pass" as const : "fail" as const
    // An uncertain judge disagrees with either definite human answer.
    const actual = assertion.verdict === "uncertain" ? expected === "pass" ? "fail" as const : "pass" as const : assertion.verdict
    return { expected, actual }
  })
  const summary = Rubric.agreement(pairs)
  const consistency = ordinary.map(({ label, assertion }) => passHatK(3, label.thumb === "up" ? assertion.passes : 3 - assertion.passes, 3))
  const seededDefectsFail = seeded.length > 0 && seeded.every(({ label, assertion }) => label.thumb === "down" && assertion.passes === 0)
  return {
    rubric: rubric.id, labels: ordinary.length, agreement: summary,
    pass3: consistency.length === 0 ? 0 : consistency.reduce((sum, value) => sum + value, 0) / consistency.length,
    seededDefects: seeded.length, seededDefectsFail,
    promoted: policy.trials === 3 && ordinary.length >= Math.max(20, policy.promote.minLabels) && summary.accuracy >= Math.max(0.9, policy.promote.minAgreement) && seededDefectsFail && ordinary.every(({ assertion }) => assertion.passes === 0 || assertion.passes === 3)
  }
}

/** Enforce the CEO's fixed advisory boundaries even if an older policy says otherwise. */
export const blocks = (kind: "exact" | "shape" | "rubric" | "fuzzy" | "visual" | "agent", verdict: string, promoted = false): boolean => {
  if (verdict === "uncertain" || verdict === "inconclusive") return false
  return (kind === "exact" || kind === "shape" || kind === "rubric" && promoted) && verdict === "fail"
}
