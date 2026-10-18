import { join } from "node:path"
import { readLabels } from "./agreement"

/** Mixed-step labels live in journey.jsonl; single-rubric labels live beside it. */
export const readRubricLabels = async (directory: string, rubric: string) => {
  if (!["claims-honest", "reply-actionable"].includes(rubric)) throw new Error("Unknown rubric")
  return (await Promise.all([readLabels(join(directory, `${rubric}.jsonl`)), readLabels(join(directory, "journey.jsonl"))])).flat()
}
