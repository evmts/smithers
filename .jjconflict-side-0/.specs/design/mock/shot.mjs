#!/usr/bin/env node
/*
 * Screenshot the built mock: node .specs/design/mock/shot.mjs [name] [query] [--dark] [--width=1440] [--height=900]
 * Writes shots/<name>-<light|dark>.png. The query string selects a journey and step, e.g. "j=j3&s=4".
 *
 * Site mocks (build.mjs --site=<name>): --route=<host/path?flags> opens one screen, e.g.
 *   node shot.mjs repo-home --dist=dist-smithers-app --shots=shots-smithers-app --route="smithers.sh/smithersai/smithers?as=out"
 * and --all shoots every screen the site lists (window.__SITE__.screens) at desktop 1440x900 and phone 390x844,
 * light and dark: <shots>/<screen id>-<desk|phone>-<light|dark>.png, plus <shots>/screens.json (id, route).
 * --only=<id part> limits the screens; --variants=desk-light,phone-dark limits the viewport/scheme pairs.
 */
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, "../../../apps/app")
const { chromium } = createRequire(join(APP, "package.json"))("@playwright/test")

const args = process.argv.slice(2)
const flag = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback
const [name = "mock", query = ""] = args.filter(arg => !arg.startsWith("--"))
const theme = args.includes("--dark") ? "dark" : "light"
const width = Number(flag("width", 1440))
const height = Number(flag("height", 900))
const full = args.includes("--full")

const shots = resolve(HERE, flag("shots", "shots"))
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch()
const dist = resolve(HERE, flag("dist", "dist"))
const route = args.find(arg => arg.startsWith("--route="))?.slice(8)
const siteUrl = (screen, scheme) => `${pathToFileURL(join(dist, "index.html")).href}?theme=${scheme}&still=1#/${screen}`

if (args.includes("--all")) {
  const probe = await browser.newPage()
  await probe.goto(siteUrl("", "light"))
  const screens = await probe.evaluate(() => window.__SITE__.screens)
  await probe.close()
  const only = flag("only", "")
  // --variants=desk-light,phone-dark shoots only those viewport/scheme pairs.
  const variants = flag("variants", "")
  const wanted = (tag, scheme) => variants === "" || variants.split(",").includes(`${tag}-${scheme}`)
  writeFileSync(join(shots, "screens.json"), JSON.stringify(screens.map(({ id, route }) => ({ id, route })), null, 1))
  let failed = 0
  for (const screen of screens) {
    if (only !== "" && !screen.id.includes(only)) continue
    for (const [tag, w, h] of [["desk", 1440, 900], ["phone", 390, 844]]) {
      for (const scheme of ["light", "dark"]) {
        if (!wanted(tag, scheme)) continue
        const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: tag === "phone" ? 2 : 1, colorScheme: scheme })
        const errors = []
        page.on("pageerror", error => errors.push(error.message))
        await page.goto(siteUrl(screen.route, scheme))
        await page.waitForTimeout(Number(flag("wait", screen.wait ?? 500)))
        await page.screenshot({ path: join(shots, `${screen.id}-${tag}-${scheme}.png`), fullPage: full })
        if (errors.length > 0) { failed += 1; console.error(`${screen.id} ${tag} ${scheme}: ${errors.join("; ")}`) }
        await page.close()
      }
    }
  }
  await browser.close()
  console.log(`${screens.length} screens shot into ${shots}${failed ? `, ${failed} with page errors` : ""}`)
  process.exit(failed === 0 ? 0 : 1)
}

const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme })
const errors = []
page.on("pageerror", error => errors.push(error.message))
page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
const play = args.includes("--play")
const url = route !== undefined ? siteUrl(route, theme) : `${pathToFileURL(join(dist, "index.html")).href}?${query}${query ? "&" : ""}theme=${theme}${play ? "" : "&still=1"}`
await page.goto(url)
await page.waitForTimeout(Number(flag("wait", 400)))
const file = join(shots, `${name}-${theme}.png`)
await page.screenshot({ path: file, fullPage: full })
await browser.close()
if (errors.length > 0) console.error(`page errors:\n${errors.join("\n")}`)
console.log(file)
