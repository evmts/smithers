// The app docs projection: toc.ts parsing, the site and Markdown-copy
// rewrites, the sidebar, and the script's write, check and stale-file paths
// run against a temporary tree.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { copyBody, markdownCopy, parsePage, parseToc, sidebar, siteBody, sitePage } from "./sync-app-docs.mjs"

const site = join(dirname(fileURLToPath(import.meta.url)), "..")

test("toc.ts parses as its literal sections and refuses anything else", () => {
  const toc = (list) => `export interface DocsSection { readonly label: string }\n\nexport const TOC: ReadonlyArray<DocsSection> = [\n${list}\n]\n`
  assert.deepEqual(parseToc(toc('  { label: "Get started", pages: ["welcome", "quickstart"] },\n  // a comment\n  { label: "On \\"your\\" Mac", pages: ["self-host"] }')), [
    { label: "Get started", pages: ["welcome", "quickstart"] },
    { label: "On \"your\" Mac", pages: ["self-host"] }
  ])
  assert.ok(parseToc(readFileSync(join(site, "../app/src/docs/toc.ts"), "utf8")).length > 0, "the app's own toc.ts parses")
  assert.throws(() => parseToc(toc('  { label: "A", pages: ["a"] },\n  ...MORE')), /literal list/)
  assert.throws(() => parseToc(toc('  { label: "A", pages: [SLUG] }')), /other than page slugs/)
  assert.throws(() => parseToc(toc('  { label: "A", pages: ["Not A Slug"] }')), /other than page slugs/)
  assert.throws(() => parseToc("export const OTHER = []\n"), /no `export const TOC/)
})

test("a page reads as its title, summary and body, the way the app reads it", () => {
  assert.deepEqual(parsePage('---\ntitle: "Flows reference"\nsummary: Find and run flows.\n---\n\n\n## Find\n', "flows.md"), {
    title: "Flows reference",
    summary: "Find and run flows.",
    markdown: "## Find\n"
  })
  assert.throws(() => parsePage("## No frontmatter\n", "a.md"), /no --- frontmatter/)
  assert.throws(() => parsePage("---\ntitle: A\nauthor: B\n---\n", "a.md"), /not title or summary/)
  assert.throws(() => parsePage("---\ntitle: A\n---\n", "a.md"), /needs a title and a summary/)
})

test("sibling page links publish under /docs, with welcome at the index", () => {
  const body = "See [Flows](flows.md#change-a-flow), [home](welcome.md), [here](./self-host.md) and [top](#top).\n" +
    "Web: [GitHub](https://github.com/smithersai/smithers). Not a page: [up](../x.md), [file](notes.txt).\n" +
    "Code keeps `[Flows](flows.md)` as written.\n\n```md\n[Flows](flows.md)\n```\n"
  assert.equal(siteBody(body), "See [Flows](/docs/flows/#change-a-flow), [home](/docs/), [here](/docs/self-host/) and [top](#top).\n" +
    "Web: [GitHub](https://github.com/smithersai/smithers). Not a page: [up](../x.md), [file](notes.txt).\n" +
    "Code keeps `[Flows](flows.md)` as written.\n\n```md\n[Flows](flows.md)\n```\n")
  assert.equal(copyBody("[Flows](flows.md#pin) [home](welcome.md#a) [top](#top)"),
    "[Flows](https://smithers.sh/docs/flows/#pin) [home](https://smithers.sh/docs/#a) [top](#top)")
})

test("a block screenshot becomes a framed light and dark pair, each shown in its own theme", () => {
  const img = (variant, hidden, alt) => `<img src="/images/docs/repo-home.${variant}.webp" alt="${alt}" width="1440" height="900" loading="lazy" decoding="async" class="${hidden}:sl-hidden" />`
  const figure = (alt, indent = "") => [`<figure class="docs-shot">`, img("light", "dark", alt), img("dark", "light", alt), "</figure>"].map((line) => indent + line).join("\n")
  assert.equal(siteBody("Intro.\n\n![The \"Files\" button & Ask](images/repo-home.webp)\n\nAfter.\n"),
    `Intro.\n\n${figure("The &quot;Files&quot; button &amp; Ask")}\n\nAfter.\n`)
  // An HTML block ends at a blank line, so text touching the image gets one on each side.
  assert.equal(siteBody("Intro.\n![Home](images/repo-home.webp)\nAfter.\n"), `Intro.\n\n${figure("Home")}\n\nAfter.\n`)
  assert.equal(siteBody("![Home](images/repo-home.webp)\n```sh\nls\n```\n"), `${figure("Home")}\n\n\`\`\`sh\nls\n\`\`\`\n`)
  assert.equal(siteBody("1. Open it.\n\n   ![Home](images/repo-home.webp)\n"), `1. Open it.\n\n${figure("Home", "   ")}\n`)
  // Only a block image of the image directory is a screenshot.
  for (const text of ["Inline ![Home](images/repo-home.webp) image.\n", "![Logo](logo.png)\n", "```md\n![Home](images/repo-home.webp)\n```\n"]) {
    assert.equal(siteBody(text), text)
  }
  assert.equal(copyBody("![Home \\[beta\\]](images/repo-home.webp)\nNext.\n"),
    "![Home [beta]](https://smithers.sh/images/docs/repo-home.light.webp)\n\nNext.\n")
})

test("the site page carries its source, summary and Markdown copy; the copy opens with the title", () => {
  const page = { title: "Welcome to Smithers", summary: "What Smithers is.", markdown: "Body with [Flows](flows.md).\n" }
  assert.equal(sitePage("welcome", page), [
    "---",
    "# GENERATED by apps/site/scripts/sync-app-docs.mjs. Edit apps/app/src/docs/pages/welcome.md.",
    "editUrl: https://github.com/smithersai/smithers/edit/main/apps/app/src/docs/pages/welcome.md",
    "title: \"Welcome to Smithers\"",
    "description: \"What Smithers is.\"",
    "head:",
    "  - tag: link",
    "    attrs:",
    "      rel: alternate",
    "      type: text/markdown",
    "      href: /docs/index.md",
    "---",
    "",
    "Body with [Flows](/docs/flows/).",
    ""
  ].join("\n"))
  assert.match(sitePage("flows", page), /^ {6}href: \/docs\/flows\.md$/m)
  assert.equal(markdownCopy(page), "# Welcome to Smithers\n\n> What Smithers is.\n\nBody with [Flows](https://smithers.sh/docs/flows/).\n")
})

test("the sidebar follows toc.ts, puts Install beside self-hosting and ends with the reference", () => {
  const reference = {
    label: "Reference",
    items: [
      { label: "HTTP and RPC API", slug: "docs/reference/http-api" },
      { label: "CLI", slug: "docs/reference/cli" },
      { label: "Library API", slug: "docs/reference/api" }
    ]
  }
  assert.deepEqual(sidebar([
    { label: "Get started", pages: ["welcome", "quickstart"] },
    { label: "On your own Mac", pages: ["self-host"] },
    { label: "Flows", pages: ["flows"] }
  ]), [
    { label: "Get started", items: [{ slug: "docs" }, { slug: "docs/quickstart" }] },
    { label: "On your own Mac", items: [{ slug: "docs/self-host" }, { slug: "docs/installation" }] },
    { label: "Flows", items: [{ slug: "docs/flows" }] },
    reference
  ])
  // Without its section, Install keeps a group of its own; a section with no published page is dropped.
  assert.deepEqual(sidebar([{ label: "Get started", pages: ["welcome"] }, { label: "Later", pages: [] }]), [
    { label: "Get started", items: [{ slug: "docs" }] },
    { label: "On your own Mac", items: [{ slug: "docs/installation" }] },
    reference
  ])
})

test("the script writes, checks and retires its files in a copied tree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sync-app-docs-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const name of ["sync-app-docs.mjs", "docs-text.mjs"]) cpSync(join(site, "scripts", name), join(root, "apps/site/scripts", name))
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  const read = (path) => readFileSync(join(root, path), "utf8")
  const run = (...args) => spawnSync(process.execPath, [join(root, "apps/site/scripts/sync-app-docs.mjs"), ...args], { encoding: "utf8" })
  const toc = (pages) => `export const TOC: ReadonlyArray<DocsSection> = [\n  { label: "Get started", pages: ${JSON.stringify(pages)} }\n]\n`
  put("apps/app/src/docs/toc.ts", toc(["welcome", "quickstart", "flows"]))
  put("apps/app/src/docs/pages/welcome.md", "---\ntitle: Welcome\nsummary: Start here.\n---\n\nRead [Flows](flows.md).\n")
  put("apps/app/src/docs/pages/flows.md", "---\ntitle: Flows\nsummary: Run flows.\n---\n\nBack [home](welcome.md).\n")
  put("apps/site/src/content/docs/docs/installation.mdx", "---\ntitle: Install\n---\n")
  // gen-cli-reference.mjs owns the copies under public/docs/reference/.
  put("apps/site/public/docs/reference/cli.md", "# CLI reference\n")

  const refused = run()
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /toc\.ts lists quickstart, but apps\/app\/src\/docs\/pages\/quickstart\.md does not exist/)
  assert.equal(existsSync(join(root, "apps/site/src/data/docs-sidebar.json")), false)

  put("apps/app/src/docs/toc.ts", toc(["welcome", "flows"]))
  const written = run()
  assert.equal(written.status, 0, written.stderr)
  assert.match(read("apps/site/src/content/docs/docs/index.md"), /^Read \[Flows\]\(\/docs\/flows\/\)\.$/m)
  assert.equal(read("apps/site/public/docs/flows.md"), "# Flows\n\n> Run flows.\n\nBack [home](https://smithers.sh/docs/).\n")
  assert.deepEqual(JSON.parse(read("apps/site/src/data/docs-sidebar.json"))[0], { label: "Get started", items: [{ slug: "docs" }, { slug: "docs/flows" }] })
  assert.equal(run("--check").status, 0)

  put("apps/app/src/docs/pages/flows.md", "---\ntitle: Flows\nsummary: Run every flow.\n---\n\nBack [home](welcome.md).\n")
  const edited = run("--check")
  assert.equal(edited.status, 1)
  assert.match(edited.stderr, /app docs drift: apps\/site\/src\/content\/docs\/docs\/flows\.md/)
  assert.match(edited.stderr, /app docs drift: apps\/site\/public\/docs\/flows\.md/)
  assert.match(edited.stderr, /run node apps\/site\/scripts\/sync-app-docs\.mjs/)

  put("apps/app/src/docs/toc.ts", toc(["welcome"]))
  const dropped = run("--check")
  assert.equal(dropped.status, 1)
  assert.match(dropped.stderr, /apps\/site\/public\/docs\/flows\.md is no longer in apps\/app\/src\/docs\/toc\.ts/)
  assert.equal(run().status, 0)
  assert.equal(existsSync(join(root, "apps/site/src/content/docs/docs/flows.md")), false)
  assert.equal(existsSync(join(root, "apps/site/public/docs/flows.md")), false)
  assert.equal(existsSync(join(root, "apps/site/src/content/docs/docs/installation.mdx")), true, "pages the projection did not write stay")
  assert.equal(read("apps/site/public/docs/reference/cli.md"), "# CLI reference\n", "another projection's copy stays")
  assert.equal(run("--check").status, 0)
})
