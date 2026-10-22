/**
 * Reading a docs index (`llms.txt`): its title, summary, sections and pages,
 * pages kept only on the index's own origin, bounds, fenced code skipped,
 * finding a page by its path, and searching titles, descriptions and
 * sections. VibeLang's own index, as vibelang.sh served it on 2026-10-21, is
 * the real-world case.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { Docs } from "../src/index.ts"

const INDEX = "https://docs.example.com/llms.txt"

const sample = [
  "# Example",
  "",
  "> A small library for examples.",
  "",
  "Some prose that is not a page.",
  "",
  "## Start",
  "",
  "- [Install](https://docs.example.com/install.md): Get it running",
  "- [Why Example?](https://docs.example.com/guide/why.md)",
  "",
  "```md",
  "- [Not a page](https://docs.example.com/fenced.md): inside a fence",
  "```",
  "",
  "## Guides",
  "",
  "- [Retrying](https://docs.example.com/guide/retrying.md): Error management",
  "- [Elsewhere](https://other.example.com/page.md): another origin",
  "- [Script](javascript:alert(1))",
  "- [Relative](/guide/relative.md): resolved against the index",
  "* [Starred](https://docs.example.com/guide/starred.md): a star bullet"
].join("\n")

describe("Docs.parse", () => {
  it("reads the title, the summary and each section's pages, in order", () => {
    const index = Docs.parse(sample, INDEX)
    expect(index.title).toBe("Example")
    expect(index.summary).toBe("A small library for examples.")
    expect(index.pages).toEqual([
      {
        title: "Install",
        url: "https://docs.example.com/install.md",
        path: "/install.md",
        description: "Get it running",
        section: "Start"
      },
      { title: "Why Example?", url: "https://docs.example.com/guide/why.md", path: "/guide/why.md", section: "Start" },
      {
        title: "Retrying",
        url: "https://docs.example.com/guide/retrying.md",
        path: "/guide/retrying.md",
        description: "Error management",
        section: "Guides"
      },
      {
        title: "Relative",
        url: "https://docs.example.com/guide/relative.md",
        path: "/guide/relative.md",
        description: "resolved against the index",
        section: "Guides"
      },
      {
        title: "Starred",
        url: "https://docs.example.com/guide/starred.md",
        path: "/guide/starred.md",
        description: "a star bullet",
        section: "Guides"
      }
    ])
  })

  it("keeps no page of another origin, no script link and nothing inside a fence", () => {
    const urls = Docs.parse(sample, INDEX).pages.map((page) => page.url)
    expect(urls.some((url) => url.includes("other.example.com"))).toBe(false)
    expect(urls.some((url) => url.startsWith("javascript:"))).toBe(false)
    expect(urls.some((url) => url.includes("fenced"))).toBe(false)
  })

  it("keeps no blob: link, though its origin is the index's", () => {
    const text =
      "# Docs\n\n- [Blob](blob:https://docs.example.com/0b5e): a blob\n- [Page](https://docs.example.com/page.md)"
    expect(Docs.parse(text, INDEX).pages.map((page) => page.url)).toEqual(["https://docs.example.com/page.md"])
  })

  it("an index with no title or pages is an empty index, never a failure", () => {
    expect(Docs.parse("", INDEX)).toEqual({ title: "", pages: [] })
    expect(Docs.parse("just prose\n- not a link", INDEX)).toEqual({ title: "", pages: [] })
  })

  it("keeps the first page at a path, and bounds titles, descriptions and the number of pages", () => {
    const long = "x".repeat(Docs.maximumTitleLength + 50)
    const text = [
      `- [${long}](https://docs.example.com/a.md): ${"y".repeat(Docs.maximumDescriptionLength + 50)}`,
      "- [Again](https://docs.example.com/a.md)",
      ...Array.from({ length: Docs.maximumPages + 10 }, (_, n) => `- [P${n}](https://docs.example.com/p/${n}.md)`)
    ].join("\n")
    const index = Docs.parse(text, INDEX)
    expect(index.pages[0]!.title).toHaveLength(Docs.maximumTitleLength)
    expect(index.pages[0]!.description).toHaveLength(Docs.maximumDescriptionLength)
    expect(index.pages.filter((page) => page.path === "/a.md")).toHaveLength(1)
    expect(index.pages).toHaveLength(Docs.maximumPages)
  })

  it("drops a page URL's query and fragment from its path, and an index URL that isn't https reads no pages", () => {
    const index = Docs.parse("- [Q](https://docs.example.com/q.md?x=1#top)", INDEX)
    expect(index.pages[0]).toMatchObject({ path: "/q.md", url: "https://docs.example.com/q.md" })
    expect(Docs.parse(sample, "not a url").pages).toEqual([])
    expect(Docs.parse(sample, "ftp://docs.example.com/llms.txt").pages).toEqual([])
  })
})

describe("Docs.find and Docs.search", () => {
  const index = Docs.parse(sample, INDEX)

  it("finds a page by its path", () => {
    expect(Docs.find(index, "/guide/retrying.md")?.title).toBe("Retrying")
    expect(Docs.find(index, "/nope.md")).toBeUndefined()
  })

  it("ranks title matches over descriptions and sections, and drops pages that match nothing", () => {
    expect(Docs.search(index, "retrying").map((page) => page.title)).toEqual(["Retrying"])
    expect(Docs.search(index, "error").map((page) => page.title)).toEqual(["Retrying"])
    expect(Docs.search(index, "guides why").map((page) => page.title)).toEqual([
      "Why Example?",
      "Retrying",
      "Relative",
      "Starred"
    ])
    expect(Docs.search(index, "zzz")).toEqual([])
  })

  it("a word inside another counts for less than one at a word's start; a page with no section is searched too", () => {
    const text = [
      "- [Overview](https://docs.example.com/overview.md): what it does",
      "## Errors",
      "- [Retrying](https://docs.example.com/retrying.md)",
      "- [Trying it out](https://docs.example.com/try.md)"
    ].join("\n")
    const mixed = Docs.parse(text, INDEX)
    expect(Docs.search(mixed, "trying").map((page) => page.title)).toEqual(["Trying it out", "Retrying"])
    expect(Docs.search(mixed, "does").map((page) => page.title)).toEqual(["Overview"])
  })

  it("an empty query, or one of punctuation, finds nothing; a limit caps the answer", () => {
    expect(Docs.search(index, "")).toEqual([])
    expect(Docs.search(index, " ?! ")).toEqual([])
    expect(Docs.search(index, "guides", 2)).toHaveLength(2)
  })
})

describe("VibeLang's index, as vibelang.sh serves it", () => {
  const text = readFileSync(fileURLToPath(new URL("./fixtures/vibelang-llms.txt", import.meta.url)), "utf8")
  const index = Docs.parse(text, "https://vibelang.sh/llms.txt")

  it("reads every listed page, none from the code in its Essentials", () => {
    expect(index.title).toBe("VibeLang")
    expect(index.pages).toHaveLength(164)
    expect(index.pages[0]).toEqual({
      title: "Welcome",
      url: "https://vibelang.sh/001-onboarding.md",
      path: "/001-onboarding.md",
      description: "Start Here",
      section: "Onboarding"
    })
  })

  it("finds the pages a person asks about", () => {
    expect(Docs.search(index, "retry")[0]?.title).toBe("Retrying")
    expect(Docs.search(index, "install vibelang")[0]?.title).toBe("Installation")
    expect(Docs.search(index, "vite").map((page) => page.path)).toContain("/setup/vite.md")
  })
})
