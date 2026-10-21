/**
 * The writer and the reader agree. `@smthrs/targets` writes
 * `.smithers/home.json` from `.smithers/FACTORY.ts` (`Smithers.Factory.Home`
 * and the `Smithers.Home` constructors); this package reads it where the home
 * is shown. Every block the writer accepts, the reader reads back unchanged,
 * and a block the writer refuses, the reader refuses too. `@smthrs/targets`
 * is Node-only and published, and this package is private, so the writer
 * keeps its own schema until this one is published; this test keeps the two
 * in step.
 */
import { Smithers } from "@smthrs/targets"
import { describe, expect, it } from "vitest"
import { Home } from "../src/index.ts"

const written = Smithers.Factory.Home({
  blocks: [
    Smithers.Home.Text({ title: "About", text: "A small HTTP server." }),
    Smithers.Home.Links({ links: [{ label: "Docs", url: "https://example.com/docs" }] }),
    Smithers.Home.Flows({ title: "Flows" }),
    Smithers.Home.Prompt({ flow: "flow.new", title: "What should we work on?", placeholder: "Ask Smithers…" }),
    Smithers.Home.Markdown({ path: "docs/intro.md", title: "Intro" }),
    Smithers.Home.Stack(),
    Smithers.Home.App({ flow: "issue.implement", title: "Fix an issue", picture: "issue" }),
    Smithers.Home.View({ flow: "release-notes" })
  ]
})

describe("the home @smthrs/targets writes", () => {
  it("reads back block for block, every kind included", () => {
    const read = Home.read(JSON.stringify({ blocks: written.blocks }))
    expect(read).toEqual({ _tag: "Declared", blocks: written.blocks, skipped: 0 })
    expect(new Set(written.blocks.map((block) => block.type))).toEqual(new Set(Home.kinds))
  })

  it("is refused by both sides alike when a block breaks a bound", () => {
    const refusals: ReadonlyArray<readonly [() => unknown, unknown]> = [
      [() => Smithers.Home.Text({ text: "<b>x</b>" }), { type: "text", text: "<b>x</b>" }],
      [() => Smithers.Home.Text({ title: "a".repeat(121), text: "x" }), {
        type: "text",
        title: "a".repeat(121),
        text: "x"
      }],
      [
        () => Smithers.Home.Links({ links: [{ label: "x", url: "javascript:x" }] }),
        { type: "links", links: [{ label: "x", url: "javascript:x" }] }
      ],
      [() => Smithers.Home.Markdown({ path: "../x.md" }), { type: "markdown", path: "../x.md" }],
      [
        () => Smithers.Home.App({ flow: "Bad Name", title: "x", picture: "issue" }),
        { type: "app", flow: "Bad Name", title: "x", picture: "issue" }
      ]
    ]
    for (const [write, block] of refusals) {
      expect(write).toThrow(TypeError)
      expect(Home.read(JSON.stringify({ blocks: [block] }))).toEqual({ _tag: "Invalid", reason: "block" })
    }
  })
})
