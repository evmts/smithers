import { Smithers } from "@smthrs/targets"
import { describe, expect, it } from "vitest"
import type { ImportRule } from "../src/ImportRulesCheck.ts"
import { check } from "../src/ImportRulesCheck.ts"
import type { SdkRole } from "../src/index.ts"
import { SdkRules } from "../src/index.ts"

/** The rules an `importRules` target hands its program, as JSON. */
const importRulesOf = (target: ReturnType<typeof SdkRules>["importRules"]): ReadonlyArray<ImportRule> => {
  const attrs = Smithers.Target.metadata(target).attrs as { readonly runner: { readonly args: ReadonlyArray<string> } }
  return JSON.parse(attrs.runner.args[1]!) as ReadonlyArray<ImportRule>
}

/** The JevLint attrs a `jevRules` target records. */
const jevAttrsOf = (target: ReturnType<typeof SdkRules>["jevRules"]) =>
  Smithers.Target.metadata(target).attrs as {
    readonly threshold: number
    readonly manual: boolean
    readonly rules: ReadonlyArray<{ readonly id: string; readonly files: ReadonlyArray<{ readonly pattern: string }> }>
  }

/** One library module that breaks every deterministic rule once, and one that breaks none. */
const sources = [
  {
    path: "src/Bad.ts",
    text: [
      "import { readFileSync } from \"node:fs\"",
      "import { isRecord } from \"@smthrs/canonical/Record\"",
      "import { catalogDescriptors } from \"@smthrs/cli/Catalog\"",
      "import { Effect } from \"effect\"",
      "export const run = () => Effect.runPromise(Effect.succeed([readFileSync, isRecord, catalogDescriptors]))"
    ].join("\n")
  },
  { path: "src/Good.ts", text: "import { canonicalize } from \"@smthrs/canonical\"\nexport const good = canonicalize" },
  { path: "examples/deep.ts", text: "import { Route } from \"@smthrs/model/Route\"\nexport const route = Route" }
]

/** What each role's import rules find in {@link sources}, as `<file>:<line> <kind>`. */
const found = (role: SdkRole, knownDeepImports?: Parameters<typeof SdkRules>[0]["knownDeepImports"]) =>
  check(importRulesOf(SdkRules({ cwd: "packages/x", role, knownDeepImports }).importRules), sources)
    .map((violation) => `${violation.file}:${violation.line} ${violation.kind}`)

describe("SdkRules", () => {
  it("holds a library to every deterministic rule, in src/ and, for root imports, examples/", () => {
    expect(found("library")).toEqual([
      "examples/deep.ts:1 rootImportsOnly",
      "src/Bad.ts:1 forbid",
      "src/Bad.ts:2 rootImportsOnly",
      "src/Bad.ts:3 rootImportsOnly",
      "src/Bad.ts:5 forbidCalls"
    ])
    expect(found("app-library")).toEqual(found("library"))
  })

  it("lets a host package import platform code, and a component package also run Effects", () => {
    expect(found("host")).toEqual([
      "examples/deep.ts:1 rootImportsOnly",
      "src/Bad.ts:2 rootImportsOnly",
      "src/Bad.ts:3 rootImportsOnly",
      "src/Bad.ts:5 forbidCalls"
    ])
    expect(found("components")).toEqual([
      "examples/deep.ts:1 rootImportsOnly",
      "src/Bad.ts:2 rootImportsOnly",
      "src/Bad.ts:3 rootImportsOnly"
    ])
  })

  it("allows only the deep imports a package lists, and says why in the rule's message", () => {
    const because = "HostTools reads the CLI catalog, which the CLI root cannot carry into a neutral host."
    expect(found("library", { packages: ["@smthrs/cli"], because })).toEqual([
      "examples/deep.ts:1 rootImportsOnly",
      "src/Bad.ts:1 forbid",
      "src/Bad.ts:2 rootImportsOnly",
      "src/Bad.ts:5 forbidCalls"
    ])
    const rules = importRulesOf(SdkRules({ cwd: "packages/x", role: "library", knownDeepImports: { packages: ["@smthrs/cli", "@smthrs/model"], because } }).importRules)
    const root = rules.find((rule) => rule.kind === "rootImportsOnly")!
    expect(root.because).toContain(because)
    expect(check([root], sources).map((violation) => violation.usage)).toEqual([
      "imports \"@smthrs/canonical/Record\", not the root \"@smthrs/canonical\""
    ])
  })

  it.each([
    [{ packages: [], because: "why" }, /at least one package and a because/],
    [{ packages: ["@smthrs/cli"], because: "  " }, /at least one package and a because/],
    [{ packages: ["effect"], because: "why" }, /"effect" must be a @smthrs\/<name> package name/],
    [{ packages: ["@smthrs/*"], because: "why" }, /"@smthrs\/\*" must be a @smthrs\/<name> package name/],
    [{ packages: ["@smthrs/cli/Catalog"], because: "why" }, /must be a @smthrs\/<name> package name/]
  ])("refuses the known deep imports %j", (knownDeepImports, message) => {
    expect(() => SdkRules({ cwd: "packages/x", role: "library", knownDeepImports })).toThrow(message)
  })

  it("asks Jev each role's judgment rules about the package's own files", () => {
    const ids = (role: SdkRole) => jevAttrsOf(SdkRules({ cwd: "packages/x", role }).jevRules).rules.map((rule) => rule.id)
    const all = [
      "sdk.platform-neutral",
      "effect.boundary-only",
      "effect.wrap-every-library",
      "sdk.generic-libraries",
      "obs.content-free",
      "sdk.no-dead-code",
      "test.behavioral"
    ]
    expect(ids("library")).toEqual(all)
    expect(ids("app-library")).toEqual(all.filter((id) => id !== "sdk.generic-libraries"))
    expect(ids("host")).toEqual(all.filter((id) => id !== "sdk.platform-neutral"))
    expect(ids("components")).toEqual(["sdk.no-dead-code", "test.behavioral"])

    const attrs = jevAttrsOf(SdkRules({ cwd: "packages/x", role: "library" }).jevRules)
    expect(attrs.threshold).toBe(0.7)
    expect(attrs.manual).toBe(true)
    for (const rule of attrs.rules) {
      expect(rule.files.map((file) => file.pattern)).toEqual(
        rule.id === "test.behavioral"
          ? ["//packages/x/test/**/*.test.ts"]
          : ["//packages/x/src/**/!(*.test).ts", "//packages/x/src/**/!(*.test).tsx"]
      )
    }
  })

  it("reads the test files a package names instead of test/", () => {
    const rules = jevAttrsOf(SdkRules({ cwd: "packages/ui", role: "components", tests: ["tests/**/*.test.{ts,tsx}"] }).jevRules).rules
    expect(rules.find((rule) => rule.id === "test.behavioral")!.files.map((file) => file.pattern)).toEqual([
      "//packages/ui/tests/**/*.test.{ts,tsx}"
    ])
  })

  it("declares both targets in the package it names, and refuses a cwd outside the workspace", () => {
    const { importRules, jevRules } = SdkRules({ cwd: "packages/x", role: "library" })
    expect((Smithers.Target.metadata(importRules).attrs as { readonly cwd: string }).cwd).toBe("packages/x")
    expect(Smithers.Target.metadata(jevRules).target).toBe("JevLint")
    expect(() => SdkRules({ cwd: "../x", role: "library" })).toThrow(TypeError)
  })
})
