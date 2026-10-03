import { test, expect } from "./browserTest"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import { createRequire } from "node:module"
const require = createRequire(resolve(process.cwd(), "package.json"))
const axePath = require.resolve("axe-core/axe.min.js")
const shots = process.env.SMITHERS_VIEW_SHOTS ?? resolve(process.cwd(), "../../.artifacts/checks/C-UI-12", new Date().toISOString().replace(/[:.]/g, "-"))
test("every View story: light/dark, desktop/mobile, axe and overflow", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "C-UI-12 requires Chromium")
  test.setTimeout(600_000)
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
  await mkdir(shots, { recursive: true })
  await page.goto("/view-stories.html")
  const stories = await page.locator("nav a").evaluateAll(links => links.map(link => ({ name: link.textContent!, href: (link as HTMLAnchorElement).getAttribute("href")! })))
  expect(stories.length).toBeGreaterThan(0)
  const receipts = []
  for (const story of stories) for (const theme of ["light", "dark"]) for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await page.goto(`/view-stories.html${story.href}&theme=${theme}`)
    await expect(page.locator("[data-story]")).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.addScriptTag({ path: axePath })
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe
      return (await axe.run()).violations.filter(item => item.impact === "serious" || item.impact === "critical")
    })
    receipts.push({ story: story.name, theme, width, violations })
    await page.screenshot({ path: resolve(shots, `${story.name.replace(/[^a-z0-9_-]/gi, "-")}-${theme}-${width}.png`), animations: "disabled", fullPage: true })
    expect(violations, `${story.name} ${theme} ${width}`).toEqual([])
  }
  await writeFile(join(shots, "axe.json"), JSON.stringify(receipts, null, 2))
  expect(errors).toEqual([])
})
test("live agents respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/view-stories.html?story=PrimitivesView/actor-coding")
  await expect(page.locator("[data-live]")).toHaveCSS("animation-name", "none")
})

test("primitive labels, starting animation and neutral glyph colors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  for (const theme of ["light", "dark"]) {
    await page.goto(`/view-stories.html?story=PrimitivesView/state-starting-step&theme=${theme}`)
    await expect(page.locator(".mvp-state")).toHaveText("Starting · Implement")
    await expect(page.locator(".mvp-dot")).toHaveCSS("animation-name", "mvp-blink")
    await page.emulateMedia({ reducedMotion: "reduce" })
    await expect(page.locator(".mvp-dot")).toHaveCSS("animation-name", "none")
    await page.emulateMedia({ reducedMotion: "no-preference" })
    for (const [state, token] of [["in_review", "--text-muted"], ["merged", "--text-faint"]]) {
      await page.goto(`/view-stories.html?story=PrimitivesView/state-${state}&theme=${theme}`)
      const colors = await page.locator(".mvp-glyph").evaluate((glyph, token) => {
        const probe = document.createElement("span")
        probe.style.color = `var(${token})`
        document.body.append(probe)
        const expected = getComputedStyle(probe).color
        probe.remove()
        return { actual: getComputedStyle(glyph).color, expected }
      }, token!)
      expect(colors.actual).toBe(colors.expected)
    }
    await page.goto(`/view-stories.html?story=PrimitivesView/actor-fixture-system&theme=${theme}`)
    await expect(page.locator(".mvp-avatar")).toHaveAttribute("aria-label", "Install event")
  }
})

// T-UI-03 named Draft cases share the same fixture harness and Chromium runner.
import { fixtures as draftFixtures } from "@smthrs/rpc/fixtures/Draft"
for (const [name, fixture] of Object.entries(draftFixtures)) test(`Draft ${name}: supplied actions and keyboard`, async ({ page }) => {
  await page.goto(`/view-stories.html?story=${encodeURIComponent(`DraftView/${fixture.name}`)}`)
  await expect(page.getByRole("region", { name: "Draft", exact: true })).toBeVisible()
  await page.evaluate(() => {
    (window as unknown as { draftCalls: unknown[] }).draftCalls = []
    window.addEventListener("story-callback", event => {
      const detail = (event as CustomEvent).detail
      ;(window as unknown as { draftCalls: unknown[] }).draftCalls.push(detail)
    })
  })
  if (fixture.model.committed) {
    await expect(page.locator(".draft-actions button")).toHaveCount(0)
    await expect(page.locator(".draft-private")).toHaveCount(0)
  } else {
    await expect(page.locator(".draft-private")).toHaveText("Only you")
    for (const action of fixture.actions) {
      const control = page.locator(`button[data-flow="${action.tag}"]`)
      if (action.disabled) await expect(control).toBeDisabled()
      else { await control.focus(); await page.keyboard.press("Enter") }
    }
    expect(await page.evaluate(() => (window as unknown as { draftCalls: unknown[] }).draftCalls)).toEqual(
      fixture.actions.filter(action => !action.disabled).map(action => ({ kind: "action", value: { tag: action.tag, args: action.args ?? {} } })))
    await page.goto(`/view-stories.html?story=${encodeURIComponent(`DraftView/${fixture.name}`)}&removeFirst`)
    await expect(page.locator(`button[data-flow="${fixture.actions[0]!.tag}"]`)).toHaveCount(0)
    await expect(page.locator('button[data-flow="draft.discard"]')).toHaveCount(1)
  }
})

test("Draft field edits forward literal payloads once and unchanged blur is silent", async ({ page }) => {
  await page.goto("/view-stories.html?story=DraftView/From%20an%20issue%20it%20closes")
  await page.evaluate(() => {
    (window as unknown as { draftCalls: unknown[] }).draftCalls = []
    window.addEventListener("story-callback", event => (window as unknown as { draftCalls: unknown[] }).draftCalls.push((event as CustomEvent).detail))
  })
  await page.getByRole("textbox", { name: "Title", exact: true }).focus()
  await page.getByRole("textbox", { name: "Title", exact: true }).blur()
  expect(await page.evaluate(() => (window as unknown as { draftCalls: unknown[] }).draftCalls)).toEqual([])
  for (const [label, value] of [["Title", "Browser title"], ["Prompt", "Browser\nprompt"], ["Acceptance", "First\nSecond"]]) {
    const field = page.getByRole("textbox", { name: label!, exact: true })
    await field.fill(value!); await field.blur()
  }
  const place = page.getByRole("combobox", { name: "Place", exact: true })
  await place.selectOption('{"mode":"before","n":8}'); await place.blur()
  const fixes = page.getByRole("checkbox")
  await fixes.uncheck(); await fixes.blur()
  expect(await page.evaluate(() => (window as unknown as { draftCalls: unknown[] }).draftCalls)).toEqual([
    { kind: "action", value: { tag: "form.set", args: { entry: "entry-draft-1", field: "title", value: "Browser title" } } },
    { kind: "action", value: { tag: "form.set", args: { entry: "entry-draft-1", field: "prompt", value: "Browser\nprompt" } } },
    { kind: "action", value: { tag: "form.set", args: { entry: "entry-draft-1", field: "acceptance", value: '["First","Second"]' } } },
    { kind: "action", value: { tag: "form.set", args: { entry: "entry-draft-1", field: "place", value: '{"mode":"before","n":8}' } } },
    { kind: "action", value: { tag: "form.set", args: { entry: "entry-draft-1", field: "fixes", value: "false" } } }
  ])
})
