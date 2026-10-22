import { expect, step, test } from "./fixtures"
import { as, homeOf, landing, openHome, readCode, readDocs, REPO, tabsOf, viewsOf } from "./vibelang"

// The visitor's journey on the VibeLang repository (rulings SCOPE-12, SCOPE-13): someone signed out opens
// smithers.sh/smithersai/vibelang, sees VibeLang's landing page and nothing of its contributors' or maintainers', reads
// its docs in the app and browses its code. It reads GitHub and vibelang.sh live and needs no clone, so it runs
// wherever the app runs, against a deployment too (`BASE_URL=https://smithers.sh pnpm e2e:prod`).

test.describe("VibeLang on Smithers", () => {
  test(
    "visitor: VibeLang's landing page, its docs and its code, signed out",
    { annotation: { type: "summary", description: "Signed out, VibeLang opens on its landing page; Docs and Code are one tab away." } },
    async ({ page }) => {
      test.setTimeout(180_000)
      await as(page, "visitor")
      await openHome(page, "everyone")
      await step("The landing page: VibeLang, install, an example, why", () => landing(page))
      await step("Nothing of the contributors' or maintainers', and no view to switch to", async () => {
        await expect(page.getByRole("region", { name: "Contribute" })).toHaveCount(0)
        await expect(page.getByRole("region", { name: "Today" })).toHaveCount(0)
        await expect(page.getByRole("button", { name: "New branch" })).toHaveCount(0)
        await expect(viewsOf(page)).toHaveCount(0)
      })
      await step("Home, Code and Docs tabs", async () => {
        await expect(tabsOf(page).getByRole("link")).toHaveText(["Home", "Code", "Docs"])
        await expect(tabsOf(page).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page")
      })
      await readDocs(page)
      await step("Home comes back", async () => {
        await tabsOf(page).getByRole("link", { name: "Home" }).click()
        await expect(page).toHaveURL(new RegExp(`${REPO}$`))
        await expect(homeOf(page)).toHaveAttribute("data-audience", "everyone")
      })
      await readCode(page)
    },
  )
})
