import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { headingLine } from "../mainview/cards/MarkdownLinks"
import { diskImageFiles, diskPageFiles } from "./DiskPages"
import { docsLinkTarget, docsPage, loadDocs, parsePage, type Docs } from "./Docs"
import { TOC } from "./toc"

/*
 * The in-app docs (M-35): one Markdown file per page under pages/, ordered by
 * toc.ts. Bun's test runner has no import.meta.glob, so these suites read the
 * same files from disk (DiskPages.ts) that Vite inlines into the build
 * (bundled.ts). The first three tests hold the shipped pages to the contract;
 * the rest pin the parser, the loader and the link rule on small inputs.
 */

const files = diskPageFiles()
const imageFiles = diskImageFiles()
const slugOf = (path: string): string => path.replace(/^\.\/pages\//, "").replace(/\.md$/, "")

/** The lines of a page's Markdown outside fenced code. */
const proseLines = (markdown: string): Array<string> => {
  const lines: Array<string> = []
  let fenced = false
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (!fenced) lines.push(line)
  }
  return lines
}

/**
 * Every link target in a page's Markdown, outside fenced code: inline
 * `[text](href)` and reference `[id]: href`. An image, `![alt](src)`, is not
 * a link: imagesOf checks it.
 */
const hrefsOf = (markdown: string): Array<string> => {
  const hrefs: Array<string> = []
  for (const line of proseLines(markdown)) {
    for (const match of line.matchAll(/(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      if (match[1] === "") hrefs.push(match[2]!)
    }
    const reference = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/.exec(line)
    if (reference !== null) hrefs.push(reference[1]!)
  }
  return hrefs
}

/** Every image in a page's Markdown, outside fenced code, with its alt text and source. */
const imagesOf = (markdown: string): Array<{ readonly alt: string; readonly src: string; readonly block: boolean }> =>
  proseLines(markdown).flatMap((line) =>
    [...line.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?\s*\)/g)].map((match) => ({
      alt: match[1]!,
      src: match[2]!,
      block: match[0] === line.trim()
    })))

/**
 * What is wrong with the pages' screenshots: each is a block image on its own
 * line, `![Alt text](images/<id>.webp)`, with alt text, and both of its theme
 * files exist on disk.
 */
const imageProblems = (docs: Docs, onDisk: Readonly<Record<string, string>>): Array<string> =>
  docs.pages.flatMap((page) => imagesOf(page.markdown).flatMap(({ alt, src, block }) => {
    const where = `${page.slug}.md → ${src}`
    const problems: Array<string> = []
    if (!block) problems.push(`${where}: not on a line of its own`)
    if (alt.trim() === "") problems.push(`${where}: no alt text`)
    const id = /^images\/([a-z0-9]+(?:-[a-z0-9]+)*)\.webp$/.exec(src)?.[1]
    if (id === undefined) return [...problems, `${where}: not images/<id>.webp`]
    for (const variant of ["light", "dark"] as const) {
      const file = onDisk[`./images/${id}.${variant}.webp`]
      if (docs.images[src]?.[variant] === undefined || file === undefined || !existsSync(file)) {
        problems.push(`${where}: no images/${id}.${variant}.webp`)
      }
    }
    return problems
  }))

describe("the shipped pages", () => {
  test("every toc slug has a page, and every page is in the toc exactly once", () => {
    const listed = TOC.flatMap((section) => section.pages)
    expect(Object.keys(files).length).toBeGreaterThan(0)
    for (const path of Object.keys(files)) expect(path).toMatch(/^\.\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/)
    expect([...listed].sort()).toEqual(Object.keys(files).map(slugOf).sort())
    expect(new Set(listed).size).toBe(listed.length)
    for (const section of TOC) {
      expect(section.label.trim()).not.toBe("")
      expect(section.pages.length).toBeGreaterThan(0)
    }
  })

  test("every page's frontmatter is exactly a non-empty title and summary", () => {
    for (const [path, source] of Object.entries(files)) {
      const page = parsePage(source)
      expect({ path, error: "error" in page ? page.error : undefined }).toEqual({ path, error: undefined })
      if ("error" in page) continue
      expect(page.title.trim()).not.toBe("")
      expect(page.summary.trim()).not.toBe("")
    }
  })

  test("every relative link and #anchor resolves to a page and a heading on it", () => {
    const docs = loadDocs(files)
    let checked = 0
    for (const page of docs.pages) {
      for (const href of hrefsOf(page.markdown)) {
        const target = docsLinkTarget(page.slug, href)
        if (target.kind === "external") continue
        checked += 1
        const where = `${page.slug}.md → ${href}`
        expect({ where, kind: target.kind }).not.toEqual({ where, kind: "blocked" })
        if (target.kind === "blocked") continue
        const destination = target.kind === "page" ? docsPage(docs, target.slug) : page
        expect({ where, found: destination !== undefined }).toEqual({ where, found: true })
        if (destination === undefined || target.fragment === undefined) continue
        // The card scrolls to an anchor by this rule (cards/MarkdownLinks.ts headingLine).
        expect({ where, line: headingLine(destination.markdown, target.fragment) === undefined ? "missing" : "found" })
          .toEqual({ where, line: "found" })
      }
    }
    // The seed pages link to each other, so this test is never vacuous.
    expect(checked).toBeGreaterThan(0)
  })

  test("every screenshot is a block image with alt text and both theme files", () => {
    expect(imageProblems(loadDocs(files, TOC, imageFiles), imageFiles)).toEqual([])
    for (const path of Object.keys(imageFiles)) expect(path).toMatch(/^\.\/images\/[a-z0-9]+(?:-[a-z0-9]+)*\.(light|dark)\.webp$/)
  })
})

describe("page screenshots", () => {
  // The fixture page lives here because the shipped pages change. A real file
  // stands in for both theme files, so the on-disk check runs for real.
  const file = fileURLToPath(new URL("./Docs.ts", import.meta.url))
  const pair = { "./images/home.light.webp": file, "./images/home.dark.webp": file }

  test("an image is not a link, and a link to an image file stays blocked", () => {
    expect(hrefsOf("![The home](images/home.webp)\n\nSee [Flows](flows.md) and [the logo](logo.png).")).toEqual(["flows.md", "logo.png"])
    expect(imagesOf("![The home](images/home.webp)\n\nSee [Flows](flows.md).")).toEqual([{ alt: "The home", src: "images/home.webp", block: true }])
    expect(imagesOf("```\n![Not an image](images/home.webp)\n```")).toEqual([])
  })

  test("names each screenshot without alt text, off its own line, outside images/, or missing a theme file", () => {
    const page = (markdown: string) => `---\ntitle: Fixture\nsummary: A page with screenshots.\n---\n${markdown}\n`
    const docs = loadDocs({ "./pages/fixture.md": page([
      "![The repository home](images/home.webp)",
      "",
      "![](images/home.webp)",
      "",
      "Inline ![The home](images/home.webp) here.",
      "",
      "![The logo](logo.png)",
      "",
      "![Half a pair](images/gone.webp)"
    ].join("\n")) }, [{ label: "One", pages: ["fixture"] }], pair)
    expect(imageProblems(docs, pair)).toEqual([
      "fixture.md → images/home.webp: no alt text",
      "fixture.md → images/home.webp: not on a line of its own",
      "fixture.md → logo.png: not images/<id>.webp",
      "fixture.md → images/gone.webp: no images/gone.light.webp",
      "fixture.md → images/gone.webp: no images/gone.dark.webp"
    ])
    // The same page passes once the pair is on disk and the prose is fixed.
    const fixed = loadDocs({ "./pages/fixture.md": page("![The repository home](images/home.webp)") },
      [{ label: "One", pages: ["fixture"] }], pair)
    expect(imageProblems(fixed, pair)).toEqual([])
    expect(imageProblems(fixed, { ...pair, "./images/home.dark.webp": `${file}.missing` }))
      .toEqual(["fixture.md → images/home.webp: no images/home.dark.webp"])
  })
})

describe("parsePage", () => {
  test("reads the title and summary and keeps the Markdown after the closing fence", () => {
    expect(parsePage("---\ntitle: Quickstart\nsummary: Run your first flow.\n---\n\n## Open a flow\n\nType /.\n")).toEqual({
      title: "Quickstart",
      summary: "Run your first flow.",
      markdown: "## Open a flow\n\nType /.\n"
    })
    // Key order is free; a colon inside a value is the value's own.
    expect(parsePage("---\nsummary: One: two\ntitle: Flows\n---\nBody")).toEqual({ title: "Flows", summary: "One: two", markdown: "Body" })
  })

  test("refuses a page without frontmatter, or whose frontmatter never closes", () => {
    expect(parsePage("# Quickstart\n")).toEqual({ error: "The page must open with a --- frontmatter block." })
    expect(parsePage("---\ntitle: Quickstart\nsummary: Run.\n")).toEqual({ error: "The frontmatter block never closes with ---." })
  })

  test("refuses a missing, extra, repeated or empty key, and a line that is not key: value", () => {
    expect(parsePage("---\ntitle: Quickstart\n---\n")).toEqual({ error: "The frontmatter is missing summary." })
    expect(parsePage("---\nsummary: Run.\n---\n")).toEqual({ error: "The frontmatter is missing title." })
    expect(parsePage("---\ntitle: Q\nsummary: S\ntags: a\n---\n")).toEqual({ error: "The frontmatter key tags is not title or summary." })
    expect(parsePage("---\ntitle: Q\ntitle: R\nsummary: S\n---\n")).toEqual({ error: "The frontmatter repeats title." })
    expect(parsePage("---\ntitle:\nsummary: S\n---\n")).toEqual({ error: "The frontmatter title is empty." })
    expect(parsePage("---\ntitle: Q\nsummary: S\nloose text\n---\n")).toEqual({ error: "The frontmatter line \"loose text\" is not key: value." })
  })
})

describe("loadDocs", () => {
  const page = (title: string): string => `---\ntitle: ${title}\nsummary: About ${title}.\n---\n# ${title}\n`
  const pages = { "./pages/b.md": page("B"), "./pages/a.md": page("A") }
  const toc = [{ label: "One", pages: ["a", "b"] }]

  test("pairs each screenshot's light and dark files under the source a page writes", () => {
    const docs = loadDocs(pages, toc, {
      "./images/repo-home.dark.webp": "/assets/repo-home.dark-2.webp",
      "./images/repo-home.light.webp": "/assets/repo-home.light-1.webp"
    })
    expect(docs.images).toEqual({ "images/repo-home.webp": { light: "/assets/repo-home.light-1.webp", dark: "/assets/repo-home.dark-2.webp" } })
    expect(loadDocs(pages, toc).images).toEqual({})
  })

  test("refuses a screenshot file that is not <id>.light.webp or <id>.dark.webp, or lacks its other theme", () => {
    for (const name of ["Home.light.webp", "home.webp", "home.dim.webp", "home.light.png"]) {
      expect(() => loadDocs(pages, toc, { [`./images/${name}`]: "/x" })).toThrow(`images/${name} is not named <id>.light.webp or <id>.dark.webp.`)
    }
    expect(() => loadDocs(pages, toc, { "./images/home.light.webp": "/x" })).toThrow("images/home.light.webp has no images/home.dark.webp.")
    expect(() => loadDocs(pages, toc, { "./images/home.dark.webp": "/x" })).toThrow("images/home.dark.webp has no images/home.light.webp.")
  })

  test("orders the pages by the toc, whatever order the files arrive in", () => {
    const docs = loadDocs(pages, [{ label: "One", pages: ["a"] }, { label: "Two", pages: ["b"] }])
    expect(docs.pages.map((entry) => entry.slug)).toEqual(["a", "b"])
    expect(docsPage(docs, "b")).toEqual({ slug: "b", title: "B", summary: "About B.", markdown: "# B\n" })
    expect(docsPage(docs, "c")).toBeUndefined()
  })

  test("refuses a toc slug without a page, a page outside the toc, a slug listed twice, and an empty toc", () => {
    expect(() => loadDocs(pages, [{ label: "One", pages: ["a", "b", "c"] }])).toThrow("toc.ts lists c, but pages/c.md does not exist.")
    expect(() => loadDocs(pages, [{ label: "One", pages: ["a"] }])).toThrow("pages/b.md is not in toc.ts.")
    expect(() => loadDocs(pages, [{ label: "One", pages: ["a", "b"] }, { label: "Two", pages: ["a"] }])).toThrow("toc.ts lists a twice.")
    expect(() => loadDocs({}, [])).toThrow("toc.ts lists no pages.")
  })

  test("refuses a file whose name is not a slug, and names the file whose frontmatter is wrong", () => {
    expect(() => loadDocs({ "./pages/Read Me.md": page("A") }, [{ label: "One", pages: ["a"] }])).toThrow("pages/Read Me.md is not named <slug>.md.")
    expect(() => loadDocs({ "./pages/a.md": "# A\n" }, [{ label: "One", pages: ["a"] }]))
      .toThrow("pages/a.md: The page must open with a --- frontmatter block.")
  })
})

describe("docsLinkTarget", () => {
  test("a sibling .md file is a page, with its anchor when it has one", () => {
    expect(docsLinkTarget("quickstart", "flows.md")).toEqual({ kind: "page", slug: "flows" })
    expect(docsLinkTarget("quickstart", "./flows.md#what-a-flow-is")).toEqual({ kind: "page", slug: "flows", fragment: "what-a-flow-is" })
  })

  test("a bare #anchor is this page's heading", () => {
    expect(docsLinkTarget("quickstart", "#open-a-flow")).toEqual({ kind: "fragment", fragment: "open-a-flow" })
  })

  test("web links are the browser's; anything that is not a sibling page goes nowhere", () => {
    expect(docsLinkTarget("quickstart", "https://smithers.sh")).toEqual({ kind: "external" })
    for (const href of ["guides/setup.md", "../README.md", "logo.png", "flows", "javascript:alert(1)", ""]) {
      expect({ href, target: docsLinkTarget("quickstart", href) }).toEqual({ href, target: { kind: "blocked" } })
    }
  })
})
