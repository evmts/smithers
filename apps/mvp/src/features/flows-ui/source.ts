// A person's flow is flow source (decision 0014 §1, as Will ruled on 2026-10-20: "prompt flows are just a type of code
// flow"): one `flow.ts` module whose default export is `Flow.make("<name>", { ... })` from @smthrs/flow, the shape a
// repository's `.smithers/flows/<name>/flow.ts` has. Drafting from a prompt writes one with `renderSource`: a typed
// module whose body is one agent step that follows the drafted instructions. Nothing here imports a library, so the
// tab, the engine and ChatApi all can.
//
// Where a revision runs is its placement, read from its source, never stored apart from it:
// - `client`: the module is exactly what `renderSource` writes. Its body is the system's own agent step, and only its
//   data (description, instructions, calls) came from the draft, so the person's own engine runs it, as the step
//   `flow/run/prompt` declares it (src/features/flows-ui/flows.ts).
// - `sandbox`: any other code, a hand edit included. Code a person wrote runs only on a host that runs untrusted code
//   (decision 0005), and none exists yet, so a run is refused with that reason (`FlowNeedsSandbox`).

/** A flow's one file. */
export const SOURCE_PATH = "flow.ts"

/** Where a revision runs. */
export const PLACEMENTS = ["client", "sandbox"] as const
export type Placement = (typeof PLACEMENTS)[number]

/** What a drafted flow is made of: everything `renderSource` writes that isn't the system's own code. */
export interface Generated {
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly flows: ReadonlyArray<string>
}

/** The name of a drafted flow's one step: `<name>/agent`. */
export const stepName = (name: string): string => `${name}/agent`

/**
 * What the agent of a drafted flow is asked: its instructions, then the run's input when there is one. The module
 * `renderSource` writes spells the same function, and the engine's step calls this one.
 */
export const renderPrompt = (instructions: string, input: string): string =>
  input === "" ? instructions : `${instructions}\n\nInput: ${input}`

/** A string as a TypeScript literal: JSON's, which TypeScript reads as the same string. */
const literal = (text: string): string => JSON.stringify(text)

/** The module a drafted flow is: a typed `Flow.make` whose body is one agent step. */
export const renderSource = (flow: Generated): string =>
  [
    "// Drafted by Smithers from a prompt. In this form it runs on your device; other code needs a sandbox.",
    `import { AgentAction } from "@smthrs/agent"`,
    `import { Flow } from "@smthrs/flow"`,
    `import { Schema } from "effect"`,
    "",
    "/** What the agent does each time the flow runs. */",
    "const instructions = [",
    ...flow.instructions.split("\n").map((line) => `  ${literal(line)},`),
    `].join("\\n")`,
    "",
    "/** The flow's one step: the agent follows the instructions with the run's input. */",
    `const Agent = AgentAction.make(${literal(stepName(flow.name))}, {`,
    "  payload: { input: Schema.String },",
    "  output: Schema.String,",
    `  seat: "agent",`,
    "  prompt: ({ input }) => (input === \"\" ? instructions : `${instructions}\\n\\nInput: ${input}`),",
    "})",
    "",
    `export default Flow.make(${literal(flow.name)}, {`,
    `  description: ${literal(flow.description)},`,
    "  capabilities: [],",
    `  flows: [${flow.flows.map(literal).join(", ")}],`,
    "  payload: { input: Schema.String },",
    "  success: Schema.String,",
    "  error: Agent.errorSchema,",
    "  body: ({ input }) => Agent.call({ input }),",
    "})",
    "",
  ].join("\n")

const STRING = String.raw`"(?:[^"\\\n]|\\.)*"`
const NAME = new RegExp(String.raw`^export default Flow\.make\((${STRING}), \{$`, "m")
const DESCRIPTION = new RegExp(String.raw`^  description: (${STRING}),$`, "m")
const FLOWS = /^ {2}flows: (\[.*\]),$/m
const INSTRUCTIONS = new RegExp(String.raw`^const instructions = \[\n((?: {2}${STRING},\n)+)\]\.join\("\\n"\)$`, "m")

/** `text` read as JSON, or `undefined`. */
const json = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const isString = (value: unknown): value is string => typeof value === "string"

/**
 * What a drafted flow was made of, when `source` is exactly the module `renderSource` writes for it; `undefined` for
 * any other code. The comparison is byte for byte, so a hand edit anywhere, even one that leaves the same behavior,
 * reads as other code.
 */
export const readGenerated = (source: string): Generated | undefined => {
  const name = json(NAME.exec(source)?.[1] ?? "")
  const description = json(DESCRIPTION.exec(source)?.[1] ?? "")
  const flows = json(FLOWS.exec(source)?.[1] ?? "")
  const lines = (INSTRUCTIONS.exec(source)?.[1] ?? "").split("\n").slice(0, -1).map((line) => json(line.slice(2, -1)))
  if (!isString(name) || !isString(description) || !Array.isArray(flows) || !flows.every(isString)) return undefined
  if (lines.length === 0 || !lines.every(isString)) return undefined
  const generated: Generated = { name, description, instructions: lines.join("\n"), flows }
  return renderSource(generated) === source ? generated : undefined
}

/** Where `source` runs: on the person's device when it is a drafted flow as drafted, else on a sandbox. */
export const placementOf = (source: string): Placement => readGenerated(source) === undefined ? "sandbox" : "client"
