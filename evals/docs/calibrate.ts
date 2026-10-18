import { Effect } from "effect"
import { writeFileSync } from "node:fs"
import * as Rubric from "@smthrs/scorers/Rubric"
import { fixture, fixtures } from "./fixtures.ts"
import { evidence, rubric } from "./judge.ts"

const pairs = []
for (const entry of fixtures) {
  try {
    const result = await Effect.runPromise(
      rubric.score({
        input: { context: "A Smithers docs page with its capture manifest and CLI help. No screenshots attached." },
        output: evidence(fixture(entry.name))
      })
    )
    const actual: "pass" | "fail" = (result.meta as Rubric.Verdict).pass ? "pass" : "fail"
    pairs.push({ name: entry.name, expected: entry.expected, actual, ...result })
    console.log(entry.name, actual, result.reason)
  } catch (cause) {
    console.error(entry.name, String(cause))
    writeFileSync(
      new URL("./calibration.json", import.meta.url),
      JSON.stringify({ status: "incomplete", imagesAttached: false, pairs, error: String(cause) }, null, 2) + "\n"
    )
    process.exit(5)
  }
}
const agreement = Rubric.agreement(pairs)
writeFileSync(
  new URL("./calibration.json", import.meta.url),
  JSON.stringify({ status: "complete", imagesAttached: false, agreement, pairs }, null, 2) + "\n"
)
console.log(JSON.stringify(agreement))
process.exitCode = agreement.agree >= 5 ? 0 : 1
