/** Bundled docs describe this build; resolve commands from source, never an installed CLI. */
import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import { makeCli } from "../../../../packages/smithers/src/Cli.ts"
import { surplus } from "../../../../packages/smithers/build/build-cli/src/Positionals.ts"
import { baseFlows } from "../mainview/flows/Flows"
import type { CommandActions } from "../mainview/flows/entries/Declare"
import { nameOf } from "../mainview/flows/registry"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const directory = new URL("./pages/", import.meta.url)
const pages = new Map(readdirSync(directory).filter(name => name.endsWith(".md"))
  .map(name => [name, read(`./pages/${name}`)]))
const quickstart = pages.get("quickstart.md") ?? ""
const body = (markdown: string) => markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
const withoutFences = (markdown: string) => markdown.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "")
const prose = (markdown: string) => withoutFences(markdown).replace(/(`+)[^`\n]*\1/g, "")
const code = (markdown: string) => [
  ...[...markdown.matchAll(/^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\s*\1\s*$/gm)].map(match => match[2]!),
  ...[...withoutFences(markdown).matchAll(/(`+)([^`\n]+)\1/g)].map(match => match[2]!)
]
const slug = (text: string) => text.toLowerCase().replace(/[`*_]/g, "")
  .replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-")
const anchors = (markdown: string) => {
  const counts = new Map<string, number>()
  return new Set([...withoutFences(body(markdown)).matchAll(/^#{2,6}\s+(.+)$/gm)].map(match => {
    const name = slug(match[1]!), count = counts.get(name) ?? 0
    counts.set(name, count + 1)
    return count === 0 ? name : `${name}-${count}`
  }))
}

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
const cliLines = (markdown: string) => code(markdown).flatMap(span =>
  [...span.matchAll(/\bsmthrs\s+[^\n]+/g)].map(match => match[0].trim()))

const catalogPath = new URL("../../../../packages/rpc/src/catalog/catalog.mvp.json", import.meta.url)
const slashNames = (): Set<string> => {
  if (!existsSync(catalogPath)) {
    // T-CAT-01 hasn't landed. Read the same declarations the current app registers.
    // Handlers are never called: only their declared names are inspected.
    const actions = new Proxy({}, { get: () => () => undefined }) as CommandActions
    return new Set(baseFlows(actions).map(nameOf))
  }
  const names = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (value === null || typeof value !== "object") return
    const row = value as Record<string, unknown>
    if (typeof row.slash === "string") {
      const name = row.slash.match(/^\/?([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)/)?.[1]
      if (name !== undefined) names.add(name)
    }
    Object.values(row).forEach(visit)
  }
  visit(JSON.parse(readFileSync(catalogPath, "utf8")))
  return names
}

const bannedLine = read("../../../../.specs/engineering/checks/C-UI-02.md").split("\n")
  .find(line => line.startsWith("- The banned-term list, exactly"))
const bannedTerms = bannedLine?.match(/: (.+)\.$/)?.[1]?.split(", ") ?? []

describe("bundled Quickstart and Flows pages", () => {
  test("contains exactly the two product pages with title and one-line summary", () => {
    expect([...pages.keys()].sort()).toEqual(["flows.md", "quickstart.md"])
    expect([...pages.values()].map(markdown => markdown.match(/^---\n([\s\S]*?)\n---/)?.[1]
      ?.match(/^title: "([^"]+)"$/m)?.[1]).sort()).toEqual(["Flows reference", "Quickstart"])
    for (const [name, markdown] of pages) {
      const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ""
      expect(frontmatter.split("\n").map(line => line.split(":")[0]).sort()).toEqual(["summary", "title"])
      expect(frontmatter).toMatch(/^summary: "[^"\n]+"$/m)
      expect(body(markdown)).not.toMatch(/^# /m)
      expect(prose(markdown)).not.toMatch(/Availability:|\bPlanned\b|coming soon/i)
      for (const match of markdown.matchAll(/^\s*(`{3,}|~{3,})([^\n]*)$/gm)) {
        // A bare fence is a closing fence only while a block is open.
        expect(match[2]!.trim() === "" || /^[a-z][a-z0-9_-]*$/i.test(match[2]!.trim())).toBe(true)
      }
      const openingFences = [...markdown.matchAll(/^\s*(`{3,}|~{3,})([^\n]*)$/gm)]
      expect(openingFences.length % 2).toBe(0)
      openingFences.forEach((match, index) => {
        if (index % 2 === 0) expect(match[2]!.trim().length).toBeGreaterThan(0)
      })
      expect(name).toMatch(/^[a-z-]+\.md$/)
    }
  })

  test("resolves every CLI command and flag against source makeCli, with no planned exceptions", () => {
    expect(tree.size).toBeGreaterThan(0)
    for (const markdown of pages.values()) for (const invocation of cliLines(markdown)) resolveCli(invocation)
  })

  test("rejects ghost commands and flags even when help would return root help", () => {
    expect(() => resolveCli("smthrs __docs_nonexistent__ --help")).toThrow("Unresolved command")
    expect(() => resolveCli("smthrs doctor --__docs_nonexistent__")).toThrow("Undeclared flag")
    expect(() => resolveCli("smthrs login")).not.toThrow()
  })

  test("resolves inline slash commands against the app's current catalog", () => {
    const catalog = slashNames()
    expect(catalog.size).toBeGreaterThan(0)
    for (const markdown of pages.values()) {
      for (const match of withoutFences(markdown).matchAll(/`\/([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)\b[^`]*`/g)) {
        expect(catalog.has(match[1]!)).toBe(true)
      }
      expect(code(markdown).filter(span => span.includes("\n")).join("\n")).not.toMatch(/^\/[a-z]/m)
    }
  })

  test("uses C-UI-02 product words in prose", () => {
    expect(bannedTerms).toHaveLength(11)
    for (const markdown of pages.values()) for (const term of bannedTerms) {
      expect(prose(markdown)).not.toMatch(new RegExp(`\\b${term}s?\\b`, "i"))
    }
  })

  test("links once to installation and resolves every relative page and heading", () => {
    expect([...quickstart.matchAll(/https:\/\/smithers\.sh\/docs\/installation\//g)]).toHaveLength(1)
    for (const [name, markdown] of pages) {
      const text = withoutFences(body(markdown))
      for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const href = match[1]!
        if (/^https?:\/\//.test(href)) {
          const url = new URL(href)
          if (url.hostname === "smithers.sh") expect(url.pathname).toBe("/docs/installation/")
          else if (url.hostname === "github.com" && url.pathname.startsWith("/smithersai/smithers/blob/main/")) {
            const path = url.pathname.slice("/smithersai/smithers/blob/main/".length)
            expect(existsSync(new URL(`../../../../${path}`, import.meta.url))).toBe(true)
          }
          continue
        }
        const [target, anchor] = href.split("#")
        expect(target === "" || /^[a-z-]+\.md$/.test(target!)).toBe(true)
        const linked = pages.get(target || name)
        expect(linked).toBeDefined()
        if (anchor !== undefined) expect(anchors(linked!).has(decodeURIComponent(anchor))).toBe(true)
      }
    }
  })

  test("keeps the fixed HTTPS anchor whenever HTTPS instructions are bundled", () => {
    if (/\b(?:HTTPS|Tailscale|Caddy)\b/.test(body(quickstart))) {
      expect(quickstart).toMatch(/^## Put HTTPS in front$/m)
      expect(anchors(quickstart).has("put-https-in-front")).toBe(true)
      const section = body(quickstart).split("## Put HTTPS in front\n")[1]?.split(/\n## /)[0] ?? ""
      expect(section).toContain("tailscale serve")
      expect(section).toContain("reverse_proxy")
    }
    for (const [name, markdown] of pages) {
      if (!markdown.includes("Tailscale")) continue
      expect(name).toBe("quickstart.md")
      const outside = body(markdown).replace(/## Put HTTPS in front\n[\s\S]*?(?=\n## |$)/, "")
      expect(outside).not.toContain("Tailscale")
    }
  })
})
