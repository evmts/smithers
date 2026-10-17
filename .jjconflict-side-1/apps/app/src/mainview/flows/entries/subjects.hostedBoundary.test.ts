import { expect, test } from "bun:test"
import * as Cell from "@smthrs/harness/Cell"
import { Effect, Option } from "effect"
import { subjectFlows } from "./subjects"
import { branchFlows } from "./branch"
import { homeFlows } from "./home"
import type { CommandActions } from "./Declare"
import { createDesignWorld } from "../../state/seams/DesignWorld"

// Unit tests at the executable command boundary. The disabled fixture contains
// no rows; only the real ports can answer whether a requested subject exists.
test("hosted subject commands use their ports rather than the disabled fixture (#3831)", async () => {
  const design = createDesignWorld({ enabled: false })
  const reads: unknown[] = []
  const unavailable = "Repository read refused"
  const actions = {
    design, bootstrap: { host: "cloud", capabilities: ["cloud"] }, snapshot: () => ({}),
    branchFiles: { available: () => false, open: async (...args: unknown[]) => { reads.push(["file", ...args]); return unavailable },
      list: async (...args: unknown[]) => { reads.push(["files", ...args]); return unavailable } },
    branchDiff: async (...args: unknown[]) => { reads.push(["diff", ...args]); return unavailable },
    viewLanding: async (...args: unknown[]) => { reads.push(["pr", ...args]); return unavailable },
    openBranch: async (branch: string) => { reads.push(["stack", branch]); return unavailable },
    githubApp: async () => { reads.push(["github"]); return unavailable }
  } as unknown as CommandActions
  const entries = [...subjectFlows(actions), ...branchFlows(actions), ...homeFlows(actions)]
  const invoke = async (name: string, input: Record<string, unknown>) => {
    const entry = entries.find(entry => entry.declaredName === name)!
    const call = new Cell.Call({ flowName: name, input, capabilities: [],
      effects: { reads: [], writes: [], mode: "hermetic", onConflict: "serialize", tier: "sealed" },
      placement: Option.none(), identity: new Cell.CallIdentity({ session: "hosted", frame: 0, cell: name, ordinal: 0, declaration: name, layers: [] }) })
    return Effect.runPromise(entry.binding.run(call))
  }
  try {
    for (const [name, input] of [["file", { path: "README.md", branch: "T12" }], ["files", { branch: "T12" }],
      ["diff", { subject: "T12" }], ["pr", { number: 9 }], ["stack", {}], ["github", {}]] as const) {
      const result = await invoke(name, input)
      expect(JSON.stringify(result)).toContain(unavailable)
    }
    expect(reads).toEqual([["file", "README.md", "T12", undefined], ["files", "T12"], ["diff", "T12", undefined, undefined], ["pr", 9, undefined], ["stack", "main"], ["github"]])
    expect(JSON.stringify(await invoke("terminal", { branch: "T12" }))).toContain("Terminal unavailable")
  } finally { design.dispose() }
})
