/** Route, fixture and keyboard/mouse behavior checks using existing happy-dom; no browser launch. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../../..")
const requireApp = createRequire(join(root, "apps/app/package.json"))
const { Window } = await import(pathToFileURL(requireApp.resolve("happy-dom")))
const window = new Window({ url: "http://localhost/?still=1" })
for (const key of ["window", "document", "history", "sessionStorage", "localStorage", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Node", "Element", "Event", "CustomEvent", "KeyboardEvent", "PointerEvent", "MouseEvent", "FormData", "CSS", "ResizeObserver"]) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true })
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true })
globalThis.matchMedia = window.matchMedia.bind(window)
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
globalThis.MessageChannel = class {
  port1 = { onmessage: null }
  port2 = { postMessage: data => setImmediate(() => this.port1.onmessage?.({ data })) }
}
window.location.hash = "#/effeck.dev/"
sessionStorage.setItem("repo-ask-open", "false")
document.body.innerHTML = '<div id="root"></div>'
const temporary = mkdtempSync(join(tmpdir(), "effeck-site-check-"))
const output = join(temporary, "check.cjs")
const bundle = await requireApp("esbuild").build({
  stdin: {
    contents: `
      import './.specs/design/mock/src/sites/effeck-site-main'
      export { act } from 'react'
      export { allRoutes, resolveRoute, navigate } from './.specs/design/mock/src/sites/core/router'
      export { file, selectRepo } from './.specs/design/mock/src/sites/repo/fixtures'
      export { docsCodeHovers, codeIdentifiers } from './.specs/design/mock/src/sites/repo/views/hovers/model'
      export { getSlash, parseSlash } from './.specs/design/mock/src/sites/repo/frame/slash'
    `,
    resolveDir: root, sourcefile: "effeck-site-check.tsx", loader: "tsx"
  },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  define: { __SITE__: '"effeck-site"' },
  nodePaths: [join(root, "apps/app/node_modules"), join(root, "node_modules")]
})
writeFileSync(output, bundle.outputFiles[0].text)
const kit = createRequire(import.meta.url)(output)
const wait = ms => new Promise(done => setTimeout(done, ms))
const screens = window.__SITE__.screens
let count = 0
const check = (ok, message) => { count++; assert.ok(ok, message) }
const go = async (path, flags = "as=in&role=member&net=ok&data=full&landing=install") => {
  await kit.act(async () => { kit.navigate(`smithers.sh/effeck/effeck/${path}${path.includes("?") ? "&" : "?"}${flags}`); await wait(10) })
}

try {
  await wait(30)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  check(document.querySelector('a[href^="#/smithers.sh/effeck/effeck?"]')?.textContent?.includes("Source"), "Front header opens the repo")
  check(document.body.textContent.includes("npm create vibelang@latest"), "Monday front page has the install command")
  const routes = kit.allRoutes()
  check(routes.filter(route => !route.pattern.startsWith("smithers.sh/:owner/:repo")).every(route => route.pattern === "__screens" || route.pattern === "smithers.sh/signin" || route.pattern === "smithers.sh/docs" || route.pattern === "smithers.sh/docs/*" || route.pattern === "smithers.sh/" || route.pattern.startsWith("effeck.dev")), "Only VibeLang fronts and sign-in are registered")
  check(new Set(screens.map(screen => screen.id)).size === screens.length, "Review screen IDs are unique")
  for (const screen of screens) {
    check(screen.site === "effeck-site", `${screen.id}: site tag`)
    check(!screen.route.includes("tinyhttp"), `${screen.id}: no tinyhttp screen`)
    check(Boolean(kit.resolveRoute(screen.route)), `${screen.id}: resolves`)
  }
  for (const route of routes) {
    check(route.screens.length > 0, `${route.pattern}: has a screen`)
    for (const screen of route.screens) check(kit.resolveRoute(screen.route)?.route.pattern === route.pattern, `${screen.id}: belongs to its declared route`)
  }
  if (process.argv.includes("--write-screens")) writeFileSync(new URL("./screens.json", import.meta.url), JSON.stringify(routes.map(route => ({ pattern: route.pattern, screens: route.screens })), null, 2) + "\n")
  kit.selectRepo("effeck/effeck")
  check(!kit.file("templates/app/src/main.effeck") && kit.file("templates/app/src/main.vibe"), "Unreferenced old extensions are not accepted as a second source format")
  const tokens = kit.codeIdentifiers('find(foo); // find\n"find"; /* find */ UserNotFound; findMore; `find`')
  check(tokens.map(token => token.name).join(",") === "find,foo,UserNotFound,findMore", "Lexer ignores comments, strings, templates and substrings")
  check(tokens.at(-1).line === 2, "Lexer tracks code-block line numbers")
  const welcome = kit.file("docs/user/src/001-onboarding.md").content
  const effeckBlock = welcome.match(/```vibe\n([\s\S]*?)```/)[1]
  const hovers = kit.docsCodeHovers(effeckBlock)
  const find = hovers.find(symbol => symbol.name === "find")
  check(find?.hover.includes("Effect.Effect<User, UserNotFound, Users>"), "Docs resolves the Users Effect signature rather than another same-name symbol")
  check(hovers.every(symbol => symbol.source.endsWith(".vibe") && effeckBlock.slice(symbol.start, symbol.end) === symbol.name), "Every hover has exact offsets and a VibeLang source")
  check(kit.docsCodeHovers("", []).length === 0 && kit.docsCodeHovers("unlisted_identifier", []).length === 0, "Empty and unknown symbols remain plain code")
  const ambiguous = kit.docsCodeHovers("service Users { find(id: string): User!UserNotFound }", [
    { path: "a.vibe", content: "function find() { return 1 }", symbols: [{ name: "find", line: 1, kind: "function", hover: "wrong" }] },
    { path: "b.vibe", content: "service Users { find(id: string): User!UserNotFound }", symbols: [{ name: "find", line: 1, kind: "method", hover: "correct" }] }
  ])
  check(ambiguous.find(symbol => symbol.name === "find")?.hover === "correct", "Code context disambiguates same-name symbols")
  kit.selectRepo("maya/tinyhttp")
  check(kit.docsCodeHovers("UserNotFound Users").length === 0, "Switching repositories drops VibeLang symbol data")

  await go("")
  check(document.body.textContent.includes("Ask about VibeLang") && document.body.textContent.includes("Fixed by agents"), "Repo home renders its declared prompt and factory evidence")
  check(Boolean(document.querySelector('a[href="#/smithers.sh/effeck/effeck/evals/convert-golden"]')), "The declared eval tab appears")
  check(document.querySelector(".repo-code-home-fix")?.textContent.includes("8fadacb"), "The compact fix has reachable main evidence")

  kit.selectRepo("effeck/effeck")
  for (const path of ["examples/users/src/main.effeck", "examples/users/src/main.vibe"]) {
    check(kit.file(path)?.path === "examples/users/src/main.vibe", "Old record links and current paths share one renamed blob")
    await go(`blob/main/${path}`)
    check(document.querySelector('.repo-code-file-stats')?.textContent.startsWith("VibeLang · "), "Source view labels the language VibeLang")
    check(document.querySelector('.repo-code-breadcrumbs strong')?.textContent === "main.vibe", "Both URLs display the current source path")
  }
  for (const slug of ["effeck-cli", "vibelang-cli"]) {
    await go(`docs/user/src/setup/${slug}`)
    check(document.querySelector('.repo-docs-article h1')?.firstChild?.textContent === "Build with the vibelang CLI", "Existing and renamed docs URLs open the same CLI guide")
  }

  await go("docs/user/src/001-onboarding?hover=find")
  check([...document.querySelectorAll('.repo-docs-code-toolbar span')].some(node => node.textContent === "VibeLang"), "Vibe fences display the language name")
  check(document.querySelector(".repo-hovers-card")?.textContent.includes("Effect.Effect<User, UserNotFound, Users>"), "Docs integration renders the review hover")
  check(document.querySelector('.repo-hovers-card a')?.getAttribute("href").includes("examples/users/src/main.vibe?L="), "Definition link points to a source line")
  const button = document.querySelector('.repo-hovers-token[data-name="find"]')
  await kit.act(async () => { button.click(); await wait(5) })
  check(document.activeElement === document.querySelector(".repo-hovers-card a"), "Click/Enter moves focus into the hover card")
  await kit.act(async () => { window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(5) })
  check(!document.querySelector(".repo-hovers-card"), "Escape dismisses the hover")
  check(document.activeElement === button, "Escape returns focus to the identifier")
  await kit.act(async () => { button.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true })); await wait(5) })
  check(Boolean(document.querySelector(".repo-hovers-card")), "Mouse hover opens the type card")
  check(kit.parseSlash("/docs.symbol find").values.name === "find", "Ask parses the button's slash form")
  await kit.act(async () => { kit.getSlash("docs.symbol").run({ name: "find" }, { closeAsk() {} }); await wait(5) })
  check(document.querySelector(".repo-hovers-card")?.textContent.includes("Effect.Effect<User, UserNotFound, Users>"), "Ask command opens the same hover")

  await go("evals/convert-golden?case=01-hero-batch-lookup")
  check(document.body.textContent.includes("16/20 actual outputs compile, including the hero"), "Suite renders the exact gate")
  check(document.body.textContent.includes("Converter off until a deployed held-out model run passes"), "Suite keeps the Monday gate off")
  check(document.querySelector(".repo-evals-selected")?.textContent.includes("export function names"), "Expanded hero shows expected VibeLang")
  await kit.act(async () => { kit.getSlash("eval.case").run({ suite: "convert-golden", case: "02-typed-error-fallback" }, { closeAsk() {} }); await wait(10) })
  check(document.querySelector(".repo-evals-selected")?.textContent.includes("02-typed-error-fallback"), "Slash selects the same case-evidence view")
  check(document.activeElement === document.querySelector(".repo-evals-selected"), "Selected case receives keyboard focus")
  await go("evals/convert-golden?act=run", "as=in&role=reader&net=ok&data=full&landing=install")
  check(document.body.textContent.includes("Only members of effeck/effeck can run evals"), "Reader cannot run an eval")
  await go("evals/convert-golden?act=run", "as=out&role=reader&net=ok&data=full&landing=install")
  check(document.body.textContent.includes("Sign in"), "Signed-out eval action offers sign-in")
  await go("docs/user/src/001-onboarding", "as=out&role=reader&net=ok&data=full&landing=install")
  check(Boolean(document.querySelector('.repo-hovers-token[data-name="find"]')), "Public docs retain symbol hovers signed out")
  await go("docs/user/src/001-onboarding", "as=in&role=member&net=error&data=full&landing=install")
  check(document.body.textContent.includes("Retry") && !document.querySelector(".repo-hovers-token"), "Read failure shows Retry, with no fabricated source")
  await go("docs/user/src/001-onboarding", "as=in&role=member&net=ok&data=empty&landing=install")
  check(document.body.textContent.includes("No docs yet") && !document.querySelector(".repo-hovers-token"), "Empty docs remain empty")
  await go("docs/user/src/001-onboarding", "as=in&role=member&net=slow&data=full&landing=install")
  check(!document.querySelector(".repo-hovers-token"), "Slow reads defer hovers until the page is loaded")
  const source = readFileSync(join(root, ".specs/design/mock/src/sites/repo/views/docs/Docs.tsx"), "utf8")
  check(source.includes('<DocsCode code={block.text} />'), "Shared docs hookup remains one component/prop")
  console.log(`PASS ${count} checks · ${routes.length} route patterns · ${screens.length} curated screens · no browser launch`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
  await window.happyDOM.abort()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
}
