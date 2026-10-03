/** Pure checks shared by the Node content suite and the source-dependent app suite. */
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"

export const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
export const readPages = (directory = new URL("./pages/", import.meta.url)) => {
  const entries = readdirSync(directory, { withFileTypes: true })
  assert.ok(entries.length > 0, "No bundled pages")
  return new Map(entries.map(entry => {
    assert.ok(entry.isFile() && /^[a-z-]+\.md$/.test(entry.name), `Not a flat page: ${entry.name}`)
    return [entry.name, readFileSync(new URL(entry.name, directory), "utf8")] as const
  }))
}
export const body = (markdown: string) => markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
export const withoutFences = (markdown: string) => markdown.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "")
export const prose = (markdown: string) => withoutFences(markdown).replace(/(`+)[^`\n]*\1/g, "")
export const code = (markdown: string) => [
  ...[...markdown.matchAll(/^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\s*\1\s*$/gm)].map(match => match[2]!),
  ...[...withoutFences(markdown).matchAll(/(`+)([^`\n]+)\1/g)].map(match => match[2]!)
]
const slug = (text: string) => text.toLowerCase().replace(/[`*_]/g, "")
  .replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-")
export const anchors = (markdown: string) => {
  const counts = new Map<string, number>()
  return new Set([...withoutFences(body(markdown)).matchAll(/^#{2,6}\s+(.+)\r?$/gm)].map(match => {
    const name = slug(match[1]!), count = counts.get(name) ?? 0
    counts.set(name, count + 1)
    return count === 0 ? name : `${name}-${count}`
  }))
}
export const checkFrontmatter = (markdown: string) => {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  assert.ok(frontmatter !== undefined, "Missing frontmatter")
  const lines = frontmatter.split(/\r?\n/)
  assert.deepEqual(lines.map(line => line.split(":")[0]).sort(), ["summary", "title"])
  for (const line of lines) assert.match(line, /^(?:title|summary): "[^"\r\n]+"$/)
  assert.doesNotMatch(body(markdown), /^# /m)
  assert.doesNotMatch(prose(markdown), /Availability:|Available now|Partly available|\bPlanned\b|coming soon/i)
  const fences = [...markdown.matchAll(/^\s*(`{3,}|~{3,})([^\n]*)$/gm)]
  assert.equal(fences.length % 2, 0, "Unclosed code fence")
  fences.forEach((match, index) => {
    if (index % 2 === 0) assert.match(match[2]!.trim(), /^[a-z][a-z0-9_-]*$/i, "Missing fence language")
    else {
      assert.equal(match[1], fences[index - 1]![1], "Mismatched code fence")
      assert.equal(match[2]!.trim(), "", "Closing fence has text")
    }
  })
}

export const tocSlugs = (module: Record<string, unknown>): string[] => {
  const lists = Object.values(module).filter(Array.isArray)
  assert.equal(lists.length, 1, "toc.ts must export one page-order array")
  assert.ok(lists[0]!.length > 0, "Empty toc")
  return lists[0]!.map((row: unknown) => {
    const value = typeof row === "string" ? row : (row as { slug?: unknown } | null)?.slug
    assert.ok(typeof value === "string" && /^[a-z-]+$/.test(value), "Invalid toc slug")
    return value
  })
}
export const checkToc = (pages: ReadonlyMap<string, string>, slugs: string[]) => {
  assert.equal(new Set(slugs).size, slugs.length, "Duplicate toc entry")
  assert.deepEqual(slugs.map(slug => `${slug}.md`).sort(), [...pages.keys()].sort())
}

export const cliLines = (markdown: string) => code(markdown).flatMap(span =>
  [...span.matchAll(/\bsmthrs[ \t]+[^\r\n]+/g)].map(match => match[0].trim()))
export const checkCliContent = (markdown: string, resolve: (line: string) => void) => {
  const invocations = cliLines(markdown)
  if (/\bsmthrs[ \t]+\S+/.test(markdown)) {
    assert.ok(invocations.length > 0, "Page contains a smthrs invocation but scans zero commands")
    invocations.forEach(resolve)
  } else assert.equal(invocations.length, 0, "Page intentionally contains no CLI invocation")
  return invocations.length
}
export const slashReferences = (markdown: string) => code(markdown).flatMap(span =>
  [...span.matchAll(/(?:^|[^\w/])\/([a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.?|)(?=$|[^a-z0-9_./-])/g)]
    .map(match => match[1]!))

export const extractTerms = (check: string): string[] => {
  const rules = check.split(/\r?\n/).filter(line => line.startsWith("- **R1 Banned terms.**"))
  assert.equal(rules.length, 1, "C-UI-02 must contain one R1 term rule")
  const list = rules[0]!.match(/terms \(([^)]*)\)/)?.[1]
  assert.ok(list !== undefined && list.trim() !== "", "Empty C-UI-02 term extraction")
  const terms = list.split(",").map(term => term.trim())
  assert.ok(terms.every(term => /^[a-z]+$/i.test(term)), "Invalid C-UI-02 term")
  assert.equal(new Set(terms.map(term => term.toLowerCase())).size, terms.length, "Duplicate C-UI-02 term")
  return terms
}
export const bannedPattern = (terms: string[]) => {
  assert.ok(terms.length > 0, "Empty banned-term list")
  const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:(?:${escaped.join("|")})(?:s|es)?|microVM)(?=$|[^\\p{L}\\p{N}])`, "iu")
}
export const checkHttps = (pages: ReadonlyMap<string, string>) => {
  const marker = /\b(?:HTTPS|Tailscale|Caddy)\b/
  const mentions = [...pages].filter(([, markdown]) => marker.test(body(markdown)))
  if (mentions.length === 0) {
    for (const markdown of pages.values()) {
      assert.doesNotMatch(body(markdown), marker)
      assert.equal(anchors(markdown).has("put-https-in-front"), false)
    }
    return
  }
  const quickstart = pages.get("quickstart.md") ?? ""
  assert.match(quickstart, /^## Put HTTPS in front\r?$/m)
  assert.ok(anchors(quickstart).has("put-https-in-front"))
  const section = body(quickstart).split(/## Put HTTPS in front\r?\n/)[1]?.split(/\r?\n## /)[0] ?? ""
  assert.ok(section.includes("tailscale serve"))
  assert.ok(section.includes("reverse_proxy"))
  for (const [name, markdown] of mentions) {
    assert.equal(name, "quickstart.md", "HTTPS instructions belong in Quickstart")
    const outside = body(markdown).replace(/## Put HTTPS in front\r?\n[\s\S]*?(?=\r?\n## |$)/, "")
    assert.doesNotMatch(outside, /\b(?:Tailscale|Caddy)\b/)
  }
}
