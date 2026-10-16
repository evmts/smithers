import { scenario } from "./coverage/types"
import { authenticatedTest } from "./auth-permissions/profile"
import { withOwnedImportedRepository } from "./issues/cloud"
import { withRetainedGitHubImport } from "./repositories-github/reusable-import"
import { isPlueImportMode } from "./repositories-github/reusable-source"
import {
  attachProductionJson,
  repositoryApiPath
} from "./repositories-github/production"
import { command, expect, realApi } from "./support/test"
import { journeyActivate } from "./support/keyboard-journey-input"

authenticatedTest.setTimeout(12 * 60_000)
authenticatedTest.use({ actionTimeout: 30_000 })

const repositoryText = (value: { readonly encoding?: unknown; readonly content?: unknown }): string => {
  if (typeof value.content !== "string") throw new Error("Repository content did not contain a string payload.")
  if (value.encoding === "utf-8") return value.content
  if (value.encoding === "base64") return Buffer.from(value.content, "base64").toString("utf8")
  throw new Error(`Repository content used an unsupported encoding: ${String(value.encoding)}`)
}

authenticatedTest(
  "a GitHub source imports through the product and reads back from the direct repository facade",
  scenario("repositories.github-import-direct-readback", {
    capabilities: ["identity", "github"],
    description: "Import the registered retained GitHub source in Plue modes (an owned disposable source elsewhere), wait for the exact accepted job, then read its metadata, main bookmark, and README through the canonical repository API.",
    coverage: [
      "action:repos.import", "host:production", "path:success", "path:persistence", "door:slash",
      "surface:repository-api", "dimension:github-import", "dimension:exact-job-id",
      "dimension:direct-repository-readback", "dimension:owned-cleanup",
      "evidence:import-job-and-direct-readback"
    ]
  }),
  async ({ page, request, context }, testInfo) => {
    const readback = async (repo: string): Promise<void> => {
      const metadataResponse = await realApi(page, request, "GET", repositoryApiPath(repo))
      expect(metadataResponse.status()).toBe(200)
      const metadata = await metadataResponse.json() as Record<string, unknown>
      expect(metadata).toMatchObject({ full_name: repo, private: true, default_bookmark: "main" })

      const bookmarksResponse = await realApi(page, request, "GET", repositoryApiPath(repo, "/bookmarks"))
      expect(bookmarksResponse.status()).toBe(200)
      const bookmarks = await bookmarksResponse.json() as { readonly items?: ReadonlyArray<{ readonly name?: unknown }> }
      expect(bookmarks.items).toEqual(expect.arrayContaining([expect.objectContaining({ name: "main" })]))

      const readmeResponse = await realApi(page, request, "GET", repositoryApiPath(repo, "/contents/README.md?ref=main"))
      expect(readmeResponse.status()).toBe(200)
      const readme = await readmeResponse.json() as { readonly encoding?: unknown; readonly content?: unknown }
      expect(repositoryText(readme)).toContain(repo.split("/")[1]!)

      await attachProductionJson(testInfo, "github-import-direct-readback", {
        repo,
        metadataStatus: metadataResponse.status(),
        bookmarksStatus: bookmarksResponse.status(),
        bookmarkNames: bookmarks.items?.map(({ name }) => name),
        readmeStatus: readmeResponse.status()
      })
    }
    if (isPlueImportMode(process.env.SMITHERS_REAL_E2E_MODE)) {
      await withRetainedGitHubImport({ page, request, context }, testInfo, readback)
    } else {
      await withOwnedImportedRepository({ page, request, context }, testInfo, async ({ repo }) => readback(repo))
    }
  }
)

authenticatedTest("launcher reads published updates and public repositories through their flows", scenario("repositories.launcher-reads", {
  capabilities: [],
  coverage: ["action:app.updates", "action:repos.explore", "host:production", "path:success", "door:slash",
    "evidence:source-responses-and-rendered-links"]
}), async ({ page }, testInfo) => {
  await page.goto("/?tutorial")
  const launcher = page.getByTestId("repository-launcher")
  await expect(launcher).toBeVisible()
  await expect(launcher.getByText("Reading the Smithers releases…", { exact: true })).toHaveCount(0)
  await expect(launcher.getByText("Reading the public repositories…", { exact: true })).toHaveCount(0)

  const newsRead = page.waitForResponse(response => new URL(response.url()).origin === "https://api.github.com" &&
    new URL(response.url()).pathname === "/repos/smithersai/smithers/releases")
  await command(page, "/app.updates")
  const news = await newsRead
  expect(news.status()).toBe(200)
  const releases = await news.json() as Array<{ draft: boolean; published_at: string; html_url: string; name: string; tag_name: string }>
  const published = releases.filter(row => !row.draft && row.published_at)
    .sort((left, right) => right.published_at.localeCompare(left.published_at)).slice(0, 5)
  const updates = launcher.getByRole("list", { name: "Smithers updates", exact: true })
  await expect(updates.getByRole("link")).toHaveText(published.map(row => row.name || row.tag_name))
  for (const row of published) await expect(updates.locator(`a[href="${row.html_url}"]`)).toHaveText(row.name || row.tag_name)

  const catalogRead = page.waitForResponse(response => new URL(response.url()).pathname === "/api/public/repos")
  await command(page, "/repos.explore")
  const catalog = await catalogRead
  expect(catalog.status()).toBe(200)
  const { repos } = await catalog.json() as { repos: Array<{ name: string }> }
  for (const summary of await launcher.locator("summary").all()) await journeyActivate(summary)
  for (const repo of repos) await expect(launcher.locator(`a[href="/${repo.name.toLowerCase()}/"]`)).toBeVisible()
  if (repos.length === 0) await expect(launcher.getByText("No repositories are public yet.", { exact: true })).toBeVisible()
  await attachProductionJson(testInfo, "launcher-reads", { updates: published.map(row => row.html_url), repositories: repos.map(row => row.name) })
})

authenticatedTest("a bare repository create asks for its name without creating anything", scenario("repositories.launcher-create-form", {
  capabilities: ["identity", "cloud"],
  coverage: ["action:repos.create", "host:production", "path:success", "door:slash",
    "evidence:unsubmitted-form-and-empty-create-requests"]
}), async ({ page }) => {
  await page.goto("/?tutorial")
  await expect(page.getByTestId("repository-launcher").getByLabel("New repository name")).toBeVisible()
  const creates: string[] = []
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/user/github-repos") creates.push(request.method())
  })
  await command(page, "/repos.create")
  const form = page.locator('.flow-form[data-flow-name="repos.create"]')
  await expect(form.getByLabel("Repository name")).toHaveValue("")
  await expect(form.getByRole("button", { name: "Submit", exact: true })).toBeDisabled()
  expect(creates).toEqual([])
})
