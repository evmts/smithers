// `pnpm eval`: the agent evals' flows suite (docs/features/agent-evals.md#the-flows-suite): for each flow the agent may
// call, a realistic request it must act on with that flow and the right input, and the acts that are the person's
// alone, which it must leave to them (rulings FLOW-3 and FLOW-5). Its cases are evals/flowCases.ts, its baseline
// evals/flows-baseline.json; the program is evals/suite.ts.
import { test } from "vitest"
import { testFile } from "../worker/test/harness.ts"
import { FLOW_CASES } from "./flowCases"
import { onlyKnown, runSuite, selected, type SuiteSpec } from "./suite"

const spec: SuiteSpec = {
  name: "mvp-agent-flows",
  prefix: "flows",
  cases: FLOW_CASES,
  baseline: new URL("flows-baseline.json", import.meta.url),
  maxTokens: 600_000,
  runtime: testFile("eval_flows"),
}

onlyKnown()

test.skipIf(selected(spec).length === 0)("the agent's flows", () => runSuite(spec))
