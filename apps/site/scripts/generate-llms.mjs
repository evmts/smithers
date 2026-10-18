#!/usr/bin/env node
/**
 * generate-llms.mjs
 *
 * Writes public/llms.txt (curated link index for agents, per llmstxt.org)
 * and public/llms-full.txt (the full prose of every docs page) from the
 * Starlight content tree. Start here leads with the install page and the
 * coding guide (what the Copy Prompt needs first), then the app's docs pages
 * follow in sidebar order (src/data/docs-sidebar.json). A page that publishes a Markdown copy names it
 * as its `text/markdown` alternate (sync-app-docs.mjs for the app's pages,
 * gen-cli-reference.mjs for the CLI reference); llms.txt links that copy and
 * llms-full.txt takes the page's text from it. Deterministic: no clock, no
 * network. `--check` reports drift instead of writing.
 *
 * Usage: node apps/site/scripts/generate-llms.mjs [--check]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { docsText } from "./docs-text.mjs"
import { libraryPackages } from "../../../packages/repo-targets/scripts/workspace-packages.mjs"

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const docsRoot = join(siteRoot, "src/content/docs/docs")
const checkMode = process.argv.includes("--check")
const origin = "https://smithers.sh"
const project = JSON.parse(readFileSync(join(siteRoot, "src/data/project.json"), "utf8"))
const versions = JSON.parse(readFileSync(join(siteRoot, "src/data/versions.json"), "utf8"))
const sidebar = JSON.parse(readFileSync(join(siteRoot, "src/data/docs-sidebar.json"), "utf8"))
// The Markdown copy a page's frontmatter declares as its alternate.
const markdownAlternate = /^\s+type: text\/markdown\n\s+href: (\/docs\/\S+\.md)$/m

function fm(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*"([^"]*)"\\s*$`, "m")) ?? text.match(new RegExp(`^${key}:\\s*([^\\n]+)$`, "m"))
  return m ? m[1].trim() : null
}
function orderOf(text) {
  const m = text.match(/^sidebar:\s*\n\s*order:\s*(\d+)/m)
  return m ? Number(m[1]) : 1000
}

const pages = []
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(dir, entry.name))
    else if (/\.mdx?$/.test(entry.name)) {
      const path = join(dir, entry.name)
      const text = readFileSync(path, "utf8")
      const rel = relative(docsRoot, path)
      let route = "/" + rel.replace(/\.mdx?$/, "").replace(/\/index$/, "").replace(/^index$/, "")
      const slug = fm(text, "slug")
      if (slug) route = "/" + slug.replace(/^docs\/?/, "").replace(/\/$/, "")
      route = "/docs" + (route === "/" ? "/" : route + "/")
      const raw = Object.fromEntries([...text.matchAll(/^import (\w+) from ["']([^"']+)\?raw["']/gm)]
        .map(([, name, file]) => [name, readFileSync(join(dirname(path), file), "utf8")]))
      // A Markdown copy: `# Title`, `> summary`, then the body with absolute
      // links, which is what an agent reading this file needs.
      const copy = markdownAlternate.exec(text.match(/^---\n[\s\S]*?\n---\n/)?.[0] ?? "")?.[1]
      const body = copy ? readFileSync(join(siteRoot, "public", copy), "utf8").replace(/^# [^\n]*\n\n> [^\n]*\n\n/, "").trim() : docsText(text, { raw, versions })
      pages.push({
        rel,
        route,
        copy,
        title: fm(text, "title") ?? rel,
        description: fm(text, "description") ?? "",
        order: orderOf(text),
        group: rel.includes("/") ? rel.split("/")[0] : "",
        body
      })
    }
  }
}
walk(docsRoot)

const groups = ["how-it-works", "learn", "tui", "app", "tutorials", "guides", "concepts", "reference", "troubleshooting", "migration", "examples"]
const groupLabel = {
  "how-it-works": "How Smithers works",
  learn: "Tutorials: GUI, TUI, CLI, API",
  tui: "TUI reference",
  app: "The app",
  tutorials: "Tutorials",
  guides: "How-to guides",
  concepts: "Concepts",
  reference: "Reference",
  troubleshooting: "Troubleshooting",
  migration: "Migration",
  examples: "Examples"
}
const byGroup = (g) => pages.filter((p) => p.group === g).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
// The sidebar's groups of top-level pages, in order: the app's sections and
// Install. Its Reference group is the reference directory, listed below.
const guides = sidebar.map(({ label, items }) => ({
  label,
  list: items.map(({ slug }) => pages.find((p) => p.route === `/${slug}/`)).filter((p) => p?.group === "")
})).filter(({ list }) => list.length > 0)
const listed = new Set(guides.flatMap(({ list }) => list))
const startOrder = ["index.mdx", "quickstart.mdx", "pricing.mdx", "self-hosting.mdx", "developers.mdx", "installation.mdx", "cli-quickstart.mdx"]
const root = pages.filter((p) => p.group === "" && !listed.has(p)).sort((a, b) => startOrder.indexOf(a.rel) - startOrder.indexOf(b.rel))

// The smithers.sh Copy Prompt hands an agent llms-full.txt, so it opens with what
// works today: the install page, then the coding guide (a first change on the
// person's own subscription). The guide is package documentation on GitHub, not
// a site page; its relative links resolve there. Both lead "Start here"; the
// install page is not repeated in its sidebar group below.
const guidePath = "packages/smithers/docs/guides/change-code.md"
const guideUrl = `https://github.com/smithersai/smithers/blob/main/${guidePath}`
const guideText = readFileSync(join(siteRoot, "../..", guidePath), "utf8")
const guide = {
  title: guideText.match(/^# (.+)$/m)[1],
  url: guideUrl,
  description: "Run a coding agent on your subscription, review its diff, and commit it yourself.",
  body: guideText.replace(/^# .+\n+/, "").replace(/\]\((\.\.?\/[^)\s]+)\)/g, (_, path) => `](${new URL(path, guideUrl).href})`).trimEnd()
}
const install = pages.find((p) => p.rel === "installation.mdx")
const start = [...(install ? [install] : []), guide]
const pageUrl = (p) => p.url ?? `${origin}${p.copy ?? p.route}`
const link = (p) => `- [${p.title}](${pageUrl(p)})${p.description ? `: ${p.description}` : ""}`

const sections = []
sections.push("# Smithers\n")
sections.push(`> ${project.description}\n`)
sections.push("## Start here\n\n" + [...start, ...root].map(link).join("\n"))
for (const { label, list } of guides) {
  const rest = list.filter((p) => p !== install)
  if (rest.length > 0) sections.push(`## ${label}\n\n` + rest.map(link).join("\n"))
}
for (const g of groups) {
  if (g === "examples") continue
  const list = byGroup(g)
  if (list.length > 0) sections.push(`## ${groupLabel[g]}\n\n` + list.map(link).join("\n"))
}
sections.push("## Package documentation\n\n" + libraryPackages().filter(({ manifest }) => !manifest.private).map(({ name, dir, manifest }) =>
  `- [${name}](https://github.com/smithersai/smithers/tree/main/${dir}/docs)${manifest.description ? `: ${manifest.description}` : ""}`
).join("\n"))
sections.push("## Optional\n\n" + byGroup("examples").map(link).join("\n"))
const llmsTxt = sections.join("\n\n").trimEnd() + "\n"

const ordered = [...start, ...[...listed].filter((p) => p !== install), ...root, ...groups.flatMap((g) => byGroup(g))]
const llmsFull =
  "# Smithers documentation (full)\n\n" +
  ordered.map((p) => `# ${p.title}\n${p.url ?? `${origin}${p.route}`}\n\n${p.body}`).join("\n\n---\n\n") +
  "\n"

const outputs = [
  [join(siteRoot, "public", "llms.txt"), llmsTxt],
  [join(siteRoot, "public", "llms-full.txt"), llmsFull]
]
let drift = 0
for (const [path, content] of outputs) {
  if (checkMode) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      console.error(`drift: ${relative(siteRoot, path)}`)
      drift++
    }
  } else {
    writeFileSync(path, content)
    console.log(`wrote ${relative(siteRoot, path)} (${content.length} bytes)`)
  }
}
// exitCode rather than an exit call: exiting can drop the queued drift lines on a
// macOS pipe, which reads as a failure with no reason.
if (checkMode && drift > 0) {
  console.error(`generate-llms: ${drift} file(s) out of date; run node apps/site/scripts/generate-llms.mjs`)
  process.exitCode = 1
}
