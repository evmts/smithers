import type { FullResult, Reporter, Suite, TestCase } from "@playwright/test/reporter"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type Ended, render, summarize } from "./summary"

// Playwright's side of the run's summary (e2e/summary.ts): playwright.config.ts names this file as a reporter for a
// deployment run.

const endedOf = (test: TestCase): Ended => {
  const result = test.results.at(-1)
  return {
    file: test.location.file,
    title: test.titlePath().slice(3).join(" › "),
    outcome: test.outcome(),
    expectedStatus: test.expectedStatus,
    status: result?.status ?? "skipped",
    annotations: [...test.annotations, ...(result?.annotations ?? [])],
  }
}

/** Playwright's reporter: prints the summary, writes `summary.json` beside the results, and fails the run with it. */
export default class Summary implements Reporter {
  private suite: Suite | undefined
  private outputDir = "test-results"

  onBegin(config: { readonly projects: ReadonlyArray<{ readonly outputDir: string }> }, suite: Suite) {
    this.suite = suite
    this.outputDir = config.projects[0]?.outputDir ?? this.outputDir
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult["status"] } | undefined> {
    // `--list` and an interrupted run have nothing to sum up. Otherwise every selected test counts, including those a
    // failed setup kept from running, which have no result.
    const tests = this.suite?.allTests() ?? []
    if (!tests.some((test) => test.results.length > 0) || result.status === "interrupted") return undefined
    const summary = summarize(tests.map(endedOf))
    console.log(`\n${render(summary)}\n`)
    mkdirSync(this.outputDir, { recursive: true })
    writeFileSync(join(this.outputDir, "summary.json"), JSON.stringify(summary, null, 2))
    return summary.passed ? undefined : { status: "failed" }
  }

  printsToStdio() {
    return true
  }
}
