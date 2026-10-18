/**
 * Declares a small package the way a `PACKAGE.ts` does, then reads back what
 * the planner sees: each target's rule, kinds, and workspace-resolved attrs,
 * the argv a shell target plans, and the normalized owners. Declaring reads
 * no files and starts no processes, so this runs anywhere.
 * `test/examples.test.ts` runs it.
 */
import { Smithers as S } from "@smthrs/targets"
import * as Package from "@smthrs/targets/Package"

/** One target as the planner sees it. */
export interface TargetSummary {
  readonly rule: string
  readonly kinds: ReadonlyArray<string>
  readonly workspaceAttrs: ReadonlyArray<string>
}

/** What {@link declareAPackage} reports. */
export interface PackageSummary {
  readonly keys: ReadonlyArray<string>
  readonly targets: Readonly<Record<string, TargetSummary>>
  readonly lintArgv: ReadonlyArray<string>
  readonly owners: ReadonlyArray<string>
  readonly perFile: ReadonlyArray<{ readonly pattern: string; readonly owners: ReadonlyArray<string> }>
}

const cwd = "packages/example"
const sources = S.glob("src/**/*.ts")

/** Declares the package and summarizes it. */
export const declareAPackage = (): PackageSummary => {
  const lint = S.Shell.Test({
    script: S.file("//scripts/lint.sh"),
    args: ["--strict"],
    timeout: "5m"
  })
  const test = S.Vitest({
    tests: [S.glob("test/**/*.test.ts")],
    sources: [sources],
    deps: [],
    config: S.file("vitest.config.ts"),
    environment: "node",
    passWithNoTests: false,
    cwd
  })
  const declared = S.Package({
    targets: { lint, test },
    owners: {
      owners: ["alice", "team:platform", "alice"],
      perFile: { "docs/**": "team:docs" }
    }
  })
  const metadata = Package.metadata(declared)
  const summarize = (target: S.Target.AnyTarget): TargetSummary => {
    const meta = S.Target.metadata(target)
    return {
      rule: meta.target,
      kinds: [...meta.kinds],
      workspaceAttrs: [...meta.workspaceAttrs]
    }
  }
  // The payload type admits planned references anywhere; literal attrs plan
  // literal strings only.
  const payload = S.Shell.execPayload({ script: S.file("//scripts/lint.sh"), args: ["--strict"] })
  const lintArgv = payload.argv.map((part) => {
    if (typeof part !== "string") throw new TypeError("literal shell attrs planned a non-literal argv entry")
    return part
  })
  return {
    keys: [...metadata.keys],
    targets: { lint: summarize(declared.lint), test: summarize(declared.test) },
    lintArgv,
    owners: [...(metadata.owners?.owners ?? [])],
    perFile: (metadata.owners?.perFile ?? []).map((rule) => ({ pattern: rule.pattern, owners: [...rule.owners] }))
  }
}
