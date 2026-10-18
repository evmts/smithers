import { z } from "zod"
import type { AssertionResult } from "./results"

const schema = z.strictObject({
  kind: z.enum(["rubric", "fuzzy"]), rubric: z.string().min(1), rubricVersion: z.string().min(1), model: z.string().min(1),
  identity: z.string().regex(/^[a-f0-9]{64}$/), verdict: z.enum(["pass", "fail", "uncertain"]),
  trials: z.literal(3), passes: z.number().int().min(0).max(3)
})
/** Only receipt-stamped provenance calibrates a judge; old or missing receipts stay general labels. */
export const labelEvidence = (assertion: AssertionResult) => {
  if (!["rubric", "fuzzy"].includes(assertion.kind) || !assertion.actual || typeof assertion.actual !== "object") return undefined
  const actual = assertion.actual as Record<string, unknown>
  const parsed = schema.safeParse(actual.label)
  if (!parsed.success) return undefined
  const value = parsed.data
  if (value.kind !== assertion.kind || value.identity !== actual.identity || value.passes !== actual.passes || value.trials !== actual.trials || value.verdict !== actual.verdict || value.verdict !== (value.passes === 3 ? "pass" : value.passes === 0 ? "fail" : "uncertain")) return undefined
  return value
}
