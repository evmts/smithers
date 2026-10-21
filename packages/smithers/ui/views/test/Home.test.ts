/**
 * Reading a repository's home: every kind of block and every bound, HTML
 * refused, a kind this reader doesn't know skipped, and this repository's own
 * `.smithers/home.json` read as it is checked in.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { Home } from "../src/index.ts"

const home = (...blocks: ReadonlyArray<unknown>) => JSON.stringify({ blocks })
const declared = (...blocks: ReadonlyArray<unknown>) => Home.read(home(...blocks))
const invalid = (reason: Home.Invalid) => ({ _tag: "Invalid", reason })

const every: ReadonlyArray<Home.Block> = [
  { type: "text", title: "About", text: "A small HTTP server.\nFast." },
  { type: "links", title: "Elsewhere", links: [{ label: "Docs", url: "https://example.com/docs" }] },
  { type: "flows", title: "Flows" },
  { type: "prompt", flow: "flow.new", title: "What should we work on?", placeholder: "Ask Smithers…" },
  { type: "markdown", path: "docs/intro.md", title: "Intro" },
  { type: "stack" },
  { type: "app", flow: "issue.implement", title: "Fix an issue", picture: "issue" },
  { type: "view", flow: "release-notes" }
]

describe("Home.read", () => {
  it("reads every kind of block, in order, with nothing skipped", () => {
    expect(declared(...every)).toEqual({ _tag: "Declared", blocks: every, skipped: 0 })
    expect(new Set(every.map((block) => block.type))).toEqual(new Set(Home.kinds))
  })

  it("reads a home with no blocks, and a block's optional fields left out", () => {
    expect(declared()).toEqual({ _tag: "Declared", blocks: [], skipped: 0 })
    expect(declared({ type: "prompt" }, { type: "flows" })).toEqual({
      _tag: "Declared",
      blocks: [{ type: "prompt" }, { type: "flows" }],
      skipped: 0
    })
  })

  it("drops fields a block doesn't declare, and keys beside `blocks`", () => {
    expect(Home.read(JSON.stringify({ version: 2, blocks: [{ type: "text", text: "Hi", color: "red" }] }))).toEqual({
      _tag: "Declared",
      blocks: [{ type: "text", text: "Hi" }],
      skipped: 0
    })
  })

  it("skips a kind it doesn't know and counts it, keeping the rest", () => {
    expect(declared({ type: "chart", data: [1, 2] }, { type: "text", text: "Hi" }, { type: "runs" })).toEqual({
      _tag: "Declared",
      blocks: [{ type: "text", text: "Hi" }],
      skipped: 2
    })
  })

  it("refuses text that isn't JSON, or JSON that isn't a home", () => {
    expect(Home.read("{ blocks: [")).toEqual(invalid("json"))
    expect(Home.read("")).toEqual(invalid("json"))
    for (const text of ["null", "[]", "42", "\"home\"", "{}", "{\"blocks\":{}}", "{\"blocks\":null}"]) {
      expect([text, Home.read(text)]).toEqual([text, invalid("shape")])
    }
  })

  it("takes 32 blocks and refuses 33, unknown kinds counted", () => {
    const text = { type: "text", text: "Hi" }
    expect(declared(...Array.from({ length: Home.maximumBlocks }, () => text))).toMatchObject({ _tag: "Declared" })
    expect(declared(...Array.from({ length: Home.maximumBlocks }, () => text), { type: "chart" })).toEqual(
      invalid("blocks")
    )
  })

  it("refuses the whole home when a block of a known kind breaks its bounds", () => {
    const long = (length: number) => "a".repeat(length)
    const broken: ReadonlyArray<unknown> = [
      // A block that isn't one, or has no kind.
      "text",
      null,
      42,
      { text: "no type" },
      { type: 7, text: "a number for a type" },
      // Titles: empty, too long, two lines, HTML.
      { type: "text", title: "", text: "Hi" },
      { type: "text", title: long(Home.maximumTitleLength + 1), text: "Hi" },
      { type: "text", title: "One\nTwo", text: "Hi" },
      { type: "text", title: "<b>Bold</b>", text: "Hi" },
      // Text: missing, empty, too long, HTML of every shape.
      { type: "text" },
      { type: "text", text: "" },
      { type: "text", text: long(Home.maximumTextLength + 1) },
      { type: "text", text: "<script>alert(1)</script>" },
      { type: "text", text: "a </p> b" },
      { type: "text", text: "<!-- hidden -->" },
      { type: "text", text: "<?xml?>" },
      // Links: none, a scheme other than http(s), a relative URL, spaces, too long, an HTML label.
      { type: "links", links: [] },
      { type: "links", links: [{ label: "Run", url: "javascript:alert(1)" }] },
      { type: "links", links: [{ label: "Data", url: "data:text/html,hi" }] },
      { type: "links", links: [{ label: "Here", url: "/app" }] },
      { type: "links", links: [{ label: "Space", url: "https://exa mple.com" }] },
      { type: "links", links: [{ label: "Quote", url: "https://example.com/\"x" }] },
      { type: "links", links: [{ label: "Long", url: `https://example.com/${long(Home.maximumUrlLength)}` }] },
      { type: "links", links: [{ label: "<i>x</i>", url: "https://example.com" }] },
      // Markdown paths that leave the repository or aren't plain.
      { type: "markdown", path: "/etc/passwd" },
      { type: "markdown", path: "../secrets.md" },
      { type: "markdown", path: "docs/./a.md" },
      { type: "markdown", path: "docs//a.md" },
      { type: "markdown", path: "docs\\a.md" },
      { type: "markdown", path: "docs/a.md?x" },
      { type: "markdown", path: "a%2e%2e/b.md" },
      { type: "markdown", path: "c:/a.md" },
      { type: "markdown", path: "a\u0000.md" },
      { type: "markdown", path: long(1025) },
      { type: "markdown" },
      // Flow names, pictures, and a view with no flow.
      { type: "app", flow: "Issue.Implement", title: "Fix", picture: "issue" },
      { type: "app", flow: "issue..implement", title: "Fix", picture: "issue" },
      { type: "app", flow: "issue.implement", title: "Fix", picture: "rocket" },
      { type: "app", flow: "issue.implement", picture: "issue" },
      { type: "prompt", flow: "" },
      { type: "prompt", placeholder: "<em>Ask</em>" },
      { type: "view" }
    ]
    for (const block of broken) {
      expect([block, declared({ type: "text", text: "Before" }, block)]).toEqual([block, invalid("block")])
    }
  })

  it("keeps prose that mentions a comparison", () => {
    expect(declared({ type: "text", text: "Use a < b and b > a." })).toMatchObject({ _tag: "Declared" })
  })

  it("reads this repository's own home as it is checked in", () => {
    const file = fileURLToPath(new URL(`../../../../../${Home.path}`, import.meta.url))
    const read = Home.read(readFileSync(file, "utf8"))
    expect(read).toMatchObject({ _tag: "Declared", skipped: 0 })
    expect(read._tag === "Declared" && read.blocks.map((block) => block.type)).toContain("prompt")
  })
})
