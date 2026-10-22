import { expect, test } from "./devices"
import { requires, scratchRepository } from "./target"

// Opening an issue on a repository other than the deployment's own (decision 0079, docs/features/issues.md#routes): the
// real app, ChatApi, its role read from GitHub with the App, the `github/Write` flow and GitHub itself. It writes to
// GitHub as the test account, so it runs only against a deployment signed in as that account
// (e2e/deployment/sign-in.setup.ts), on the scratch repository E2E_ISSUES_REPOSITORY, which must not be the
// deployment's own GITHUB_REPOSITORY (E2E_SYNCED_REPOSITORY, smithersai/smithers unless set): on smithers.sh,
// roninjin10/smithers-github-tests (`requires("secondRepository")`, e2e/target.ts). The issues list syncs only the
// deployment's own repository so far (0079, Slice 1), so the issue is checked where it lands: on GitHub.

test("another repository: a Member opens an issue on a repository other than the deployment's own, and GitHub has it", {
  annotation: { type: "summary", description: "An issue opened on a second repository reaches that repository on GitHub." },
}, async ({ devices }) => {
  requires("secondRepository", "member")
  test.setTimeout(240_000)
  const repo = scratchRepository()
  const [maya] = await devices.open("Maya")
  const page = maya.page
  const title = `Smithers e2e second repository ${new Date().toISOString()}`

  await test.step("Maya opens an issue on the second repository", async () => {
    await page.goto(`/${repo}/issues/new`)
    await page.getByLabel("Title").fill(title)
    await page.getByLabel("Description").fill("Opened by the second-repository e2e test.")
    await page.getByRole("button", { name: "Create issue" }).click()
    await expect(page).toHaveURL(new RegExp(`/${repo}/issues$`))
  })

  const row = page.getByRole("listitem").filter({ hasText: title })
  await test.step("the deployment takes it: Requested, never Not sent", async () => {
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(row).not.toContainText("Not sent", { timeout: 15_000 })
  })

  const url = await test.step("GitHub has it on that repository, opened by Maya", async () => {
    let found: string | undefined
    await expect.poll(async () => {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=20`,
        { headers: { accept: "application/vnd.github+json" } },
      )
      if (!response.ok) return undefined
      const issues = (await response.json()) as ReadonlyArray<{ readonly title: string; readonly html_url: string }>
      found = issues.find((issue) => issue.title === title)?.html_url
      return found
    }, { timeout: 120_000, intervals: [2_000, 5_000] }).toBeDefined()
    return found!
  })

  await test.step("the issue on GitHub", async () => {
    await page.goto(url)
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 })
  })
})
