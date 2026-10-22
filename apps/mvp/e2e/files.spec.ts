import type { Page } from "@playwright/test"
import { expect, step, test } from "./fixtures"
import { requires, scriptedAgent } from "./target"

// File tabs end to end (docs/features/files.md), against the real app, Worker, Postgres, Electric, GitHub and Code
// Storage: the agent opens a file of the branch the person's workspace shows as a tab, its lines highlighted, through
// `file/open`; and a person moves between tabs and closes them with the keyboard, through the same flows. The agent is
// the scripted one in the asking browser's engine worker (`?agent=show-code`, src/test/scriptedAgent.ts), so it calls
// the flow the same way every time; the eval case `files-show-lines` holds the real model to it. The fixture is the
// public `octocat/Spoon-Knife`, cloned once. Opening a branch's page tracks it and asking needs a Member or above.

requires("member", "ownConversation", "codeStorage")

const REPO = "/octocat/Spoon-Knife"

/** Opens Spoon-Knife, cloning it if no run has yet, and waits until its code is on the device. */
const openReady = (page: Page) =>
  step("Open Spoon-Knife", async () => {
    await page.goto(REPO)
    const header = page.locator('header[aria-label="Repository"]')
    await expect(header).toContainText("octocat / Spoon-Knife", { timeout: 30_000 })
    const picker = page.getByRole("button", { name: "main", exact: true })
    const clone = header.getByRole("button", { name: "Clone" })
    await expect(picker.or(clone)).toBeVisible({ timeout: 60_000 })
    if (await clone.isVisible()) await clone.click()
    await expect(picker).toBeVisible({ timeout: 120_000 })
  })

const strip = (page: Page) => page.getByRole("tablist", { name: "Open files" })

/** The code view's line `line`, highlighted or not: the code renders in an open shadow root, which locators pierce. */
const line = (page: Page, n: number, selected: boolean) =>
  page.locator(`[data-line="${n}"]${selected ? "[data-selected-line]" : ":not([data-selected-line])"}`).first()

test(
  "agent shows code: asked to show lines of a file, the agent opens it as a tab with the lines highlighted",
  { annotation: { type: "summary", description: "The agent opens index.html at lines 3 to 5 as a tab beside README.md, the lines highlighted." } },
  async ({ page }) => {
    requires("scriptedAgent")
    await openReady(page)
    await step("Open README.md", async () => {
      await page.goto(`${REPO}/blob/main/README.md`)
      await expect(strip(page).getByRole("tab", { name: "README.md" })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 })
    })
    await step("Open the branch's workspace", async () => {
      await page.goto(scriptedAgent("show-code", `${REPO}/tree/main`))
      await expect(page.getByRole("navigation", { name: "Branch" })).toContainText("main", { timeout: 30_000 })
      // The strip shows on the branch's directory pages too, no file on screen.
      await expect(strip(page).getByRole("tab", { name: "README.md" })).toHaveAttribute("aria-selected", "false")
    })
    await step("Ask Smithers to show index.html at lines 3 to 5", async () => {
      const composer = page.getByRole("textbox", { name: "Message Smithers" })
      await composer.fill("show-code index.html 3-5")
      await composer.press("Enter")
    })
    await step("The file opens as a tab, lines 3 to 5 highlighted", async () => {
      await expect(page).toHaveURL(/\/octocat\/Spoon-Knife\/blob\/main\/index\.html\?L=3-5$/, { timeout: 60_000 })
      await expect(strip(page).getByRole("tab")).toHaveText(["README.md", "index.html"])
      await expect(strip(page).getByRole("tab", { name: "index.html" })).toHaveAttribute("aria-selected", "true")
      for (const n of [3, 4, 5]) await expect(line(page, n, true)).toBeVisible({ timeout: 30_000 })
      for (const n of [2, 6]) await expect(line(page, n, false)).toBeVisible()
    })
  },
)

test(
  "keyboard: arrows move between file tabs, Enter opens one, Delete closes the one on screen",
  { annotation: { type: "summary", description: "Arrows and Enter switch file tabs; Delete closes the file on screen and the tab beside it shows, at its lines." } },
  async ({ page }) => {
    await openReady(page)
    await step("Open two files, the second at lines 2 to 4", async () => {
      await page.goto(`${REPO}/blob/main/README.md`)
      await expect(strip(page).getByRole("tab")).toHaveText(["README.md"], { timeout: 30_000 })
      await page.goto(`${REPO}/blob/main/index.html?L=2-4`)
      await expect(strip(page).getByRole("tab")).toHaveText(["README.md", "index.html"], { timeout: 30_000 })
    })
    const readme = strip(page).getByRole("tab", { name: "README.md" })
    const index = strip(page).getByRole("tab", { name: "index.html" })
    await step("← moves to README.md, Enter opens it", async () => {
      await index.focus()
      await page.keyboard.press("ArrowLeft")
      await expect(readme).toBeFocused()
      await page.keyboard.press("Enter")
      await expect(page).toHaveURL(/\/blob\/main\/README\.md$/)
      await expect(readme).toHaveAttribute("aria-selected", "true")
    })
    await step("Delete closes README.md; index.html shows, at its lines", async () => {
      await readme.focus()
      await page.keyboard.press("Delete")
      await expect(page).toHaveURL(/\/blob\/main\/index\.html\?L=2-4$/)
      await expect(strip(page).getByRole("tab")).toHaveText(["index.html"])
      await expect(index).toBeFocused()
      await expect(line(page, 3, true)).toBeVisible({ timeout: 30_000 })
    })
    await step("A reload keeps the tab", async () => {
      await page.reload()
      await expect(strip(page).getByRole("tab")).toHaveText(["index.html"], { timeout: 30_000 })
    })
  },
)
