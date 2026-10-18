import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DeclaredTabView } from "./DeclaredTabView"
import { docsLink, docsNavigation, docsFileTitle, readDeclaredTabs, readDeclaredContent } from "./DeclaredTabsData"
import { RepoFrame } from "./RepoFrame"

const docs = { type: "docs" as const, title: "Docs", root: "docs", index: "01.md", nav: "inventory.md" }
const evaluation = { type: "eval" as const, title: "Golden set", suite: "golden", cases: "golden", command: "node score.mjs" }
const read = (paths: Record<string, unknown>, config: unknown = { tabs: [docs, evaluation] }) => readDeclaredTabs({ baseUrl: "", http: async url => {
  const path = decodeURIComponent(url.split("/contents/")[1] ?? "")
  if (path === ".smithers/ui/tabs.json") return Response.json({ content: JSON.stringify(config), encoding: "utf-8" })
  return paths[path] === undefined ? new Response(null, { status: 404 }) : Response.json(typeof paths[path] === "string" ? { content: paths[path], encoding: "utf-8" } : paths[path])
}}, "o/r")
const paths = { "inventory.md": "## Guide\n- [First](docs/01.md)\n- [Second](docs/02.md)", docs: [{ name: "02.md", type: "file" }, { name: "01.md", type: "file" }], "docs/01.md": "# First\n\n[Next](02.md)", "docs/02.md": "# Second", golden: [{ name: "01-basic", type: "dir" }], "golden/01-basic": [{ name: "input.ts", type: "file" }, { name: "expected.effeck", type: "file" }], "golden/01-basic/input.ts": "const x = 1", "golden/01-basic/expected.effeck": "let x = 1" }
const open = async (data: Awaited<ReturnType<typeof read>>, selection: string, type = "docs") => {
  const tab = data.tabs.find(tab => tab.declaration.type === type)!
  tab.files = await readDeclaredContent({ baseUrl: "", http: async url => {
    const body = paths[decodeURIComponent(url.split("/contents/")[1] ?? "") as keyof typeof paths]
    return Response.json(typeof body === "string" ? { content: body, encoding: "utf-8" } : body)
  }}, "o/r", tab, selection)
  tab.reads = { [selection]: { state: "loaded" } }
  return data
}
test("loads navigation and case folders without page or case content", async () => {
  const result = await read(paths)
  expect(result.tabs[0]!.navigation?.filter(page => page.path).map(page => page.title)).toEqual(["First", "Second"])
  expect(result.tabs[0]!.files).toEqual([])
  expect(result.tabs[1]!.cases).toEqual(["01-basic"])
  expect(result.tabs[1]!.files).toEqual([])
})
test("rewrites relative markdown links, preserving queries and anchors", () => {
  expect(docsLink("o/r", "guide/first.md", "../next.md#hello")).toBe("/o/r/docs/next.md#hello")
  expect(docsLink("o/r", "first.md", "https://example.com/page.md")).toBe("https://example.com/page.md")
  expect(docsLink("o/r", "first.md", "#hello")).toBe("#hello")
})
test("failed reads are errors, never empty listings", async () => {
  const result = await read({})
  expect(result.tabs[0]!.error).toContain("404")
  const html = renderToStaticMarkup(<DeclaredTabView repo="o/r" subject={{ kind: "docs" }} data={result} signedIn={false} retry={() => {}} onAsk={() => {}}/>)
  expect(html).toContain("Retry")
  expect(html).not.toContain("No docs yet")
})
test("undeclared routes are not found; a pending read is loading", () => {
  const props = { repo: "o/r", subject: { kind: "docs" as const }, signedIn: false, retry: () => {}, onAsk: () => {} }
  expect(renderToStaticMarkup(<DeclaredTabView {...props} data={{ tabs: [] }}/>)).toContain("Not found")
  expect(renderToStaticMarkup(<DeclaredTabView {...props}/>)).toContain("Loading")
})
test("docs renders the index, page navigation and rewritten link", async () => {
  const data = await open(await read(paths), "01.md")
  const html = renderToStaticMarkup(<DeclaredTabView repo="o/r" subject={{ kind: "docs" }} data={data} signedIn retry={() => {}} onAsk={() => {}}/>)
  expect(html).toContain('href="/o/r/docs/02.md"')
  expect(html).toContain("Ask about this page")
  expect(html).toContain("<h1")
})
test("eval is held with a copyable command and no invented verdict", async () => {
  const data = await open(await read(paths), "01-basic", "eval")
  const html = renderToStaticMarkup(<DeclaredTabView repo="o/r" subject={{ kind: "evals", suite: "golden", case: "01-basic" }} data={data} signedIn={false} retry={() => {}} onAsk={() => {}}/>)
  expect(html).toContain("Hosted runs arrive later. Run it locally:")
  expect(html).toContain("node score.mjs")
  expect(html).toContain("input.ts")
  expect(html).toContain("expected.effeck")
  expect(html).not.toMatch(/Pass|Fail|Score/)
})
test("frame includes only declared tabs and selects nested docs", () => {
  const previous = globalThis.window
  Object.assign(globalThis, { window: { location: { pathname: "/o/r/docs/01.md" } } })
  try {
    const props = { repo: "o/r", ask: null, onRunCommand: () => {}, onAsk: () => {}, onSignIn: () => {}, children: null }
    expect(renderToStaticMarkup(<RepoFrame {...props}/>)).not.toContain('href="/o/r/docs"')
    const html = renderToStaticMarkup(<RepoFrame {...props} declaredTabs={[docs, evaluation]}/>)
    expect(html).toContain('href="/o/r/docs" aria-current="page"')
    expect(html).toContain('href="/o/r/evals/golden"')
  } finally { Object.assign(globalThis, { window: previous }) }
})

test("fallback titles strip numeric prefixes and dashes", () => {
  expect(docsFileTitle("getting-started/001-first-page.md")).toBe("first page")
  expect(docsFileTitle("01.md")).toBe("01")
})
test("a missing declaration is absent, a failed config read is an error", async () => {
  expect(await readDeclaredTabs({ baseUrl: "", http: async () => new Response(null, { status: 404 }) }, "o/r")).toEqual({ tabs: [] })
  expect((await readDeclaredTabs({ baseUrl: "", http: async () => new Response(null, { status: 503 }) }, "o/r")).error).toContain("503")
})
test("public docs remain readable signed out with a sign-in action", async () => {
  const data = await open(await read(paths), "01.md")
  const html = renderToStaticMarkup(<DeclaredTabView repo="o/r" subject={{ kind: "docs" }} data={data} signedIn={false} retry={() => {}} onAsk={() => {}}/>)
  expect(html).toContain("First")
  expect(html).toContain(">Sign in</button>")
})
test("an empty docs tree and empty suite stay distinct from read failure", async () => {
  const data = await read({ "inventory.md": "# Empty", golden: [] })
  const props = { repo: "o/r", data, signedIn: true, retry: () => {}, onAsk: () => {} }
  expect(renderToStaticMarkup(<DeclaredTabView {...props} subject={{ kind: "docs" }}/>)).toContain("No docs yet")
  expect(renderToStaticMarkup(<DeclaredTabView {...props} subject={{ kind: "evals", suite: "golden" }}/>)).toContain("No cases yet")
})
test("invalid declarations produce one warning and no guessed tabs", async () => {
  const warn = console.warn
  const warnings: unknown[] = []
  console.warn = (...args) => { warnings.push(args) }
  try {
    expect(await read({}, { tabs: [{ ...docs, root: "../escape" }] })).toEqual({ tabs: [] })
    expect(warnings.length).toBe(1)
  } finally { console.warn = warn }
})
test("nested docs paths stay ordered and traversal listings fail closed", async () => {
  const directoryConfig = { tabs: [{ type: "docs", title: "Docs", root: "docs", index: "guide/01.md" }] }
  const nested = await read({ docs: [{ name: "guide", type: "dir" }], "docs/guide": [{ name: "01.md", type: "file" }], "docs/guide/01.md": "# Nested", golden: [] }, directoryConfig)
  expect(nested.tabs[0]!.navigation?.[0]!.path).toBe("guide/01.md")
  const bad = await read({ docs: [{ name: "..", type: "dir" }], golden: [] }, directoryConfig)
  expect(bad.tabs[0]!.error).toBe("Invalid directory entry")
})

test("nav links resolve beside the nav file and retain groups and reading order", () => {
  expect(docsNavigation("# Guide\n- **Start Here**\n  - [Welcome](src/001.md)\n  - [Next](src/other/002.md)\n## Outside\n- [Outside](design/elsewhere.md)\n- [Remote](https://example.com/src/01.md)\n- [Escaped](src/../private.md)", "docs/user/inventory.md", "docs/user/src")).toEqual([
    { title: "Guide" }, { title: "Start Here" }, { title: "Welcome", path: "001.md" }, { title: "Next", path: "other/002.md" }
  ])
})
test("metadata with nav takes one navigation read; fallback lists only directories", async () => {
  const seen: string[] = []
  const context = { baseUrl: "", http: async (url: string) => {
    const path = decodeURIComponent(url.split("/contents/")[1] ?? "")
    seen.push(path)
    const value = path === ".smithers/ui/tabs.json" ? JSON.stringify({ tabs: [docs, evaluation] }) : paths[path as keyof typeof paths]
    return Response.json(typeof value === "string" ? { content: value, encoding: "utf-8" } : value)
  } }
  await readDeclaredTabs(context, "o/r")
  expect(seen.sort()).toEqual([".smithers/ui/tabs.json", "golden", "inventory.md"])
})
test("a page has its own loading and failed state while navigation stays usable", async () => {
  const data = await read(paths)
  const props = { repo: "o/r", subject: { kind: "docs" as const }, data, signedIn: true, retry: () => {}, onAsk: () => {} }
  expect(renderToStaticMarkup(<DeclaredTabView {...props}/>)).toContain("Loading")
  data.tabs[0]!.reads = { "01.md": { state: "failed", error: "Read failed" } }
  const html = renderToStaticMarkup(<DeclaredTabView {...props}/>)
  expect(html).toContain("Read failed")
  expect(html).toContain("Retry")
  expect(html).toContain("Second")
  expect(html).not.toContain("No docs yet")
})
test("an opened case starts its file reads in parallel", async () => {
  const data = await read(paths)
  const started: string[] = []
  const releases: (() => void)[] = []
  const pending = readDeclaredContent({ baseUrl: "", http: async url => {
    const path = url.split("/contents/")[1]!
    if (path === "golden/01-basic") return Response.json(paths["golden/01-basic"])
    started.push(path)
    await new Promise<void>(resolve => releases.push(resolve))
    return Response.json({ content: path, encoding: "utf-8" })
  } }, "o/r", data.tabs[1]!, "01-basic")
  for (let tick = 0; tick < 5; tick++) await new Promise(resolve => setTimeout(resolve, 0))
  expect(started.sort()).toEqual(["golden/01-basic/expected.effeck", "golden/01-basic/input.ts"])
  releases.forEach(resolve => resolve())
  expect((await pending).length).toBe(2)
})

test("without nav, metadata reads directories and derives titles without opening files", async () => {
  const seen: string[] = []
  const data = await readDeclaredTabs({ baseUrl: "", http: async url => {
    const path = url.split("/contents/")[1]!
    seen.push(path)
    if (path === ".smithers/ui/tabs.json") return Response.json({ content: JSON.stringify({ tabs: [{ type: "docs", title: "Docs", root: "docs", index: "001-first-page.md" }] }), encoding: "utf-8" })
    if (path === "docs") return Response.json([{ name: "guide", type: "dir" }, { name: "001-first-page.md", type: "file" }])
    if (path === "docs/guide") return Response.json([{ name: "002-next-page.md", type: "file" }])
    throw new Error("A metadata read opened a page")
  } }, "o/r")
  expect(seen).toEqual([".smithers/ui/tabs.json", "docs", "docs/guide"])
  expect(data.tabs[0]!.navigation).toEqual([{ title: "first page", path: "001-first-page.md" }, { title: "next page", path: "guide/002-next-page.md" }])
})
