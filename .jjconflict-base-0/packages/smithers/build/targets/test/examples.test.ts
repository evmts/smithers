import { describe, expect, it } from "vitest"
import { declareAPackage } from "../examples/declare-a-package.ts"
import { declareIssueTransitions } from "../examples/declare-issue-transitions.ts"

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

  /*
   * The executable repository policy flow (M-47): a repository declares the
   * transitions its issues move through, in its OWN declaration, and the
   * projection carries them in declaration order with the actor rule intact.
   * This is the example a repository copies — not an app stage, not a helper.
   */
  it("declare-issue-transitions declares a policy flow whose moves and actor rules survive the projection", () => {
    const summary = declareIssueTransitions()
    expect(summary.flows).toEqual(["issue-policy"])
    expect(summary.transitions).toEqual([
      { id: "triage", title: "Triage it", move: "needs-triage", needsPerson: false },
      { id: "propose", title: "Propose it", move: "needs-triage → proposed", needsPerson: true },
      { id: "accept", title: "Accept the proposal", move: "proposed → accepted", needsPerson: true },
      { id: "park", title: "Park it", move: "proposed → parked", needsPerson: true }
    ])
    // The projection is what the app and the server read, so the order, the
    // labels and the actor must come back byte-for-byte.
    expect(summary.projected).toEqual([
      { id: "triage", title: "Triage it", to: "needs-triage", actor: "anyone" },
      { id: "propose", title: "Propose it", from: "needs-triage", to: "proposed", actor: "person" },
      { id: "accept", title: "Accept the proposal", from: "proposed", to: "accepted", actor: "person" },
      { id: "park", title: "Park it", from: "proposed", to: "parked", actor: "person" }
    ])
  })
})
