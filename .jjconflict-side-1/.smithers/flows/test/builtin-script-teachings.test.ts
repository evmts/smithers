/**
 * @smthrs/testing's BuiltinScript answers a turn by its step's system
 * teaching. A flow here that rewords its teaching would leave the journey
 * rehearsals' turns unscripted, so each teaching must still be in its flow.
 */
import * as BuiltinScript from "@smthrs/testing/BuiltinScript"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const owners: Readonly<Record<keyof typeof BuiltinScript.teachings, string>> = {
  "coding/review-request": "coding/planning.ts",
  "coding/draft-plan": "coding/planning.ts",
  "coding/edit-atom": "coding/atoms.ts",
  "coding/select-owner-repair": "coding/correction.ts",
  "coding/review-final-history": "coding/vibe-cleanup.ts",
  "coding/review-lens": "coding/review-check.ts",
  "review/change": "review/change/flow.mdx",
  "review/file": "review/src/workflow/reviewAgentActions.ts",
  "review/verify": "review/src/workflow/reviewAgentActions.ts",
  "wiki/review-page": "wiki/workflow.ts",
  conflict: "coding/todo-conflict-schema.ts"
}

test("every BuiltinScript teaching is still in the flow that sends it", () => {
  for (const [step, teaching] of Object.entries(BuiltinScript.teachings)) {
    const owner = owners[step as keyof typeof owners]
    const source = readFileSync(new URL(`../${owner}`, import.meta.url), "utf8")
    assert.ok(source.includes(teaching), `${owner} no longer says ${JSON.stringify(teaching)} (${step})`)
  }
})
