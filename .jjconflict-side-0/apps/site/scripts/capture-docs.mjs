#!/usr/bin/env node
/**
 * Regenerate every docs screenshot in one command.
 *
 *   node apps/site/scripts/capture-docs.mjs [--origin https://smithers.sh] [--only id,id]
 *                                           [--page quickstart] [--member-storage file.json | --member-profile dir]
 *                                           [--check] [--strict] [--out dir]
 *
 * Every shot in docs-shots.mjs is captured twice, light and dark, at
 * 1440x900 @2x, redacted, converted to WebP without dependencies, and written
 * to apps/app/src/docs/images/ with a captures.json manifest. --check captures
 * into a temp dir and reports CHANGED/MISSING/STALE/UNCHANGED against the
 * manifest without touching the real images.
 */
import { createRequire } from "node:module"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { shots } from "./docs-shots.mjs"

const { chromium } = createRequire(new URL("../../app/package.json", import.meta.url))("playwright")

// ---- CLI ------------------------------------------------------------------
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)
const origin = (flag("origin") ?? "https://smithers.sh").replace(/\/$/, "")
const only = flag("only") ? new Set(flag("only").split(",")) : null
const pageFilter = flag("page")
const memberStoragePath = flag("member-storage")
const memberProfileDir = flag("member-profile")
const check = has("check")
const strict = has("strict")
const realDir = flag("out") ? resolve(process.cwd(), flag("out")) : fileURLToPath(new URL("../../app/src/docs/images/", import.meta.url))
const writeDir = check ? mkdtempSync(join(tmpdir(), "docs-shots-")) : realDir

// ---- Shot validation --------------------------------------------------------
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const seen = new Set()
for (const shot of shots) {
  if (!ID.test(shot.id)) throw new Error(`bad shot id: ${shot.id}`)
  if (seen.has(shot.id)) throw new Error(`duplicate shot id: ${shot.id}`)
  seen.add(shot.id)
  if (!shot.alt) throw new Error(`shot ${shot.id} has no alt text`)
}
const selected = shots.filter((shot) => (!only || only.has(shot.id)) && (!pageFilter || shot.page === pageFilter))

const THEMES = ["light", "dark"]
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const TOKEN_SRC = "(?<![A-Za-z0-9])(gh[pousr]_|github_pat_|sk-|smthrs_)[A-Za-z0-9_]{8,}"
const EMAIL_SRC = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex")

// ---- In-page functions ------------------------------------------------------
// Mask the global redaction list plus the shot's mask, and every element whose
// text, value or attributes hold an email or a token-like string. A masked
// element is painted as an opaque block (a blur is partly recoverable). The walk
// covers open shadow roots and same-origin iframes; everything it masks carries
// data-docs-shot-masked so the post-capture check can tell masked from leaked.
const ATTRIBUTES = ["value", "placeholder", "title", "aria-label", "alt", "href", "src", "data-email", "data-login"]
const redact = ([mask, tokenSrc, emailSrc, attributes]) => {
  const TOKEN = new RegExp(tokenSrc)
  const EMAIL = new RegExp(emailSrc)
  const hit = (value) => typeof value === "string" && (TOKEN.test(value) || EMAIL.test(value))
  const mark = (el) => el.setAttribute("data-docs-shot-masked", "")
  const style = "[data-docs-shot-masked]{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;background:#8a8a8a!important;border-radius:4px!important}[data-docs-shot-masked] *{visibility:hidden!important}[data-docs-shot-masked]::placeholder{color:transparent!important}"
  const visit = (root) => {
    const head = root.head ?? root
    const tag = document.createElement("style")
    tag.textContent = style
    head.appendChild(tag)
    for (const sel of ["input[type=password]", "[data-redact]", ...mask]) for (const el of root.querySelectorAll(sel)) mark(el)
    for (const el of root.querySelectorAll("*")) {
      if (hit(el.value) || attributes.some((name) => hit(el.getAttribute(name)))) mark(el)
      for (const child of el.childNodes) if (child.nodeType === Node.TEXT_NODE && hit(child.nodeValue)) mark(el)
      if (el.shadowRoot) visit(el.shadowRoot)
      if (el.tagName === "IFRAME") { try { if (el.contentDocument) visit(el.contentDocument) } catch { /* cross-origin: findLeaks refuses it */ } }
    }
  }
  visit(document)
}

// Any visible element whose text, value or attributes match a redaction
// pattern without the masked marker is a leak, and so is a visible cross-origin
// iframe the walk cannot read. Returns up to four offending snippets.
const findLeaks = ([tokenSrc, emailSrc, attributes]) => {
  const TOKEN = new RegExp(tokenSrc)
  const EMAIL = new RegExp(emailSrc)
  const hit = (value) => typeof value === "string" && (TOKEN.test(value) || EMAIL.test(value))
  const leaks = []
  const visible = (el) => {
    const style = getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden") return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const visit = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (leaks.length >= 4) return
      const masked = el.closest("[data-docs-shot-masked]") !== null
      const texts = [...el.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.nodeValue)
      const found = [el.value, ...texts, ...attributes.map((name) => el.getAttribute(name))].find(hit)
      if (found !== undefined && !masked && visible(el)) leaks.push(`${el.tagName.toLowerCase()}: ${String(found).trim().replace(/\s+/g, " ").slice(0, 60)}`)
      if (el.shadowRoot) visit(el.shadowRoot)
      if (el.tagName === "IFRAME" && visible(el) && !masked) {
        let readable = false
        try { readable = el.contentDocument !== null } catch { readable = false }
        if (readable) visit(el.contentDocument)
        else leaks.push(`cross-origin iframe: ${el.getAttribute("src") ?? "(no src)"}`.slice(0, 80))
      }
    }
  }
  visit(document)
  return leaks
}

// Numbered badge at the top-left of each target plus an outline around it.
// Boxes are resolved through Playwright so role=/text= targets work; the
// overlay itself is viewport-fixed plain DOM.
const drawCallouts = (specs) => {
  const root = document.createElement("div")
  root.id = "docs-shot-callouts"
  for (const spec of specs) {
    const outline = document.createElement("div")
    outline.style.cssText = `position:fixed;left:${spec.x}px;top:${spec.y}px;width:${spec.width}px;height:${spec.height}px;outline:2px solid #0f766e;border-radius:4px;pointer-events:none;z-index:2147483647`
    root.appendChild(outline)
    const badge = document.createElement("div")
    const x = Math.max(0, Math.min(spec.x - 10, window.innerWidth - 24))
    const y = Math.max(0, Math.min(spec.y - 10, window.innerHeight - 24))
    badge.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:24px;height:24px;border-radius:50%;background:#0f766e;color:#fff;font:700 14px/24px system-ui,sans-serif;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647`
    badge.textContent = String(spec.n)
    root.appendChild(badge)
  }
  document.body.appendChild(root)
}

// ---- PNG -> WebP with no dependency ----------------------------------------
// Draws the PNG on a canvas in a blank page, returns the raw RGBA pixels (for
// the pixel hash) and the canvas-encoded WebP.
const makeConverter = (page) => async (png) => {
  const result = await page.evaluate(async (pngBase64) => {
    const img = new Image()
    await new Promise((resolveLoad, reject) => {
      img.onload = resolveLoad
      img.onerror = () => reject(new Error("PNG decode failed"))
      img.src = `data:image/png;base64,${pngBase64}`
    })
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const context = canvas.getContext("2d")
    context.drawImage(img, 0, 0)
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
    let bin = ""
    for (let i = 0; i < rgba.length; i += 0x8000) bin += String.fromCharCode.apply(null, rgba.subarray(i, i + 0x8000))
    return { pixels: btoa(bin), webp: canvas.toDataURL("image/webp", 0.86).split(",")[1], width: canvas.width, height: canvas.height }
  }, png.toString("base64"))
  return { pixels: Buffer.from(result.pixels, "base64"), webp: Buffer.from(result.webp, "base64"), width: result.width, height: result.height }
}

// ---- Capture ----------------------------------------------------------------
const browser = await chromium.launch({ headless: true })
const convertPage = await browser.newPage()
const convert = makeConverter(convertPage)

let memberState
if (memberStoragePath) memberState = JSON.parse(readFileSync(memberStoragePath, "utf8"))
else if (memberProfileDir) {
  const profile = await chromium.launchPersistentContext(memberProfileDir, { headless: true })
  memberState = await profile.storageState()
  await profile.close()
}

const build = await fetch(`${origin}/__build.json`)
  .then((response) => (response.ok ? response.json() : null))
  .then((json) => json?.gitSha ?? null)
  .catch(() => null)

const settle = (page) =>
  page
    .evaluate(() => document.fonts.ready)
    .then(() => page.evaluate(() => new Promise((resolveFrames) => requestAnimationFrame(() => requestAnimationFrame(resolveFrames)))))

const capture = async (shot, theme) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: "reduce",
    userAgent: UA,
    ...(shot.auth === "member" && memberState ? { storageState: memberState } : {})
  })
  await context.addInitScript((value) => {
    try {
      localStorage.setItem("smithers-mvp.theme", value)
      localStorage.setItem("starlight-theme", value)
    } catch {
      // An origin that refuses storage still captures; colorScheme carries it.
    }
  }, theme)
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  try {
    await page.goto(`${origin}${shot.path}`)
    const steps = shot.steps ?? []
    // The ready selector may only exist after steps (chat palette, sign-in
    // redirect); without steps it must already be there.
    if (steps.length === 0) await page.waitForSelector(shot.ready)
    else await page.waitForSelector(shot.ready, { timeout: 8000 }).catch(() => {})
    await settle(page)
    await page.waitForTimeout(500)
    await page.addStyleTag({
      content: "*{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}"
    })
    // A returning visitor has dismissed the first-visit hints; dismiss them the
    // way a person does, unless the shot is about a hint.
    if (!shot.keepHints) {
      for (const dismiss of await page.locator('button[aria-label="Dismiss help"]:visible').all()) await dismiss.click().catch(() => {})
    }
    for (const step of steps) {
      if (step.click) await page.locator(step.click).first().click()
      else if (step.fill) await page.locator(step.fill[0]).first().fill(step.fill[1])
      else if (step.press) await page.keyboard.press(step.press)
      else if (step.hover) await page.locator(step.hover).first().hover()
      else if (step.wait) await page.waitForSelector(step.wait)
    }
    if (steps.length > 0) {
      await page.waitForSelector(shot.ready)
      await settle(page)
      await page.waitForTimeout(300)
    }
    // Toasts belong to the moment, not the screen: hide them as a person would,
    // twice (a toast can land while the first ones close), and refuse a shot
    // that still shows one unless the shot is about a toast.
    if (!shot.keepToasts) {
      for (let round = 0; round < 2; round++) {
        for (const hide of await page.locator("section.notify button.notice-hide:visible").all()) await hide.click().catch(() => {})
        await page.waitForTimeout(300)
      }
      const toasts = await page.locator("section.notify .notice:visible").allInnerTexts()
      if (toasts.length > 0) throw new Error(`toast still visible: ${toasts.map((text) => text.replace(/\s+/g, " ").slice(0, 40)).join(" | ")}`)
    }
    await page.evaluate(redact, [shot.mask ?? [], TOKEN_SRC, EMAIL_SRC, ATTRIBUTES])
    const specs = []
    for (const callout of shot.callouts ?? []) {
      const target = page.locator(callout.target).first()
      if ((await target.count()) === 0) throw new Error(`callout target not found: ${callout.target}`)
      await target.scrollIntoViewIfNeeded()
      const box = await target.boundingBox()
      if (!box) throw new Error(`callout target has no box: ${callout.target}`)
      specs.push({ n: callout.n, ...box })
    }
    if (specs.length > 0) await page.evaluate(drawCallouts, specs)
    const png = await page.screenshot({ animations: "disabled" })
    if (specs.length > 0) await page.evaluate(() => document.getElementById("docs-shot-callouts")?.remove())
    const leaks = await page.evaluate(findLeaks, [TOKEN_SRC, EMAIL_SRC, ATTRIBUTES])
    if (leaks.length > 0) throw new Error(`unredacted pattern visible: ${leaks.join(" | ")}`)
    return png
  } finally {
    await context.close()
  }
}

// ---- Run --------------------------------------------------------------------
const manifestPath = join(realDir, "captures.json")
const existing = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : []
const byId = new Map(existing.filter((entry) => seen.has(entry.id)).map((entry) => [entry.id, entry]))
mkdirSync(writeDir, { recursive: true })

let failures = 0
let differences = 0
let unchanged = 0
const missing = new Set()

try {
  for (const shot of selected) {
    if (shot.auth === "member" && !memberState) {
      console.log(`SKIP ${shot.id}: no member session`)
      continue
    }
    const entry = byId.get(shot.id) ?? {
      id: shot.id,
      page: shot.page,
      alt: shot.alt,
      path: shot.path,
      auth: shot.auth,
      origin,
      build,
      themes: {}
    }
    entry.page = shot.page
    entry.alt = shot.alt
    entry.path = shot.path
    entry.auth = shot.auth
    entry.origin = origin
    entry.build = build
    byId.set(shot.id, entry)
    for (const theme of THEMES) {
      try {
        const png = await capture(shot, theme)
        const { pixels, webp, width, height } = await convert(png)
        if (!(webp.subarray(0, 4).toString("latin1") === "RIFF" && webp.subarray(8, 12).toString("latin1") === "WEBP")) {
          throw new Error("canvas did not produce WebP")
        }
        if (width !== 2880 || height !== 1800) throw new Error(`unexpected size ${width}x${height}`)
        const pixelSha256 = sha256(pixels)
        if (check) {
          const recorded = entry.themes[theme]
          const fileOnDisk = recorded && existsSync(join(realDir, recorded.file))
          if (!recorded || !fileOnDisk) {
            if (!missing.has(shot.id)) {
              console.log(`MISSING ${shot.id}`)
              missing.add(shot.id)
            }
            differences++
          } else if (recorded.pixelSha256 !== pixelSha256) {
            console.log(`CHANGED ${shot.id} ${theme}`)
            differences++
          } else {
            unchanged++
          }
        } else {
          const file = `${shot.id}.${theme}.webp`
          writeFileSync(join(writeDir, file), webp)
          entry.themes[theme] = { file, bytes: webp.length, pixelSha256 }
          console.log(`OK ${shot.id} ${theme} ${webp.length}`)
        }
      } catch (error) {
        console.log(`FAIL ${shot.id} ${theme}: ${error.message.split("\n")[0]}`)
        failures++
        if (check) differences++
      }
    }
  }

  if (check) {
    const listed = new Set(shots.map((shot) => shot.id))
    for (const file of readdirSync(realDir)) {
      const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(light|dark)\.webp$/.exec(file)
      if (match && !listed.has(match[1])) {
        console.log(`STALE ${match[1]}`)
        differences++
      }
    }
    console.log(`UNCHANGED ${unchanged}`)
  } else {
    const manifest = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
  }
} finally {
  await browser.close()
}

if (check) process.exitCode = strict && (differences > 0 || failures > 0) ? 1 : 0
else if (failures > 0) process.exitCode = 1
