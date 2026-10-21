// A person's flow as flow source (src/features/flows-ui/source.ts): the module drafting writes, read back exactly, a
// real typed `Flow.make` module, and where a revision runs: a drafted flow as drafted on the device, any other code on
// a sandbox.
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import {
  type Generated,
  placementOf,
  readGenerated,
  renderPrompt,
  renderSource,
  SOURCE_PATH,
  stepName,
} from "./source"

const notes: Generated = {
  name: "release-notes",
  description: "Summarize merged pull requests: since \"the\" last tag.",
  instructions: "Read the repository.\n\n  Then summarize what merged.\r\nTabs\there, and `ticks` with ${braces}.",
  flows: ["repo/read", "repo/tree"],
}

describe("renderSource and readGenerated", () => {
  test("a drafted flow is a Flow.make module named for it, with one agent step, and reads back as drafted", () => {
    const source = renderSource(notes)
    expect(source).toContain(`export default Flow.make("release-notes", {`)
    expect(source).toContain(`const Agent = AgentAction.make("release-notes/agent", {`)
    expect(source).toContain(`  flows: ["repo/read", "repo/tree"],`)
    expect(source.endsWith("})\n")).toBe(true)
    expect(readGenerated(source)).toEqual(notes)
    expect(SOURCE_PATH).toBe("flow.ts")
    expect(stepName("release-notes")).toBe("release-notes/agent")
  })

  test("no calls, empty instructions, and line separators read back too", () => {
    for (const flow of [
      { ...notes, flows: [] },
      { ...notes, instructions: "" },
      { ...notes, description: "One two", instructions: "Para graph" },
    ]) {
      expect(readGenerated(renderSource(flow))).toEqual(flow)
    }
    expect(renderSource({ ...notes, flows: [] })).toContain("  flows: [],")
  })

  test("any edit at all is other code: a step label, a comment, a space, the body", () => {
    const source = renderSource(notes)
    for (
      const edited of [
        source.replace(`"release-notes/agent"`, `"release-notes/answer"`),
        source.replace("// Drafted by Smithers", "// Mine now"),
        `${source}\n`,
        source.replace("Agent.call({ input })", "Agent.call({ input: input.toUpperCase() })"),
        source.replace(`  flows: ["repo/read", "repo/tree"],`, `  flows: ["repo/read",  "repo/tree"],`),
      ]
    ) {
      expect(readGenerated(edited)).toBeUndefined()
      expect(placementOf(edited)).toBe("sandbox")
    }
    expect(placementOf(source)).toBe("client")
  })

  test("source missing a piece, or with a piece that isn't what drafting writes, is other code", () => {
    const source = renderSource(notes)
    const without = (pattern: RegExp) => source.replace(pattern, "")
    expect(readGenerated(without(/^export default Flow\.make.*$/m))).toBeUndefined()
    expect(readGenerated(without(/^ {2}description: .*$/m))).toBeUndefined()
    expect(readGenerated(without(/^ {2}flows: .*$/m))).toBeUndefined()
    expect(readGenerated(without(/^const instructions = \[$/m))).toBeUndefined()
    // Pieces of the right shape whose values aren't strings, or aren't JSON.
    expect(readGenerated(source.replace(`  flows: ["repo/read", "repo/tree"],`, "  flows: [1, 2],"))).toBeUndefined()
    expect(readGenerated(source.replace(`  flows: ["repo/read", "repo/tree"],`, "  flows: {},"))).toBeUndefined()
    expect(readGenerated(source.replace(`  flows: ["repo/read", "repo/tree"],`, "  flows: [repo],"))).toBeUndefined()
    expect(readGenerated(source.replace(`"Read the repository."`, `"Read the \\x41 repository."`))).toBeUndefined()
    expect(readGenerated("export default 1")).toBeUndefined()
  })
})

describe("renderPrompt", () => {
  test("the instructions, then the input when there is one", () => {
    expect(renderPrompt("Count.", "")).toBe("Count.")
    expect(renderPrompt("Count.", "to three")).toBe("Count.\n\nInput: to three")
  })
})

describe("a drafted flow's module", () => {
  test("type-checks against @smthrs/flow and @smthrs/agent as a flow.ts beside the app's own code", () => {
    // A file of its own in this folder, served from memory, so its imports resolve as the app's do.
    const file = fileURLToPath(new URL("./__generated__/flow.ts", import.meta.url))
    const source = renderSource(notes)
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      types: [],
    }
    const host = ts.createCompilerHost(options)
    const getSourceFile = host.getSourceFile
    host.getSourceFile = (name, language, ...rest) =>
      name === file ? ts.createSourceFile(name, source, language) : getSourceFile.call(host, name, language, ...rest)
    const fileExists = host.fileExists
    host.fileExists = (name) => name === file || fileExists.call(host, name)
    const program = ts.createProgram([file], options, host)
    const diagnostics = ts.getPreEmitDiagnostics(program, program.getSourceFile(file))
    expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([])
  }, 120_000)
})
