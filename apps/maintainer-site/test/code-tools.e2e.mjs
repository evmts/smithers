#!/usr/bin/env node
// The code view's tools in Chromium, by key and by click: c hides comments, z and Z fold and unfold every body, a
// chevron folds one, O opens the outline; a guide's `path:line` reference still finds its line.
//
//   node apps/maintainer-site/test/code-tools.e2e.mjs
//
// Uses apps/mvp's @playwright/test. Starts its own server on a free port over a copy of test/fixtures/repo and a queue
// of one code slice; never touches queue/. Fails on a console error, a page error or a broken check.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { startServer } from "../serve.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const { default: playwright } = await import(pathToFileURL(join(here, "../../mvp/node_modules/@playwright/test/index.mjs")).href)

const dir = mkdtempSync(join(tmpdir(), "queue-code-tools-"))
const repo = join(dir, "repo")
const queueDir = join(dir, "queue")
cpSync(join(here, "fixtures/repo"), repo, { recursive: true })
mkdirSync(queueDir)
const ID = "code:shape-stream-tools"
writeFileSync(
  join(queueDir, "queue.json"),
  JSON.stringify({
    version: 1,
    items: [
      {
        id: ID,
        kind: "code",
        title: "Code: shape-stream.ts",
        priority: 1,
        why: "The code tools",
        context: "Read `src/shape-stream.ts:18` and `src/shape-stream.ts:34` first. `src/elsewhere.ts:3` is not in the slice.",
        files: [{ path: "src/shape-stream.ts", from: 1, to: 69 }, { path: "src/shape-stream.css" }],
      },
    ],
  }),
)
writeFileSync(join(queueDir, "answers.jsonl"), "")

const server = startServer({ port: 0, repo, gifs: join(repo, "gifs"), site: repo, queueDir })
const base = await server.ready
const problems = []
const check = (ok, message) => {
  if (!ok) problems.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}

const browser = await playwright.chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" })).newPage()
page.on("console", (message) => (message.type() === "error" || message.type() === "warning") && problems.push(`console ${message.type()}: ${message.text()}`))
page.on("pageerror", (error) => problems.push(`page error: ${error.message}`))
const press = (key) => page.keyboard.press(key)
const ready = () => page.waitForSelector(".q-card:not(.leaving) .q-code.outlined .q-line", { state: "attached" })
// The line numbers on screen, in order.
const shown = () => page.locator(".q-code .q-line").evaluateAll((rows) => rows.filter((row) => row.offsetParent !== null).map((row) => Number(row.querySelector(".q-ln").textContent)))
const row = (line) => page.locator(`.q-code .q-line:has(> .q-ln[data-line="${line}"])`)

await page.goto(`${base}/queue`)
await ready()
const all = await shown()
check(all.length === 69 && all[0] === 1 && all.at(-1) === 69, "the slice shows lines 1 to 69")
check((await page.locator(".q-tool kbd").allTextContents()).join(" ") === "c z Z O", "the tools show their keys: c z Z O")
const keyBar = await page.locator("#q-keys").textContent()
check(keyBar.includes("comments") && keyBar.includes("fold") && keyBar.includes("outline"), "the key bar lists them")
await press("?")
const sheet = await page.locator(".q-sheet-box").textContent()
check(sheet.includes("Hide or show comments") && sheet.includes("Fold every body") && sheet.includes("Outline"), "the key sheet lists them")
await press("Escape")

// c: comment lines and blocks close up; line numbers stay the file's.
await press("c")
let lines = await shown()
check(![1, 4, 18, 44].some((line) => lines.includes(line)) && lines.length === 65, "c hides the four comment lines")
check(lines.slice(0, 4).join(",") === "2,3,5,6", "the code closes up and keeps its line numbers")
check((await page.locator("[data-tool=comments]").textContent()).includes("Show comments"), "the button says Show comments")
await page.reload()
await ready()
check((await shown()).length === 65 && (await page.locator("[data-tool=comments]").textContent()).includes("Show comments"), "the choice survives a reload")
await page.locator("[data-tool=comments]").click()
check((await shown()).length === 69, "clicking the button shows comments again")

// z, Z, the buttons, a chevron and the dots.
await press("z")
lines = await shown()
check(lines.join(",") === "1,2,3,4,5,9,10,11,12,13,29,30,31,32,33,38,39,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69", "z folds the interface, the class, the Effect.gen body and the function")
const header = row(13)
check((await header.locator(".q-lc").textContent()) === "export class ShapeStream {…}15 lines", "a folded class shows its first line, { … } and its line count")
check((await row(33).locator(".q-lc").textContent()) === "  Effect.gen(function* () {…})4 lines", "a folded body keeps what follows its }")
const shut = await page.locator(".q-chev[aria-expanded=false]").evaluateAll((all) => `${all.length},${all.filter((chevron) => chevron.offsetParent !== null).length}`)
check(shut === "6,4", "six bodies fold: four show, the two methods inside the class wait folded")
await press("Shift+Z")
check((await shown()).length === 69, "Z unfolds all")
await page.locator("[data-tool=fold]").click()
check((await shown()).length === 44, "the Fold all button folds")
await page.locator("[data-tool=unfold]").click()
check((await shown()).length === 69, "the Unfold all button unfolds")
await row(19).locator(".q-chev").click()
lines = await shown()
check(!lines.includes(20) && !lines.includes(23) && lines.includes(24) && (await row(19).locator(".q-chev").getAttribute("aria-expanded")) === "false", "a chevron folds push(): lines 20 to 23 hide")
await row(19).locator(".q-dots").click()
check((await shown()).length === 69, "its dots unfold it")

// O: the outline, filtered, Enter jumps into a fold and marks the line.
await press("z")
await press("Shift+O")
check(await page.locator(".q-outline").isVisible(), "O opens the outline")
check(await page.locator(".q-outline-filter").evaluate((input) => input === document.activeElement), "with its filter focused")
const names = await page.locator(".q-sym .q-sym-name").allTextContents()
check(names.slice(0, 6).join(",") === "Row,id,offset,DEFAULT_LIMIT,greeting,ShapeStream" && names.length === 42, "it lists the symbols in file order")
check((await page.locator(".q-sym:has-text('response')").getAttribute("style")).includes("24px") && (await page.locator(".q-sym:has-text('load') .q-sym-kind").textContent()) === "fn", "Effect.gen's steps nest under their function")
await page.keyboard.type("resp")
check((await page.locator(".q-sym").allTextContents()).join("|") === "stepresponse34", "typing filters it; keys stay in the box")
check((await shown()).length === 44, "typing z in the filter folded nothing more")
await press("Enter")
check((await page.locator(".q-line.hit .q-ln").textContent()) === "34" && (await shown()).includes(34), "Enter opens the fold around line 34 and marks it")
check(await page.locator(".q-outline-filter").evaluate((input) => input !== document.activeElement), "and hands the keys back")
await page.locator(".q-outline-filter").fill("")
await page.locator(".q-outline-filter").dispatchEvent("input")
await page.locator(".q-sym:has-text('describe')").click()
check((await page.locator(".q-line.hit .q-ln").textContent()) === "39", "clicking a symbol jumps to it")
await press("Shift+O")
check(await page.locator(".q-outline").isHidden(), "O closes it")
await page.locator("[data-tool=outline]").click()
check(await page.locator(".q-outline").isVisible() && (await page.locator("[data-tool=outline]").getAttribute("aria-pressed")) === "true", "the Outline button opens it")
await page.locator(".q-outline-filter").blur()

// A guide's line reference finds a hidden comment line and a folded line.
await press("Shift+Z")
await press("c")
await press("z")
check((await page.locator(".q-context a.q-ref").count()) === 2, "the two references into the slice link; the one outside does not")
await page.locator(".q-context a.q-ref", { hasText: ":18" }).click()
check((await shown()).includes(18) && (await page.locator(".q-line.hit .q-ln").textContent()) === "18", "a reference to a hidden comment shows it and marks it")
await page.locator(".q-context a.q-ref", { hasText: ":34" }).click()
check((await shown()).includes(34) && (await page.locator(".q-line.hit .q-ln").textContent()) === "34", "a reference into a fold opens it")
check(page.url() === `${base}/queue`, "the queue's address stays")
await press("c")

// Another language: no tools, and the keys do nothing.
await press("Shift+J")
await page.waitForSelector(".q-tab.on:has-text('shape-stream.css')")
await page.waitForSelector(".q-code .q-line")
check((await page.locator(".q-tool").count()) === 0 && !(await page.locator("#q-keys").textContent()).includes("outline"), "a CSS file shows no tools")
await press("c")
await press("z")
check((await page.locator(".q-code .q-line:visible").count()) === (await page.locator(".q-code .q-line").count()), "and c and z leave it alone")

await browser.close()
await server.close()
rmSync(dir, { recursive: true, force: true })
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`)
  process.exit(1)
}
console.log("\nall checks passed")
