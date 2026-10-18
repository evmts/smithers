import type { Page } from "@playwright/test"
import type * as Evaluator from "@smthrs/model/Evaluator"
import { join } from "node:path"
import type { JudgePolicy } from "../../../packages/smithers/build/targets/src/Factory.ts"
import { agreement, blocks, readLabels } from "./agreement.ts"
import { captureObservation } from "./captureObservation.ts"
import type { Assertion, Journey, Step } from "./journey.ts"
import { type JudgmentRequest, record, replay } from "./judgments.ts"
import type { AssertionResult } from "./results.ts"
import { claimsHonest } from "./rubrics/claims-honest.ts"
import { replyActionable } from "./rubrics/reply-actionable.ts"

export interface JudgeOptions {
  readonly policy?: typeof JudgePolicy.Type
  readonly sidecar: string
  readonly labels: string
  readonly record?: {
    readonly evaluator: Evaluator.Evaluator
    readonly fuzzyEvaluator?: Evaluator.Evaluator
    readonly ledger: string
    readonly run: string
    readonly pendingLabels: string
  }
}
export const judgeAssertion = async (
  page: Page,
  assertion: Extract<Assertion, { fuzzy: unknown } | { rubric: unknown }>,
  definition: Journey,
  step: Step,
  slot: string,
  options?: JudgeOptions
): Promise<AssertionResult> => {
  const kind = "fuzzy" in assertion ? "fuzzy" : "rubric"
  if (!options?.policy) {
    return {
      kind,
      ok: null,
      verdict: "inconclusive",
      blocking: false,
      expected: assertion,
      actual: null,
      reason: "No judge policy"
    }
  }
  const view = "fuzzy" in assertion ? assertion.fuzzy.view : assertion.on.view
  const rubric = "fuzzy" in assertion
    ? replyActionable
    : assertion.rubric === "claims-honest"
    ? claimsHonest
    : assertion.rubric === "reply-actionable"
    ? replyActionable
    : undefined
  if (!rubric) {
    return {
      kind,
      ok: false,
      verdict: "stale",
      blocking: true,
      expected: assertion,
      actual: null,
      reason: "Unknown rubric"
    }
  }
  const request: JudgmentRequest = {
    kind,
    rubric,
    observation: await captureObservation(page, view, step.volatile),
    context: `${definition.id}: ${step.caption}\n${step.spec ?? definition.spec}`,
    ...("fuzzy" in assertion ? { means: assertion.means } : {})
  }
  const result = options.record
    ? await record({
      path: options.sidecar,
      slot,
      request,
      policy: options.policy,
      ...options.record,
      evaluator: kind === "fuzzy"
        ? options.record.fuzzyEvaluator ?? options.record.evaluator
        : options.record.evaluator
    })
    : await replay(options.sidecar, request, options.policy, slot)
  const report = kind === "rubric"
    ? agreement(rubric, options.policy, await readLabels(join(options.labels, `${rubric.id}.jsonl`)))
    : undefined
  const blocking = result.verdict === "missing" || result.verdict === "stale" ||
    blocks(kind, result.verdict, options.policy.blocking.rubric !== false && report?.promoted)
  return {
    kind,
    verdict: result.verdict,
    blocking,
    ok: blocking ? false : result.verdict === "uncertain" || result.verdict === "inconclusive" ? null : true,
    expected: assertion,
    actual: result,
    reason: result.reason
  }
}
