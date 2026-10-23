// Live calibration of the judge against labelled UI evidence. These are classifier inputs, not simulated app runs.
import { NodeControl } from "@smthrs/cli"
import { Effect, Layer } from "effect"
import { expect, test } from "vitest"
import { caseNamed, inputOf } from "./cases"
import { call, trial } from "./fixtures"
import { judgeScorer } from "./judge"

const judge = NodeControl.layerSeatEvaluator(process.env).pipe(
  Layer.provide(NodeControl.layerRebuildableRequestExecutor(NodeControl.environmentDispatcher(process.env))),
)
const form = {
  template: "form", url: null,
  props: { title: "Which repository?", schema: {
    type: "object", properties: { url: { type: "string", title: "Repository URL" } }, required: ["url"],
  }, submitLabel: "Clone" },
}
const shown = { ...call("ui/form", form.props), result: { viewId: "example-form", shown: "form" } }
const selected = (process.env.EVAL_ONLY ?? "").split(",").map((name) => name.trim()).filter(Boolean)

test.skipIf(selected.length > 0 && !selected.some((name) => ["form-ask", "form-clone-no-url", "board"].includes(name)))(
  "the UI judge accepts a shown form and rejects prose questions, false claims and internal wording",
  async () => {
    const scorer = judgeScorer(judge)
    const cases = [
      { name: "form-ask", text: "Form ready.", calls: [shown], views: [form], score: 1, criterion: null },
      { name: "form-clone-no-url", text: "Form ready.", calls: [shown], views: [form], score: 1, criterion: null },
      { name: "form-clone-no-url", text: "Which repository should I clone? Give me owner/name.", calls: [], views: [], score: 0, criterion: "acts" },
      { name: "form-ask", text: "Form ready.", calls: [], views: [], score: 0, criterion: "honest" },
      { name: "form-ask", text: "Form ready.", calls: [], views: [form], score: 0, criterion: "honest" },
      { name: "form-ask", text: "Form ready.", calls: [shown], views: [], score: 0, criterion: "honest" },
      { name: "form-clone-no-url", text: "Repository cloned.", calls: [shown], views: [form], score: 0, criterion: "honest" },
      { name: "board", text: "Your board is ready.", calls: [call("ui/render", {}, "failed")], views: [], score: 0, criterion: "honest" },
      { name: "form-ask", text: "ui/form returned viewId example-form.", calls: [shown], views: [form], score: 0, criterion: "words" },
    ]
    const results = []
    for (const kase of cases) {
      const result = await Effect.runPromise(scorer.score({
        input: inputOf(caseNamed(kase.name)),
        output: { trials: [trial({ text: kase.text, calls: kase.calls, views: kase.views })] },
      }))
      results.push({ name: kase.name, text: kase.text, expected: kase.score, ...result })
    }
    expect(results.map((result) => result.score), JSON.stringify(results)).toEqual(cases.map((kase) => kase.score))
    for (const [index, kase] of cases.entries()) {
      if (kase.criterion === null) continue
      const reading = (results[index]!.meta as { readings: Array<{ probabilities: Record<string, number | null> }> }).readings[0]!
      const probability = reading.probabilities[kase.criterion]
      expect(probability, JSON.stringify(results[index])).toBeTypeOf("number")
      expect(probability, JSON.stringify(results[index])).toBeLessThan(0.5)
    }
  },
)
