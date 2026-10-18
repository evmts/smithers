import { CaseExecutor, Suite } from "@smthrs/evals"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import * as Binding from "@smthrs/scorers/Binding"
import * as Scorer from "@smthrs/scorers/Scorer"
import { TOC } from "../../../apps/app/src/docs/toc.ts"
import { checks, currentBuild, loadPage, type Page } from "../checks.ts"
import { evidence, rubric } from "../judge.ts"

const root = fileURLToPath(new URL("../../../apps/app/src/docs/", import.meta.url))
const target = { name: "docs/pages" }
const build = currentBuild()
const deterministic = Object.entries(checks).map(([name, check]) =>
  Scorer.make({
    id: `docs/pages/${name}`,
    name,
    version: "1",
    score: ({ output }) => Effect.sync(() => check(output as Page))
  })
)
const skip = process.env.DOCS_EVAL_SKIP_JUDGE
const judgeScorer = Scorer.make({
  id: "docs/pages/judge",
  name: "rubric",
  version: "1",
  config: { rubricKey: rubric.scorerKey, skip: skip ?? null },
  score: ({ output }) =>
    skip
      ? Effect.succeed({ score: 0, reason: `judge skipped: ${skip}`, meta: { skipped: true, imagesAttached: false } })
      : rubric.score({
        input: { context: "One Smithers documentation page and its supporting build evidence." },
        output: evidence(output as Page)
      })
})
export const suite = Suite.make({
  name: "docs-pages",
  concurrency: 1,
  cases: TOC.flatMap((section) => section.pages.map((slug) => ({ name: slug, input: slug }))),
  bindings: [...deterministic, judgeScorer].map((scorer) => Binding.make({ scorer, appliesTo: target }))
})
export const executor = CaseExecutor.make((entry) =>
  Effect.promise(async () => {
    const output = loadPage(root, entry.input as string, await build)
    const identity = createHash("sha256").update(JSON.stringify(output)).digest("hex")
    return { output, stepKey: `docs/${entry.name}/${identity}`, latencyMs: 0, target }
  })
)
export default { suite, executor }
