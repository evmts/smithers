import assert from "node:assert/strict"
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { test } from "node:test"
import {
  anchors, bannedPattern, body, checkCliContent, checkFrontmatter, checkHttps,
  checkToc, extractTerms, prose, read, readPages, slashReferences, tocSlugs, withoutFences
} from "./pageChecks.ts"

const pages = readPages()
const quickstart = pages.get("quickstart.md") ?? ""
const valid = '---\ntitle: "Example"\nsummary: "One line."\n---\n\n## Example\n'

test("every flat page has valid frontmatter; every toc entry matches a page when the toc exists", async () => {
  for (const markdown of pages.values()) checkFrontmatter(markdown)
  const tocPath = new URL("./toc.ts", import.meta.url)
  if (existsSync(tocPath)) checkToc(pages, tocSlugs(await import(tocPath.href)))
  else assert.equal(existsSync(tocPath), false, "The page directory is checked before T-APP-20 supplies the toc")
})

test("frontmatter accepts CRLF and rejects missing, extra, duplicate and multiline fields", () => {
  checkFrontmatter(valid.replace(/\n/g, "\r\n"))
  for (const markdown of [
    "## No frontmatter", valid.replace('summary: "One line."\n', ""),
    valid.replace("---\n\n##", 'label: "Available now"\n---\n\n##'),
    valid.replace('summary: "One line."', 'title: "Duplicate"'),
    valid.replace("One line.", "Two\nlines."), valid.replace("## Example", "# Example"),
    valid + "\nAvailable now\n", valid + "\n```\nplain\n```\n",
    valid + "\n```text\nunclosed\n", valid + "\n```text\nplain\n~~~\n",
    valid + "\n```text\nplain\n```text\n"
  ]) assert.throws(() => checkFrontmatter(markdown))
  checkFrontmatter(valid + "\n```text\noutput\n```\n")
})

test("page discovery rejects empty directories, subdirectories and non-page files", () => {
  const directory = mkdtempSync(join(tmpdir(), "inapp-docs-pages-"))
  const url = pathToFileURL(`${directory}/`)
  try {
    assert.throws(() => readPages(url), /No bundled pages/)
    writeFileSync(join(directory, "example.md"), valid)
    assert.deepEqual([...readPages(url).keys()], ["example.md"])
    writeFileSync(join(directory, "index.json"), "[]")
    assert.throws(() => readPages(url), /Not a flat page/)
    rmSync(join(directory, "index.json"))
    mkdirSync(join(directory, "nested.md"))
    assert.throws(() => readPages(url), /Not a flat page/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test("toc validation allows new pages and rejects missing, extra, duplicate or invalid entries", () => {
  const fixture = new Map([["first.md", valid], ["second.md", valid], ["third.md", valid]])
  checkToc(fixture, tocSlugs({ toc: ["third", "first", "second"] }))
  checkToc(fixture, tocSlugs({ toc: [{ slug: "first" }, { slug: "second" }, { slug: "third" }] }))
  for (const slugs of [["first", "second"], ["first", "second", "ghost"], ["first", "second", "second"]]) {
    assert.throws(() => checkToc(fixture, slugs))
  }
  for (const module of [{}, { toc: [] }, { toc: ["first"], other: ["second"] }, { toc: [null] }, { toc: [{}] }, { toc: ["../first"] }]) {
    assert.throws(() => tocSlugs(module))
  }
})

test("CLI scanning explicitly checks zero invocations and refuses an invocation it did not scan", () => {
  let called = 0
  assert.equal(checkCliContent(valid, () => { called++ }), 0)
  assert.equal(called, 0)
  assert.throws(() => checkCliContent("Run smthrs login.", () => { called++ }), /scans zero commands/)
  const seen: string[] = []
  const fixture = "Type `smthrs login`.\n\n```bash\nsmthrs doctor --help\n```\n"
  assert.equal(checkCliContent(fixture, line => { seen.push(line) }), 2)
  assert.deepEqual(seen, ["smthrs doctor --help", "smthrs login"])
  assert.throws(() => checkCliContent("`smthrs ghost`", () => { throw new Error("Unresolved command") }), /Unresolved command/)
})

test("slash scanning includes inline commands, group queries and fenced diagrams", () => {
  assert.deepEqual(slashReferences("`/` `/chat.` `/commands` `/chat.commands`\n```text\n/chat. -> /chat.commands\n```"),
    ["chat.", "chat.commands", "", "chat.", "commands", "chat.commands"])
  assert.deepEqual(slashReferences("https://smithers.sh/docs/installation/"), [])
  assert.ok([...pages.values()].flatMap(slashReferences).length > 0)
})

test("C-UI-02 extraction reads the current rule and fails closed on empty or malformed rules", () => {
  const check = read("../../../../.specs/engineering/checks/C-UI-02.md")
  const terms = extractTerms(check)
  assert.ok(terms.length > 0)
  assert.ok(terms.includes("box") && terms.includes("VM"))
  for (const source of ["", "- The banned-term list, exactly: task.", "- **R1 Banned terms.** No term list",
    "- **R1 Banned terms.** terms ()", "- **R1 Banned terms.** terms (task,)",
    "- **R1 Banned terms.** terms (task, Task)",
    "- **R1 Banned terms.** terms (task)\n- **R1 Banned terms.** terms (box)"]
  ) assert.throws(() => extractTerms(source))
  assert.throws(() => bannedPattern([]), /Empty banned-term list/)
})

test("C-UI-02 matches plurals and microVM at letter/digit boundaries, while taskbar passes", () => {
  const terms = extractTerms(read("../../../../.specs/engineering/checks/C-UI-02.md"))
  const pattern = bannedPattern(terms)
  for (const term of terms) for (const suffix of ["", "s", "es"]) {
    assert.match(`Open ${term.toUpperCase()}${suffix}.`, pattern)
  }
  for (const text of ["boxes", "microVM", "MICROvm", "task-list", "task_bar"]) assert.match(text, pattern)
  for (const text of ["taskbar", "Taskbars", "microVMware", "task2", "2task", "étask", "taské"]) {
    assert.doesNotMatch(text, pattern)
  }
  for (const markdown of pages.values()) assert.doesNotMatch(prose(markdown), pattern)
})

test("installation appears once and relative page links and headings resolve", () => {
  assert.equal([...quickstart.matchAll(/https:\/\/smithers\.sh\/docs\/installation\//g)].length, 1)
  for (const [name, markdown] of pages) {
    for (const match of withoutFences(body(markdown)).matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = match[1]!
      if (/^https?:\/\//.test(href)) {
        const url = new URL(href)
        if (url.hostname === "smithers.sh") assert.equal(url.pathname, "/docs/installation/")
        else if (url.hostname === "github.com" && url.pathname.startsWith("/smithersai/smithers/blob/main/")) {
          const path = url.pathname.slice("/smithersai/smithers/blob/main/".length)
          assert.ok(existsSync(new URL(`../../../../${path}`, import.meta.url)))
        }
        continue
      }
      const [target, anchor] = href.split("#")
      assert.ok(target === "" || /^[a-z-]+\.md$/.test(target!))
      const linked = pages.get(target || name)
      assert.ok(linked !== undefined, `Missing page: ${href}`)
      if (anchor !== undefined) assert.ok(anchors(linked).has(decodeURIComponent(anchor)), `Missing anchor: ${href}`)
    }
  }
  assert.deepEqual([...anchors("## Same\n## Same\n```text\n## Hidden\n```\n")], ["same", "same-1"])
})

test("HTTPS instructions are explicitly absent today; bundled examples require the fixed section", () => {
  checkHttps(pages)
  const instructions = "## Put HTTPS in front\n\nHTTPS\n```bash\ntailscale serve\nreverse_proxy\n```\n"
  checkHttps(new Map([["quickstart.md", instructions]]))
  for (const fixture of [
    new Map([["quickstart.md", "HTTPS"]]),
    new Map([["quickstart.md", instructions.replace("tailscale serve", "missing")]]),
    new Map([["quickstart.md", instructions.replace("reverse_proxy", "missing")]]),
    new Map([["quickstart.md", instructions + "\n## Other\nTailscale\n"]]),
    new Map([["quickstart.md", instructions], ["flows.md", "Caddy"]]),
    new Map([["flows.md", "Caddy"]]),
    new Map([["quickstart.md", "## Put HTTPS in front\n"]]),
    new Map([["quickstart.md", "## Put HTTPS in front"]])
  ]) assert.throws(() => checkHttps(fixture))
})
