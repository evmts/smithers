import {
  docs, file, KNOWN_REPOS, MOCK_NOW, pulls, releases, repo, selectRepo, to, tree
} from "../../fixtures"
import { docSource, documentBlocks } from "../docs/document"
import {
  changesForTag, generateNotes, makeRelease, notesRun, readPublished,
  releaseList, releaseMarkdown, releaseTagError, savePublished, sourceSize
} from "../releases/release-data"
import { identifierUses, searchFixtures, searchMode, searchSubject, subjects } from "./search-data"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

let assertions = 0
const check = (value: unknown, message: string) => {
  assertions++
  if (!value) throw new Error(message)
}
const equal = (actual: unknown, expected: unknown, message: string) =>
  check(JSON.stringify(actual) === JSON.stringify(expected), message)

const storage = new Map<string, string>()
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  }
})

const checkSearch = () => {
  check(selectRepo("maya/tinyhttp"), "The default dataset exists")
  const index = searchFixtures("router")
  check(subjects.every(subject => index[subject.key].length > 0), "Router matches every subject")
  equal(searchFixtures("ROUTER"), index, "Substring search is case insensitive")
  const empty = searchFixtures("router", true)
  check(Object.values(empty).every(results => results.length === 0), "Empty data clears every facet")
  check(Object.values(searchFixtures("")).every(results => results.length === 0), "An empty query has no matches")
  check(Object.values(searchFixtures("unfindable-platypus")).every(results => results.length === 0), "No-results counts are zero")
  check(index.code.some(result => result.title === "src/router.ts"), "Code search finds source contents")
  check(index.code.every(result => result.target.startsWith(to("blob/"))), "Every code match opens a blob")
  const symbols = searchFixtures("symbol:Router")
  check(symbols.code.some(result => result.lines?.some(line => line.detail === "class · Router")), "Symbol search uses intelligence fixtures")
  check(symbols.issues.length === 0 && symbols.runs.length === 0, "Symbol queries remain code queries")
  const definitions = searchFixtures("symbol:parseQuery").code.flatMap(result => result.lines ?? [])
  check(definitions.some(line => line.target?.includes("src/query.ts?L=")), "Imported symbols point to their definition")
  const refs = searchFixtures("ref:parseQuery").code
  let expected = 0
  for (const entry of tree) {
    if (entry.kind !== "file") continue
    const blob = file(entry.path)
    expected += (blob?.content.split("\n") ?? []).filter(line => identifierUses(line, "parseQuery")).length
  }
  equal(refs.reduce((sum, result) => sum + (result.lines?.length ?? 0), 0), expected, "References include every matching line")
  check(expected > 5, "Reference fixture exercises several files")
  check(identifierUses("new Router()", "Router"), "A standalone identifier is a reference")
  check(!identifierUses("RouterOptions", "Router"), "References exclude longer identifiers")
  check(!identifierUses("$Router", "Router"), "Dollar prefixes belong to the identifier")
  check(identifierUses("RouterOptions; Router()", "router"), "Reference scanning continues after a nonmatching prefix")
  equal(searchMode("SYMBOL: Router"), { kind: "symbol", term: "Router" }, "Prefixes are case insensitive")
  equal(searchSubject("pull-requests"), "pulls", "Pull request facet aliases work")
  equal(searchSubject("unknown"), "code", "Unknown facets fall back to Code")
}

const checkDocs = () => {
  const blocks = documentBlocks("---\ntitle: Test\n---\n# **Guide**\n\n## Setup\n\n```ts\n# code, not a heading\nconst x = 1\n```\n\n## Setup\n\n[Next](next.md)")
  equal(blocks.filter(block => block.kind === "heading").map(block => block.id), ["guide", "setup", "setup-1"], "Heading anchors are stable and unique")
  check(blocks.some(block => block.kind === "code" && block.text.includes("# code")), "Headings in fences stay code")
  check(!blocks.some(block => block.kind === "markdown" && block.text.includes("title: Test")), "Front matter isn't visible prose")
  const tildes = documentBlocks("~~~ts\nconst x = 1\n~~~")
  equal(tildes, [{ kind: "code", lang: "ts", text: "const x = 1" }], "Tilde fences render as copyable code")
  equal(documentBlocks("# À propos\n# À propos").filter(block => block.kind === "heading").map(block => block.id),
    ["à-propos", "à-propos-1"], "Unicode headings retain meaningful anchors")
  for (const slug of KNOWN_REPOS) {
    selectRepo(slug)
    for (const page of docs) {
      check(Boolean(docSource(page)), `${slug}/${page.slug} has an Edit source`)
      const source = docSource(page)
      check(Boolean(source && file(source)), `${slug}/${page.slug} links to an existing blob`)
      check(documentBlocks(page.body).length > 0, `${slug}/${page.slug} has renderable content`)
    }
  }
}

const checkReleases = () => {
  selectRepo("maya/tinyhttp")
  const latest = releases.find(item => item.latest)!
  equal(notesRun(latest)?.id, "run-495", "Release attribution points to the matching completed run")
  const local = makeRelease("v1.0.0", "A new release", "## Changes\n\nSafe route matching.")
  equal(local.date, MOCK_NOW, "Published releases use the dataset clock")
  equal(local.author, repo.owner, "Publication has a human author")
  savePublished([local])
  equal(readPublished(), [local], "Publishing survives a page change")
  const list = releaseList([local])
  check(list[0].tag === local.tag && list[0].latest, "The new stable release is latest")
  equal(list.filter(item => item.latest).length, 1, "Exactly one release is latest")
  equal(releaseList([local], true), [], "The empty state stays empty after an earlier publication")
  const preview = makeRelease("v2.0.0-rc.1", "Preview", "Preview notes")
  check(preview.prerelease, "Prerelease tags keep their status")
  check(!releaseList([preview])[0].latest, "A prerelease doesn't replace the latest stable release")
  selectRepo("effeck/effeck")
  equal(readPublished(), [], "Publications are isolated per repo")
  selectRepo("maya/tinyhttp")
  const changes = changesForTag("v0.4.2")
  equal(changes.previous?.name, "v0.4.1", "Generation compares against the previous tag")
  equal(changes.changes.map(item => item.n), [30, 32], "Generation contains the landed changes in the tag interval")
  const notes = generateNotes("v0.4.2")
  check(notes.includes("pull/30") && notes.includes("pull/32"), "Generated notes link to landed pull requests")
  check(changes.changes.every(item => item.state === "merged" && item.merged), "Open pull requests never appear as landed")
  check(!notes.includes(pulls.find(item => item.state === "open")!.title), "Open changes are excluded")
  check(generateNotes("v9.0.0").includes("No landed changes since v0.4.2"), "An empty tag interval stays truthful")
  check(releaseMarkdown(latest.body).includes(`${to("pull")}/32`), "Repository GitHub links stay in the mock")
  check(/source$/.test(sourceSize()), "Asset size labels describe source bytes")
  check(!releaseTagError("v1.0.0-rc.1"), "A valid preview tag is accepted")
  for (const tag of ["", "v1 bad", "refs//v1", "../v1", "release.lock", "v1?"]) {
    check(Boolean(releaseTagError(tag)), `Invalid tag ${tag} is rejected before publication`)
  }
}

checkSearch()
checkDocs()
checkReleases()
for (const slug of KNOWN_REPOS) {
  selectRepo(slug)
  const query = docs[0]?.title ?? repo.name
  const index = searchFixtures(query)
  check(Object.values(index).flat().every(result => result.target.startsWith(to())), `${slug} search doesn't link into another repository`)
}

// Route registries can be checked without launching a browser or rendering UI.
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { addEventListener: () => {}, location: { search: "", hash: "" } }
})
const { Highlight, SearchReady } = await import("./Search")
const highlighted = (text: string, term: string) => renderToStaticMarkup(createElement(Highlight, { text, term }))
equal(highlighted("src/router.ts", "router"),
  '<span class="repo-search-highlight">src/<mark>router</mark>.ts</span>',
  "A highlighted file path stays one inline flex child with no added spaces")
equal(highlighted("Router router ROUTER", "router"),
  '<span class="repo-search-highlight"><mark>Router</mark> <mark>router</mark> <mark>ROUTER</mark></span>',
  "Every match keeps its original case and spacing")
equal(highlighted("path/query.ts", ".ts"),
  '<span class="repo-search-highlight">path/query<mark>.ts</mark></span>',
  "Punctuation in a search term is matched literally")
equal(highlighted("unchanged", ""), '<span class="repo-search-highlight">unchanged</span>', "An empty term leaves text intact")
check(!highlighted("<script>", "script").includes("<script>"), "Search snippets escape markup")
selectRepo("maya/tinyhttp")
const routerIndex = searchFixtures("router")
const codeResults = renderToStaticMarkup(createElement(SearchReady, { query: "router", subject: "code", index: routerIndex }))
check(/<code><span class="repo-search-highlight">[^]*?<mark>Router<\/mark>/.test(codeResults) && codeResults.includes("repo-code-token-keyword"), "Code lines retain highlighted identifiers inside syntax tokens")
const issueResults = renderToStaticMarkup(createElement(SearchReady, { query: "router", subject: "issues", index: routerIndex }))
check(/repo-search-result-title[^]*?<mark>router<\/mark>/i.test(issueResults), "Result titles highlight matches")
check(/<p><span class="repo-search-highlight">[^]*?<mark>router<\/mark>/i.test(issueResults), "Result excerpts highlight matches")
const [{ routes: searchRoutes }, { routes: releaseRoutes }, { routes: docsRoutes }, router] = await Promise.all([
  import("./routes"), import("../releases/routes"), import("../docs/routes"), import("../../../core/router")
])
const routes = [...searchRoutes, ...releaseRoutes, ...docsRoutes]
router.setRoutes(routes)
const screenIds = new Set<string>()
for (const route of routes) {
  check(route.screens.length > 0, `${route.pattern} has review screens`)
  for (const screen of route.screens) {
    check(!screenIds.has(screen.id), `${screen.id} is unique`)
    screenIds.add(screen.id)
    equal(router.resolveRoute(screen.route)?.route.pattern, route.pattern, `${screen.id} resolves to its own route`)
    const query = new URLSearchParams(screen.route.split("?")[1])
    check([...query.keys()].every(key => query.getAll(key).length === 1), `${screen.id} has no shadowed flags`)
    if (screen.id.includes("loading")) equal(query.get("net"), "slow", `${screen.id} requests loading`)
    if (screen.id.endsWith("error")) equal(query.get("net"), "error", `${screen.id} requests failure`)
    if (screen.id.endsWith("signed-out")) equal(query.get("as"), "out", `${screen.id} requests signed out`)
    if (screen.id.endsWith("reader") || screen.id.endsWith("denied")) equal(query.get("role"), "reader", `${screen.id} requests reader access`)
  }
}
equal(screenIds.size, 41, "All requested and supplemental review screens are registered")
console.log(`w1-find: ${assertions} behavioral assertions passed across ${KNOWN_REPOS.length} repositories`)
