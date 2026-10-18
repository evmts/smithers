import { readFile } from "node:fs/promises"
import { agreement } from "./agreement"
import { readRubricLabels } from "./readRubricLabels"
import { claimsHonest } from "./rubrics/claims-honest"
import { replyActionable } from "./rubrics/reply-actionable"
import type { JudgePolicy } from "../../../packages/smithers/build/targets/src/Factory"

/** The private host and CLI report the same current owner calibration. No evaluator is invoked. */
export const agreementReports = async (policyPath: string, labelDirectory: string, owner = "will") => {
  const policy: typeof JudgePolicy.Type | undefined = JSON.parse(await readFile(policyPath, "utf8")).judges
  if (!policy) throw new Error("No judge policy")
  return Promise.all([claimsHonest, replyActionable].map(async rubric => agreement(rubric, policy, await readRubricLabels(labelDirectory, rubric.id), owner)))
}
