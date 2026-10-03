/** Resolve documented commands through the source CLI and the app's member-visible registry. */
import { describe, expect, test } from "bun:test"
import { createRequire } from "node:module"
import { makeCli } from "../../../../packages/smithers/src/Cli.ts"
import { surplus } from "../../../../packages/smithers/build/build-cli/src/Positionals.ts"
import { createCommandRegistry } from "../mainview/flows/Commands"
import type { CommandActions } from "../mainview/flows/entries/Declare"
import { slashTree, unmetRequirements, visible, type CommandState } from "../mainview/flows/registry"
import { checkCliContent, readPages, slashReferences } from "./pageChecks.ts"

const pages = readPages()
// Resolve Incur from the CLI package, which owns this dependency (the app doesn't).
interface Schema {
  readonly shape: Record<string, Field>
}
interface Field {
  readonly def: { readonly type: string; readonly innerType?: Field }
  readonly meta: () => Record<string, unknown> | undefined
}
interface Entry {
  readonly _alias?: true
  readonly target?: string
  readonly _group?: true
  readonly commands?: Map<string, Entry>
  readonly root?: Entry
  readonly args?: Schema
  readonly options?: Schema
  readonly alias?: Record<string, string>
}
const requireCli = createRequire(new URL("../../../../packages/smithers/package.json", import.meta.url))
const { Cli: Incur, Parser } = requireCli("incur") as {
  Cli: {
    toCommands: WeakMap<object, Map<string, Entry>>
    toRootOptions: WeakMap<object, Schema>
  }
  Parser: {
    parseGlobals: (argv: string[], schema: Schema) => { rest: string[] }
    parse: (argv: string[], config: Entry) => unknown
  }
}
const cli = makeCli({ environment: {} })
const tree = Incur.toCommands.get(cli)!
const rootOptions = Incur.toRootOptions.get(cli)
const words = (line: string) => (line.match(/<[^>]+>|"(?:\\.|[^"\\])*"|'[^']*'|\S+/g) ?? [])
  .map(word => /^<(?:install )?origin>$/.test(word) ? "http://localhost:4000"
    : word.startsWith("<") ? "example" : word.replace(/^("|')([\s\S]*)\1$/, "$2"))
const flagFields = (entry: Entry) => new Map(Object.entries(entry.options?.shape ?? {}).flatMap(([key, field]) => [
  [`--${key}`, field] as const,
  [`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, field] as const,
  ...(entry.alias?.[key] === undefined ? [] : [[`-${entry.alias[key]}`, field] as const])
]))
const resolveCli = (line: string) => {
  const argv = words(line)
  if (argv.shift() !== "smthrs") throw new Error(`Not a CLI invocation: ${line}`)
  const rest = rootOptions === undefined ? argv : Parser.parseGlobals(argv, rootOptions).rest
  let scope: Map<string, Entry> | undefined = tree, entry: Entry | undefined, consumed = 0
  while (scope !== undefined && rest[consumed] !== undefined) {
    const found: Entry | undefined = scope.get(rest[consumed]!)
    const next: Entry | undefined = found?._alias === true ? scope.get(found.target!) : found
    if (next === undefined) break
    entry = next
    consumed++
    scope = next.commands
  }
  const path = rest.slice(0, consumed)
  if (entry?._group === true) entry = entry.root
  if (entry === undefined) throw new Error(`Unresolved command: ${line}`)
  const tail = rest.slice(consumed), flags = flagFields(entry)
  for (let index = 0; index < tail.length; index++) {
    const word = tail[index]!
    if (word === "--") break
    const flag = word.split("=")[0]!
    let field = flags.get(flag)
    if (flag.startsWith("-") && field === undefined && !["--help", "-h", "--schema", "--version"].includes(flag)) {
      throw new Error(`Undeclared flag ${flag}: ${line}`)
    }
    const count = field?.meta()?.["count"] === true
    while (field?.def.innerType !== undefined) field = field.def.innerType
    if (field !== undefined && field.def.type !== "boolean" && !count && !word.includes("=")) index++
  }
  // Incur's parser validates values and required arguments without invoking a handler.
  if (!tail.some(word => ["--help", "-h", "--schema", "--version"].includes(word))) Parser.parse(tail, entry)
  const extra = surplus(cli, rest, path)
  if (extra !== undefined && extra.length > 0) throw new Error(`Surplus arguments: ${line}`)
}

// Only discovery seams are supplied. No handler, network request or flow is executed.
const member: CommandState = {
  surface: "chat", typing: false, hasConnectors: false, admin: false, signedOut: false
}
const discovery = {
  bootstrap: { apiVersion: 1, host: "cloud", version: "docs-test", buildSha: "docs-test",
    capabilities: [], authFlow: "none", sandbox: null },
  snapshot: () => member,
  repositoryFlows: () => undefined
}
const actions = new Proxy(discovery, {
  get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : () => undefined
}) as unknown as CommandActions
const registry = createCommandRegistry(actions)
const commands = visible(registry.all()).filter(command => unmetRequirements(command, member).length === 0)
const names = new Set(commands.map(command => command.name))

const resolvesSlash = (query: string): boolean => {
  if (query.includes(".") && !query.endsWith(".")) return names.has(query)
  // Bare fragments and trailing dots are menu queries, not flow invocations.
  return slashTree(member, query, commands).some(row => row.kind === "flow" || row.kind === "namespace")
}

describe("bundled docs source commands", () => {
  test("resolves documented CLI invocations, or explicitly checks that there are none", () => {
    expect(tree.size).toBeGreaterThan(0)
    let total = 0
    for (const markdown of pages.values()) total += checkCliContent(markdown, resolveCli)
    if ([...pages.values()].some(markdown => /\bsmthrs[ \t]+\S+/.test(markdown))) expect(total).toBeGreaterThan(0)
    else expect(total).toBe(0)
  })

  test("resolves tutorial and reference CLI fixtures and rejects ghost commands and flags", () => {
    expect(checkCliContent("Type `smthrs login`.", resolveCli)).toBe(1)
    expect(checkCliContent("| Command | Result |\n| `smthrs doctor --help` | Show help. |", resolveCli)).toBe(1)
    expect(() => resolveCli("smthrs __docs_nonexistent__ --help")).toThrow("Unresolved command")
    expect(() => resolveCli("smthrs doctor --__docs_nonexistent__")).toThrow("Undeclared flag")
  })

  test("resolves inline and fenced slash references using only visible, member-reachable flows", () => {
    expect(names.size).toBeGreaterThan(0)
    const references = [...pages.values()].flatMap(slashReferences)
    expect(references.length).toBeGreaterThan(0)
    for (const query of references) expect(resolvesSlash(query)).toBe(true)
  })

  test("rejects hidden and unavailable flows and distinguishes menu queries from commands", () => {
    expect(registry.all().find(command => command.name === "chat.queue.edit")?.hidden).toBe(true)
    for (const query of ["chat.queue.edit", "flow.list", "__docs_nonexistent__", "chat.__docs_nonexistent__"]) {
      expect(resolvesSlash(query)).toBe(false)
    }
    expect(names.has("chat.open")).toBe(true) // A user-only gesture is still reachable by a member.
    expect(names.has("chat.commands")).toBe(true)
    expect(names.has("commands")).toBe(false)
    expect(slashTree(member, "commands", commands).some(row => row.kind === "flow" && row.flow.name === "chat.commands")).toBe(true)
    expect(slashTree(member, "chat.", commands).some(row => row.kind === "flow" && row.flow.name === "chat.commands")).toBe(true)
    expect(resolvesSlash("")).toBe(true)
  })
})
