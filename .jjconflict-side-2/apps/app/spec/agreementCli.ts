import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { agreement, readLabels } from "./agreement.ts"
import { claimsHonest } from "./rubrics/claims-honest.ts"
import { replyActionable } from "./rubrics/reply-actionable.ts"
import type { JudgePolicy } from "../../../packages/smithers/build/targets/src/Factory.ts"

export const agreementCli = async (policyPath: string, labelDirectory: string, owner = "will"): Promise<void> => {
  const policy: typeof JudgePolicy.Type | undefined = JSON.parse(await readFile(policyPath, "utf8")).judges
  if (!policy) throw new Error("No judge policy")
  for (const rubric of [claimsHonest, replyActionable]) {
    const report = agreement(rubric, policy, await readLabels(join(labelDirectory, `${rubric.id}.jsonl`)), owner)
    console.log(JSON.stringify(report))
  }
}
if (import.meta.main) agreementCli(process.argv[2] ?? ".smithers/factory.json", process.argv[3] ?? "apps/app/spec/labels", process.argv[4]).catch(() => { console.error("Agreement report inconclusive"); process.exitCode = 5 })
