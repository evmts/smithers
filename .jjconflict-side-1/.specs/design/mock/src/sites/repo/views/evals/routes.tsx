import type { Route, Screen } from "../../../core/router"
import { Evals } from "./Evals"
import { EvalSuite } from "./Suite"

const screen = (id: string, path: string, label: string, flags = ""): Screen => {
  const [pathname, raw = ""] = path.split("?")
  const query = new URLSearchParams("as=in&role=member&net=ok&data=full&landing=open&host=hosted&hosted=up&model=connected")
  new URLSearchParams(raw).forEach((value, key) => query.set(key, value))
  new URLSearchParams(flags).forEach((value, key) => query.set(key, value))
  return { id: `smithers-evals-${id}`, site: "smithers-site", label,
    route: `smithers.sh/smithers-canary/smithers/${pathname}?${query}`,
    ...(query.get("net") === "slow" ? { wait: 100 } : {}) }
}
export const routes: Route[] = [
  { pattern: "smithers.sh/:owner/:repo/evals", name: "Repository · Evals", render: () => <Evals />, screens: [
    screen("list", "evals", "Eval suites"),
    screen("loading", "evals", "Loading evals", "net=slow"),
    screen("error", "evals", "Eval store unavailable", "net=error"),
    screen("empty", "evals", "No eval suites", "data=empty"),
    screen("signed-out", "evals", "Read evals signed out", "as=out"),
    screen("reader", "evals", "Read evals as a reader", "role=reader")
  ] },
  { pattern: "smithers.sh/:owner/:repo/evals/:suite", name: "Repository · Eval suite", render: context => <EvalSuite id={context.params.suite} />, screens: [
    screen("review", "evals/review-seeded-bugs", "Seeded review · F1"),
    screen("case", "evals/review-seeded-bugs?case=missing-await-flush", "Seeded review · expanded case"),
    screen("authoring", "evals/authoring", "Authoring · validator snapshot"),
    screen("recommend", "evals/recommend", "Command recommendations"),
    screen("swebench", "evals/swebench", "SWE-bench · recorded fixture wave"),
    screen("agent", "evals/agent", "Agent regression"),
    screen("suite-loading", "evals/agent", "Loading suite", "net=slow"),
    screen("suite-error", "evals/agent", "Suite read failed", "net=error"),
    screen("suite-empty", "evals/agent", "Empty suite", "data=empty"),
    screen("suite-signed-out", "evals/agent", "Read suite signed out", "as=out"),
    screen("suite-reader", "evals/agent", "Read suite as reader", "role=reader"),
    screen("confirm", "evals/agent?act=run", "Confirm eval run"),
    screen("held", "evals/agent?act=run", "Hosted eval held · local command", "landing=install"),
    screen("denied", "evals/agent?act=run", "Eval run requires membership", "role=reader"),
    screen("signin", "evals/agent?act=run", "Sign in to run eval", "as=out"),
    screen("paused", "evals/agent?act=run", "Hosted machines paused", "hosted=paused"),
    screen("missing", "evals/no-such-suite", "Unknown suite")
  ] }
]
