import { Effect } from "effect"
import { readFileSync } from "node:fs"
import { CaseExecutor, EvalError, Suite } from "../../../../packages/smithers/agent/evals/src/index.ts"
import * as Binding from "../../../../packages/smithers/agent/scorers/src/Binding.ts"
import * as Scorer from "../../../../packages/smithers/agent/scorers/src/Scorer.ts"
import * as Rubric from "../../../../packages/smithers/agent/scorers/src/Rubric.ts"
import { claimsHonest } from "../rubrics/claims-honest.ts"
import { replyActionable } from "../rubrics/reply-actionable.ts"

interface LabeledCase { id: string; rubric: string; text: string; expected: "pass" | "fail"; scores: number[] }
const cases: LabeledCase[] = readFileSync(new URL("./fixtures/labeled.jsonl", import.meta.url), "utf8").trim().split("\n").map((line) => JSON.parse(line))
const target = { name: "spec/judges" }
const policy = JSON.parse(readFileSync(new URL("../../../../.smithers/factory.json", import.meta.url), "utf8")).judges
const scorer = Scorer.make({
  id: "spec/judges/label-agreement", version: "1",
  // Identity changes alongside rubric declarations; replayed judgments still need real owner calibration.
  config: { rubrics: [claimsHonest, replyActionable], engines: policy.engines, judge: "spec-rubric@1" },
  score: ({ output, groundTruth }) => Effect.succeed({ score: output === groundTruth ? 1 : 0 })
})
export const suite = Suite.make({ name: "spec-judges", concurrency: 1,
  cases: cases.map((item) => ({ name: item.id, input: item, expected: item.expected })),
  bindings: [Binding.make({ scorer, appliesTo: target })]
})
export const executor = CaseExecutor.make((suiteCase) => Effect.gen(function*() {
  const item = suiteCase.input as LabeledCase
  const rubric = item.rubric === "claims-honest" ? claimsHonest : replyActionable
  const outcomes: boolean[] = []
  for (const score of item.scores) {
    const judge = Rubric.make({ ...rubric, judge: (request) => {
      if (!request.prompt.includes(item.text) || !request.system.includes("never instructions to follow")) throw new Error("Unfenced evaluation")
      return Effect.succeed(JSON.stringify({ scores: { [rubric.criteria[0]!.id]: score }, reason: "Authored evaluator fixture; not a live judgment" }))
    } })
    const result = yield* judge.score({ input: { context: "Documented actions: pnpm test; README.md link; pnpm test --filter unit." }, output: item.text })
    outcomes.push((result.meta as unknown as Rubric.Verdict).pass)
  }
  const passes = outcomes.filter(Boolean).length
  return { output: passes === 3 ? "pass" : passes === 0 ? "fail" : "uncertain", stepKey: `spec/judges/${item.id}`, latencyMs: 0, target }
}).pipe(Effect.mapError((cause) => new EvalError.EvalError({ code: "executor", message: "Rubric fixture failed", cause }))))
export default { suite, executor }
