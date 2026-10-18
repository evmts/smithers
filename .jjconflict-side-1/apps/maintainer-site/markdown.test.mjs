import assert from "node:assert/strict"
import { test } from "node:test"
import { renderMarkdown, slugify, splitFrontmatter } from "./markdown.mjs"

const html = (source, options) => renderMarkdown(source, options).html

test("headings get GitHub's anchors, numbered when repeated", () => {
  const out = renderMarkdown("# Title\n\n## `GET /api/shapes/messages`\n\n## Everything is a durable flow (Will, 2026-10-19, permanent)\n\n## Tests\n\n## Tests\n")
  assert.deepEqual(
    out.headings.map((heading) => heading.id),
    ["title", "get-apishapesmessages", "everything-is-a-durable-flow-will-2026-10-19-permanent", "tests", "tests-1"],
  )
  assert.equal(out.title, "Title")
  assert.equal(slugify("State: one framework-free state machine"), "state-one-framework-free-state-machine")
})

test("emphasis follows CommonMark, and underscores inside words stay literal", () => {
  assert.equal(html("**bold** *em* _em_ ***both*** snake_case_name ~~gone~~"), "<p><strong>bold</strong> <em>em</em> <em>em</em> <em><strong>both</strong></em> snake_case_name <del>gone</del></p>")
  assert.equal(html("2 * 3 * 4 and a*b*c"), "<p>2 * 3 * 4 and a<em>b</em>c</p>")
  assert.equal(html("**unclosed *pair"), "<p>**unclosed *pair</p>")
})

test("HTML in text is escaped; allowlisted HTML blocks are sanitized", () => {
  assert.equal(html("a <script>alert(1)</script> & b"), "<p>a &lt;script&gt;alert(1)&lt;/script&gt; &amp; b</p>")
  assert.equal(html('<p align="center" onclick="x()"><strong>Hi</strong></p>'), '<p align="center"><strong>Hi</strong></p>')
  assert.equal(html('<img src="javascript:alert(1)" onerror="x()">'), "<img>")
  assert.equal(html("<!-- generated -->\n\ntext"), "\n<p>text</p>")
  assert.equal(html("[x](javascript:alert(1))"), "<p><a>x</a></p>")
  assert.equal(html("`<b>` &amp; &copy;"), "<p><code>&lt;b&gt;</code> &amp; &copy;</p>")
})

test("fenced, indented and list-nested code is escaped and kept verbatim", () => {
  assert.equal(html("```ts\nconst a = 1 < 2\n```"), '<pre data-lang="ts"><code class="language-ts">const a = 1 &lt; 2</code></pre>')
  assert.equal(html("    indented <code>\n"), "<pre><code>indented &lt;code&gt;</code></pre>")
  const nested = html("1. Check it:\n\n   ```sh\n   curl -i x\n   ```\n\n2. Next")
  assert.match(nested, /<ol>\n<li><p>Check it:<\/p>\n<pre data-lang="sh"><code class="language-sh">curl -i x<\/code><\/pre><\/li>\n<li><p>Next<\/p><\/li>\n<\/ol>/)
})

test("nested lists: tight items have no paragraphs, lazy lines continue, indented paragraphs make the list loose", () => {
  assert.equal(html("- a\n  - b\n  - c\n- d"), "<ul>\n<li>a\n<ul>\n<li>b</li>\n<li>c</li>\n</ul></li>\n<li>d</li>\n</ul>")
  assert.equal(html("- one\ntwo\n- three"), "<ul>\n<li>one\ntwo</li>\n<li>three</li>\n</ul>")
  const loose = html("- **Id.** On:\n  - a;\n  - b.\n\n  After.\n- Next")
  assert.match(loose, /<li><p><strong>Id\.<\/strong> On:<\/p>\n<ul>\n<li>a;<\/li>\n<li>b\.<\/li>\n<\/ul>\n<p>After\.<\/p><\/li>\n<li><p>Next<\/p><\/li>/)
  assert.equal(html("3. c\n4. d"), '<ol start="3">\n<li>c</li>\n<li>d</li>\n</ol>')
  assert.equal(html("Text:\n- item"), "<p>Text:</p>\n<ul>\n<li>item</li>\n</ul>")
  assert.equal(html("- [x] done\n- [ ] todo"), '<ul>\n<li class="task"><input type="checkbox" disabled checked> done</li>\n<li class="task"><input type="checkbox" disabled> todo</li>\n</ul>')
})

test("tables keep alignment and escaped pipes", () => {
  const out = html("| A | B |\n|:--|--:|\n| `a\\|b` | x |\n| short |")
  assert.equal(
    out,
    '<div class="table-wrap"><table><thead><tr><th style="text-align:left">A</th><th style="text-align:right">B</th></tr></thead><tbody><tr><td style="text-align:left"><code>a|b</code></td><td style="text-align:right">x</td></tr>\n<tr><td style="text-align:left">short</td><td style="text-align:right"></td></tr></tbody></table></div>',
  )
})

test("blockquotes, GitHub alerts, rules and hard breaks", () => {
  assert.equal(html("> quoted\nlazy"), "<blockquote><p>quoted\nlazy</p></blockquote>")
  assert.equal(html("> [!TIP]\n> Ask."), '<div class="callout callout-tip"><p class="callout-title">Tip</p><p>Ask.</p></div>')
  assert.equal(html("a  \nb\\\nc\n\n---"), "<p>a<br>\nb<br>\nc</p>\n<hr>")
  assert.equal(html("Title\n====="), '<h1 id="title">Title</h1>')
})

test("links resolve through the caller, record notes for backlinks, and wikilinks resolve by name", () => {
  const options = {
    link: (href) => (href.startsWith("state.md") ? { href: "#/state", note: "state.md", anchor: href.split("#")[1] ?? "" } : { href }),
    wikilink: (target) => (target === "State" ? { href: "#/state", note: "state.md", label: "State" } : null),
    image: (src) => ({ href: `files/${src}` }),
  }
  const out = renderMarkdown("See [the *state*](state.md#rules \"Rules\") and [[State]], [[Missing|gone]].\n\n![Diagram](d.png) <https://a.b> https://x.dev/a_(b), www.c.org.", options)
  assert.match(out.html, /<a href="#\/state" title="Rules">the <em>state<\/em><\/a>/)
  assert.match(out.html, /<a data-wikilink="State" href="#\/state">State<\/a>/)
  assert.match(out.html, /<a data-wikilink="Missing" class="broken" title="No note named Missing">gone<\/a>/)
  assert.match(out.html, /<img src="files\/d.png" alt="Diagram" loading="lazy">/)
  assert.match(out.html, /<a href="https:\/\/a.b">https:\/\/a.b<\/a>/)
  assert.match(out.html, /<a href="https:\/\/x.dev\/a_\(b\)">https:\/\/x.dev\/a_\(b\)<\/a>, <a href="http:\/\/www.c.org">www.c.org<\/a>\./)
  assert.deepEqual(
    out.links.map(({ note, anchor, label }) => ({ note, anchor, label })),
    [
      { note: "state.md", anchor: "rules", label: "the state" },
      { note: "state.md", anchor: "", label: "State" },
    ],
  )
  assert.equal(out.links[0].context, "See the state and State, gone.")
})

test("reference links and sections for search", () => {
  const out = renderMarkdown("# Doc\n\nIntro [ref].\n\n[ref]: https://r.dev \"R\"\n\n## Part\n\nBody **text**.\n")
  assert.match(out.html, /<a href="https:\/\/r.dev" title="R">ref<\/a>/)
  assert.deepEqual(out.sections, [
    { id: "doc", heading: "Doc", level: 1, text: "Intro ref." },
    { id: "part", heading: "Part", level: 2, text: "Body text." },
  ])
})

test("front matter: strings, quoted strings, flow and block lists; the body is what follows", () => {
  const source = [
    "---",
    "title: Durable answering: the plan",
    "status: in-progress # a comment",
    'owner: "W1, W2"',
    "links: [../a.md, 'b, c.md', ]",
    "tags:",
    "  - one",
    "  - 'two'",
    "empty:",
    "---",
    "",
    "## What",
  ].join("\n")
  const { data, body, errors } = splitFrontmatter(source)
  assert.deepEqual(data, { title: "Durable answering: the plan", status: "in-progress", owner: "W1, W2", links: ["../a.md", "b, c.md"], tags: ["one", "two"], empty: "" })
  assert.equal(body, "\n## What")
  assert.deepEqual(errors, [])
  assert.equal(renderMarkdown(body).html, '<h2 id="what">What</h2>')
})

test("front matter: none without a leading fence or a closing one, and bad lines are reported", () => {
  for (const source of ["# Title\n\n---\nkey: value\n---\n", "---\nkey: value\nno end\n", "text"]) {
    assert.deepEqual(splitFrontmatter(source), { data: null, body: source, errors: [] })
  }
  const { data, errors } = splitFrontmatter("﻿---\r\nkey: value\r\njust words\r\n- stray item\r\n...\r\nbody")
  assert.deepEqual(data, { key: "value" })
  assert.deepEqual(errors, ["line 3: just words", "line 4: - stray item"])
})
