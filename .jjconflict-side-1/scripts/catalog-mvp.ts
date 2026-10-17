/** Generate shipped metadata without invoking a command or importing repository flow bodies. */
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, renameSync } from "node:fs"
import { resolve } from "node:path"
import * as Node from "@smthrs/plan/Node"
import { baseFlows, adminFlows, type CommandActions } from "smithers-app/mainview/flows/Flows"
import { httpProjections } from "@smthrs/ui/app-operations/http"
import { nameOf, visible } from "smithers-app/mainview/flows/registry"
import { doorFamilyAbsent } from "smithers-app/mainview/flows/DoorAvailability"
import { formFieldsFor } from "@smthrs/ui/flow-form"
import { UI_INSTRUCTION_FIELDS } from "@smthrs/rpc/UiInstruction"
import { generateHostReference } from "./catalog-host"

const root = resolve(import.meta.dir, "..")
const actions = new Proxy({ docsAvailable: () => true, debugApi: { available: () => true } }, {
  get: (target, key) => Reflect.get(target, key) ?? (() => undefined)
}) as unknown as CommandActions

export const generateCatalog = () => {
  const entries = [...baseFlows(actions), ...adminFlows(actions), ...httpProjections.map(operation => ({ declaredName: operation.name, metadata: operation, input: operation.input }))]
  const names = new Set<string>()
  return entries.map(entry => {
    const name = "binding" in entry ? nameOf(entry) : entry.declaredName
    if (names.has(name)) throw new Error(`Duplicate operation: ${name}`)
    names.add(name)
    const m = entry.metadata
    return { name, slash: m.slash ?? null, cli: m.cli ?? null, journey: m.journey ?? [], group: m.group ?? "",
      visibility: m.visibility ?? "hidden", actors: m.actors ?? [], minimumRole: m.minimumRole ?? "member", credentialScope: m.credentialScope ?? "write:repository",
      agent: m.agent ?? "never", summary: m.summary, http: m.http ?? null, ...("client" in m && m.client ? { client: m.client } : {}),
      // The owned identity: the CLI validates arguments against this document and
      // the backend pins it, so it must not change with the installed effect.
      payload: Node.schemaIdentity(entry.input) }
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}
/** Browser forms offered to account agents; the app declarations remain the authority. */
export const generateFormInstructions = async (): Promise<Readonly<Record<string, ReadonlyArray<string>>>> => {
  const bootstrap: Pick<AppBootstrap, "capabilities"> = { capabilities: ["cloud", "agent", "browser.read"] }
  const accountActions = new Proxy(actions, { get: (target, key) => key === "bootstrap" ? bootstrap :
    key === "design" ? { enabled: false } : Reflect.get(target, key) })
  const forms: Array<[string, string[]]> = []
  for (const entry of [...baseFlows(accountActions), ...adminFlows(accountActions)]) {
    const name = nameOf(entry), m = entry.metadata
    // Existing screen/data commands retain their doors. Host refusals precede forms just as in Commands.settle.
    if (!m.actors?.includes("app_agent") || !m.actors.includes("person") || m.visibility === "hidden" || (m.hidden === true && visible([{ ...m, name }]).length === 0) || name === "docs" ||
      (m.agent !== "run" && m.agent !== "confirm") || Object.hasOwn(UI_INSTRUCTION_FIELDS, name) ||
      doorFamilyAbsent(m.door, { bootstrap }) || await entry.unavailable?.("agent") !== undefined) continue
    const fields = formFieldsFor(entry.input, m.form).filter(field => field.kind !== "write-only")
    if (fields.length > 0) forms.push([name, fields.map(field => field.name)])
  }
  return Object.fromEntries(forms.sort(([a], [b]) => a.localeCompare(b)))
}
/** Appendix C is the build-time authority for deterministic Inspect labels. */
export const generateActionRenderings = (source: string): Record<string, string | null> => {
  const labels: Record<string, string | null> = {}
  for (const line of source.split("\n")) {
    const columns = line.split("|").map(column => column.trim())
    if (columns.length !== 9 || columns[6] !== "Keep") continue
    const id = /^`([^`]+)`$/.exec(columns[1] ?? "")?.[1]
    if (id === undefined) continue
    const label = columns[7]!.replace(/^Inspect: "(.*)"$/, "$1")
    if (label === "Each tool call renders per B.3") continue
    if (id in labels) throw new Error(`Duplicate Inspect rendering: ${id}`)
    labels[id] = label === "-" ? null : label
  }
  return Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
}
export type CatalogRow = ReturnType<typeof generateCatalog>[number]
export const generateSkill = (rows: ReadonlyArray<CatalogRow>) =>
  "## Commands\n\n" + rows.filter(row => row.cli !== null && row.actors.includes("external_agent") &&
    (row.visibility === "core" || row.visibility === "advanced"))
    .map(row => `- \`smthrs ${row.cli!.join(" ")}\` — ${row.agent}${row.agent === "confirm" ? "; waits for the person's confirmation" : ""}. ${row.summary}`)
    .join("\n") + "\n"

if (import.meta.main) {
  const args = new Set(process.argv.slice(2))
  for (const arg of args) if (!["--check", "--skill", "--forms-only"].includes(arg)) throw new Error(`Unknown option: ${arg}`)
  const rows = generateCatalog()
  const artifact = JSON.stringify({ version: 1, operations: rows }, null, 2) + "\n"
  const cardInput = readFileSync(resolve(root, "packages/rpc/src/CardAction.ts"), "utf8")
  const tags = [...cardInput.matchAll(/^  readonly "([^"]+)":/gm)].map(match => match[1]!)
  for (const tag of tags) if (!rows.some(row => row.name === tag)) throw new Error(`Card command has no Operation: ${tag}`)
  const tagSource = [
    "// Generated by scripts/catalog-mvp.ts; declarations remain the authority.",
    "/**",
    " * The catalog's operation tags and names: card command tags from CardAction.ts and",
    " * every registered operation. Regenerate with `bun scripts/catalog-mvp.ts`.",
    " *",
    " * @since 1.0.0",
    " */",
    "",
    `import { z } from "zod"`,
    "/**",
    " * Registered catalog operation tags.",
    " * @since 1.0.0",
    " * @category constants",
    " */",
    `export const CATALOG_TAGS = ${JSON.stringify(tags, null, 2)} as const`,
    "/**",
    " * Registered catalog operation tag schema.",
    " * @since 1.0.0",
    " * @category schemas",
    " */",
    "export const CatalogTagSchema = z.enum(CATALOG_TAGS)",
    "/**",
    " * Registered catalog operation tag.",
    " * @since 1.0.0",
    " * @category models",
    " */",
    "export type CatalogTag = z.infer<typeof CatalogTagSchema>",
    "/**",
    " * Registered operation names, including commands presented by confirmation cards.",
    " * @since 1.0.0",
    " * @category schemas",
    " */",
    `export const CatalogOperationSchema = z.enum(${JSON.stringify(rows.map(row => row.name), null, 2)})`,
    ""
  ].join("\n")
  const renderings = generateActionRenderings(readFileSync(resolve(root, ".specs/product/actions.md"), "utf8"))
  const renderingSource = [
    "// Generated by scripts/catalog-mvp.ts from Appendix C; do not edit.",
    "/**",
    " * The deterministic Inspect label of each kept action in .specs/product/actions.md",
    " * Appendix C, keyed by action id; null marks an action whose Inspect shows no label.",
    " *",
    " * @since 1.0.0",
    " */",
    "",
    "/**",
    " * @since 1.0.0",
    " * @private",
    " */",
    `export const ACTION_RENDERINGS: Readonly<Record<string, string | null>> = ${JSON.stringify(renderings, null, 2)}`,
    ""
  ].join("\n")
  const policy = Object.fromEntries(rows.map(row => [row.name, {
    agent: row.agent, minimumRole: row.minimumRole, actors: row.actors, visibility: row.visibility, credentialScope: row.credentialScope
  }]))
  const goPolicy = `// Code generated by scripts/catalog-mvp.ts; DO NOT EDIT.\n\npackage services\n\nconst operationCatalogJSON = ${JSON.stringify(JSON.stringify(policy))}\n`
  const outputs = [[resolve(root, "packages/backend/internal/services/catalog_policy_generated.go"), goPolicy], [resolve(root, "packages/smithers/gateway/src/internal/actionRenderings.ts"), renderingSource], [resolve(root, "catalog.mvp.json"), artifact], [resolve(root, "packages/smithers/src/internal/backend/catalog.mvp.json"), artifact], [resolve(root, "packages/rpc/src/CatalogTags.ts"), tagSource]]
  const forms = await generateFormInstructions()
  outputs.push([resolve(root, "packages/rpc/src/FormInstructions.generated.ts"),
    `// Generated by scripts/catalog-mvp.ts; do not edit.\n/**\n * Catalog-derived account form requests.\n * @since 1.0.0\n */\n\n// dprint-ignore\n/**\n * Form drafts the account agent may request.\n * @since 1.0.0\n * @category constants\n */\nexport const FORM_INSTRUCTION_FIELDS = ${JSON.stringify(forms, null, 2)} as const\n`])
  outputs.push([resolve(root, "packages/backend/internal/chat/form_instructions_generated.go"),
    execFileSync("gofmt", { input: `// Code generated by scripts/catalog-mvp.ts; DO NOT EDIT.\n\npackage chat\n\nvar formInstructionFields = map[string][]string{\n${Object.entries(forms).map(([name, fields]) => `\t${JSON.stringify(name)}: {${fields.map(field => JSON.stringify(field)).join(", ")}},`).join("\n")}\n}\n`, encoding: "utf8" })])
  outputs.push([resolve(root, "packages/smithers/docs/reference/cli/host.md"), generateHostReference()])
  if (args.has("--skill")) {
    const path = resolve(root, "packages/smithers/skills/smithers/SKILL.md")
    const current = readFileSync(path, "utf8")
    const before = current.split("\n## Commands\n")[0]!.trimEnd()
    outputs.push([path, before + "\n\n" + generateSkill(rows)])
  }
  for (const [path, content] of outputs) {
    if (args.has("--forms-only") && !path!.endsWith("FormInstructions.generated.ts") && !path!.endsWith("form_instructions_generated.go")) continue
    if (args.has("--check")) {
      if (readFileSync(path!, "utf8") !== content) throw new Error(`Catalog drift: ${path}`)
    } else {
      const temporary = `${path}.tmp-${process.pid}`
      writeFileSync(temporary, content!)
      renameSync(temporary, path!)
    }
  }
  // All output is synchronous; imported host modules may own long-lived resources.
  process.exit(0)
}
