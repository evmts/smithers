import { expect, test } from "./browserTest"
import { installCloudFixture } from "./cloudFixture"

test("the site app keeps its repository and an owner manages DNS from the keyboard", async ({ page }) => {
  await installCloudFixture(page, { capabilities: ["identity", "sites"], repos: [] })
  await page.route(url => url.pathname === "/repo/", async route => {
    const response = await route.fetch()
    const html = (await response.text()).replace("<head>", '<head><meta name="smithers-repository-site" content="{&quot;repository&quot;:&quot;owner/docs&quot;,&quot;appPrefix&quot;:&quot;/repo/&quot;}">')
    await route.fulfill({ response, body: html })
  })
  await page.route("**/api/repos/owner/docs", route => route.fulfill({ json: { name: "docs", is_public: true, default_bookmark: "main" } }))
  let finish!: () => void
  const waiting = new Promise<void>(resolve => { finish = resolve })
  const posts: unknown[] = []
  await page.route("**/api/repos/owner/docs/site", async route => {
    posts.push(route.request().postDataJSON())
    await waiting
    await route.fulfill({ json: { hostname: "docs.customer.test", bound: false, verified: false, records: [{ type: "TXT", name: "_smithers.docs.customer.test", value: "dns-proof" }] } })
  })
  await page.goto("/repo/")
  const composer = page.getByTestId("composer-input")
  await expect(composer).toBeAttached()
  if (!await composer.isVisible()) await page.getByRole("button", { name: "Chat", exact: true }).press("Enter")
  await composer.fill("/site")
  await composer.press("Enter")
  const form = page.locator('.flow-form[data-flow-name="site"]').last()
  await expect(form).toBeVisible()
  await form.getByTestId("flow-form-action").selectOption("domain.add")
  await form.getByTestId("flow-form-domain").fill("docs.customer.test")
  const submit = form.getByRole("button", { name: "Apply", exact: true })
  await expect(submit).toBeEnabled()
  await submit.press("Enter")
  await expect.poll(() => posts.length).toBe(1)
  if (!await composer.isVisible()) await page.getByRole("button", { name: "Chat", exact: true }).press("Enter")
  await composer.fill("Chat is usable during DNS verification")
  await expect(composer).toHaveValue("Chat is usable during DNS verification")
  expect(page.url()).toMatch(/\/repo\/$/)
  finish()
  await expect(page.getByText("_smithers.docs.customer.test", { exact: true })).toBeVisible()
  await expect(page.getByText("dns-proof", { exact: true })).toBeVisible()
  expect(posts).toEqual([{ action: "domain.add", domain: "docs.customer.test" }])
  await page.reload()
  await expect(page.getByTestId("composer-input")).toBeAttached()
  expect(page.url()).toMatch(/\/repo\/$/)
})
