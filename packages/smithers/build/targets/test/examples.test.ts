import { describe, expect, it } from "vitest"
import { declareAPackage } from "../examples/declare-a-package.ts"

describe("examples", () => {
  it("declare-a-package reports the targets, the planned argv, and the owners", () => {
    const summary = declareAPackage()
    expect(summary.keys).toEqual(["lint", "test"])
    expect(summary.targets.lint).toEqual({ rule: "Shell.Test", kinds: ["test"], workspaceAttrs: [] })
    expect(summary.targets.test?.rule).toBe("Vitest")
    expect(summary.targets.test?.workspaceAttrs).toContain("packageManager")
    expect(summary.lintArgv).toEqual(["/bin/sh", "{smthrs:script://scripts/lint.sh}", "--strict"])
    expect(summary.owners).toEqual(["alice", "team:platform"])
    expect(summary.perFile).toEqual([{ pattern: "docs/**", owners: ["team:docs"] }])
  })
})
