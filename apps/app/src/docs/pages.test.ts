import { expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { createCommandRegistry } from "../mainview/flows/Commands"
import type { CommandActions } from "../mainview/flows/entries/Declare"
import { slashTree, unmetRequirements, visible, type CommandState } from "../mainview/flows/registry"

const directory = new URL("./pages/", import.meta.url)
const pages = new Map(readdirSync(directory).filter(name => name.endsWith(".md"))
  .map(name => [name, readFileSync(new URL(name, directory), "utf8")]))
const body = (markdown: string) => markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
const withoutFences = (markdown: string) => markdown.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "")
const anchors = (markdown: string) => {
  const counts = new Map<string, number>()
  return new Set([...withoutFences(body(markdown)).matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => {
    const slug = match[1]!.toLowerCase().replace(/[`*_]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-")
    const count = counts.get(slug) ?? 0
    counts.set(slug, count + 1)
    return count === 0 ? slug : `${slug}-${count}`
  }))
}

test("pages have title and summary frontmatter only", () => {
  expect(pages.size).toBeGreaterThan(0)
  for (const markdown of pages.values()) {
    const fields = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]?.split(/\r?\n/)
    expect(fields?.map(field => field.split(":")[0]).sort()).toEqual(["summary", "title"])
    for (const field of fields!) expect(field).toMatch(/^(?:title|summary): "[^"\r\n]+"$/)
  }
})

test("relative links and anchors resolve", () => {
  for (const [name, markdown] of pages) {
    for (const match of withoutFences(body(markdown)).matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1]!
      if (/^https?:\/\//.test(href)) continue
      const target = new URL(href, new URL(name, directory))
      const destination = readFileSync(target, "utf8")
      if (target.hash) expect(anchors(destination).has(decodeURIComponent(target.hash.slice(1)))).toBe(true)
    }
  }
})

// One source for alt text: capture-docs.mjs writes each screenshot's alt into
// captures.json, and a page shows it with exactly that text. A capture no page
// shows is a stale image.
test("every screenshot's alt text is its capture's, and every capture is shown", () => {
  const captures = JSON.parse(readFileSync(new URL("./images/captures.json", import.meta.url), "utf8")) as ReadonlyArray<{ id: string; alt: string }>
  const alts = new Map(captures.map(capture => [capture.id, capture.alt]))
  const shown = new Set<string>()
  for (const [name, markdown] of pages) {
    for (const [, alt, id] of withoutFences(body(markdown)).matchAll(/^!\[([^\]]*)\]\(images\/([a-z0-9-]+)\.webp\)$/gm)) {
      shown.add(id!)
      expect({ name, id, alt: alts.get(id!) }).toEqual({ name, id, alt })
    }
  }
  expect(shown.size).toBeGreaterThan(0)
  expect([...alts.keys()].filter(id => !shown.has(id))).toEqual([])
})

// M-49: a repository's flows live under `.smithers/flows/`; a root `flows/` is never read.
test("pages place repository flows under .smithers/flows/", () => {
  expect(pages.get("flows.md")).toContain("`.smithers/flows/<name>/flow.ts`")
  for (const markdown of pages.values()) expect(markdown).not.toMatch(/(?<![\w.\/-])flows\/</)
})

test("page prose uses product words", () => {
  // C-UI-02 terms, from spec.md §14.6b.
  const terms = ["workflow", "thread", "task", "lane", "box", "workspace", "mythical", "sandbox", "VM", "seat", "profile", "Jev", "forge"]
  const banned = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${terms.join("|")})(?:s|es)?(?=$|[^\\p{L}\\p{N}])`, "iu")
  for (const markdown of pages.values()) expect(withoutFences(markdown).replace(/(`+)[^`\n]*\1/g, "")).not.toMatch(banned)
})

const member: CommandState = {
  surface: "chat", typing: false, hasConnectors: false, admin: false, signedOut: false
}
const discovery = {
  debugApi: { available: () => false },
  /*
   * The self-host page and the flows reference document the INSTALL's
   * commands, and an install's own bootstrap says `install`.
   * The row is what makes the TODO family a door at all
   * (flows/DoorAvailability.ts), so a fixture without it would withdraw the
   * very flows these pages document.
   */
  bootstrap: { apiVersion: 1, host: "local", version: "docs-test", buildSha: "docs-test",
    capabilities: ["install"], authFlow: "none", sandbox: null },
  snapshot: () => member,
  repositoryFlows: () => undefined
}
const actions = new Proxy(discovery, {
  get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : () => undefined
}) as unknown as CommandActions
const registry = createCommandRegistry(actions)
const commands = visible(registry.all()).filter(command => unmetRequirements(command, member).length === 0)
const names = new Set(registry.all().map(command => command.name))

const resolvesSlash = (query: string): boolean => {
  if (names.has(query)) return true
  if (query.includes(".") && !query.endsWith(".")) return false
  // Bare fragments and trailing dots are menu queries, not flow invocations.
  return slashTree(member, query, commands).some(row => row.kind === "flow" || row.kind === "namespace")
}

test("slash references resolve against the generated MVP catalog and source registry", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../../../catalog.mvp.json", import.meta.url), "utf8"))
  const slashes = new Set(catalog.operations.map((operation: { slash: string | null }) => operation.slash))
  const references = [...pages.values()].flatMap(markdown => {
    const spans = [...markdown.matchAll(/^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\s*\1\s*$/gm)].map(match => match[2]!)
    spans.push(...[...withoutFences(markdown).matchAll(/(`+)([^`\n]+)\1/g)].map(match => match[2]!))
    return spans.flatMap(span => [...span.matchAll(/(?:^|\s)\/([a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.?|)(?=$|[^a-z0-9_./-])/g)].map(match => match[1]!))
  })
  expect(references.length).toBeGreaterThan(0)
  for (const query of references) {
    expect({ query, resolves: resolvesSlash(query) }).toEqual({ query, resolves: true })
    if (query) expect(slashes.has(`/${query}`)).toBe(true)
  }
})


test("the docs index and release links are exact", () => {
  expect([...pages.keys()].sort()).toEqual(["flows.md", "quickstart.md", "self-host.md", "welcome.md"])
  expect(pages.get("welcome.md")).toMatch(/^---\ntitle: "Welcome to Smithers"/ )
  expect(pages.get("quickstart.md")).toMatch(/^---\ntitle: "Quickstart"/ )
  expect(pages.get("self-host.md")).toMatch(/^---\ntitle: "Self-host Smithers"/ )
  expect(pages.get("flows.md")).toMatch(/^---\ntitle: "Flows reference"/ )
  const selfHost = pages.get("self-host.md")!
  const https = selfHost.split("## Put HTTPS in front\n")[1]!.split("\n## ")[0]!
  expect(https).toContain("Tailscale")
  expect(https).toContain("Caddy")
  expect(selfHost.replace(https, "")).not.toMatch(/tailscale|caddy/i)
  for (const markdown of pages.values()) {
    for (const match of markdown.matchAll(/\]\((https:\/\/smithers\.sh\/docs\/[^)]+)\)/g)) {
      const path = new URL(match[1]!).pathname
      expect(path === "/docs/installation/" || path === "/docs/reference/http-api/" || path.startsWith("/docs/reference/api/")).toBe(true)
    }
  }
  expect(selfHost).toContain("https://smithers.sh/docs/reference/http-api/")
  expect(anchors(selfHost).has("put-https-in-front")).toBe(true)
  expect(selfHost).toContain("tailscale serve --bg --https=443 http://127.0.0.1:4000")
  expect(selfHost).toContain("--tcp=2222")
  expect(selfHost).toContain("header_up Host {http.request.host}")
  expect(selfHost).toContain("proxy on another host must pass the original `Host`")
  expect(selfHost).toContain("Hypervisor.framework")
  expect(selfHost).toContain("automatic login")
  expect(selfHost).toContain("stop the original install first")
  expect(pages.get("flows.md")).not.toMatch(/tailscale|caddy/i)
})


test("self-host includes shipped LAN commands without duplicate sections", () => {
  const selfHost = pages.get("self-host.md")!
  for (const command of ["brew install smithersai/tap/smithers", "smthrs host start --bind 0.0.0.0 --origin http://studio-mini.local:4000"]) expect(selfHost).toContain(command)
  const headings = [...selfHost.matchAll(/^## (.+)$/gm)].map(match => match[1])
  expect(new Set(headings).size).toBe(headings.length)
})


test("recovery examples name the backup directory and report provider refusal honestly", () => {
  const selfHost = pages.get("self-host.md")!
  for (const command of ["smthrs host backup", "smthrs host upgrade", "smthrs host restore /Users/will/Backups/smithers"]) expect(selfHost).toContain(command)
  expect(selfHost.indexOf("smthrs host stop")).toBeLessThan(selfHost.indexOf("smthrs host restore"))
  expect(selfHost).toContain("host_maintenance_unavailable")
  expect(selfHost).toContain("A refusal is not a completed backup or upgrade")
  expect(selfHost).toContain("directory printed by a successful backup")
  expect(selfHost).toContain("$STATE/backups/<version>-<UTC ts>/")
  expect(selfHost).toContain("never a `.partial-` directory")
  expect(selfHost).toContain("Stop the destination install too before running restore")
})
