import { expect, test } from "./browserTest"
import { identityRoute, signedOutVisitor } from "./identity"

test("an incomplete empty activity read never claims nothing new and can be refreshed", async ({ page }) => {
  const repo = "smithersai/smithers"
  let available = false
  await signedOutVisitor(page)
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
  await page.route(`**/api/repos/${repo}`, route => route.fulfill({ json: { is_public: true, default_bookmark: "main" } }))
  await page.route(url => url.pathname === `/api/repos/${repo}/issues`, route => route.fulfill({ json: [] }))
  await page.route(url => [
    `/api/user/github-repos/${repo}/issues`, `/api/repos/${repo}/landings`, "/api/notifications/list"
  ].includes(url.pathname), route => route.fulfill(available ? { json: [] } : { status: 401, json: { message: "Sign in" } }))
  await page.goto(`/${repo}?design=off`)
  await page.getByRole("button", { name: "Chat", exact: true }).click()
  const input = page.getByTestId("composer-input")
  await input.fill(`/repo.overview ${repo}`)
  await input.press("Enter")
  const activity = page.locator(".repo-update")
  await expect(activity).toBeVisible()
  await expect(activity.getByRole("status")).toContainText("Partial update:")
  await expect(activity.getByText("Nothing new since the last check.", { exact: true })).toHaveCount(0)
  await page.goto(`/${repo}?design=off`)
  await expect(activity.getByRole("status")).toBeVisible()
  await expect(activity.getByText("Nothing new since the last check.", { exact: true })).toHaveCount(0)
  available = true
  await activity.getByRole("button", { name: "Refresh", exact: true }).press("Enter")
  await expect(activity.getByRole("status")).toHaveCount(0)
  await expect(activity.getByText("Nothing new since the last check.", { exact: true })).toBeVisible()
})

test("activity waits for URL admission across reload without blocking Chat or duplicating the read", async ({ page }) => {
  const repo = "smithersai/smithers"
  await signedOutVisitor(page)
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
  const admission = Promise.withResolvers<void>(), activity = Promise.withResolvers<void>()
  let reads = 0
  await page.route(`**/api/repos/${repo}`, async route => {
    await admission.promise
    await route.fulfill({ json: { is_public: true, default_bookmark: "main" } }).catch(() => {})
  })
  await page.route(url => url.pathname === `/api/repos/${repo}/issues`, async route => {
    if (route.request().url().includes("state=open")) { reads++; await activity.promise }
    await route.fulfill({ json: [{ number: 1, title: "Admitted activity", state: "open" }] }).catch(() => {})
  })
  await page.route(url => [
    `/api/user/github-repos/${repo}/issues`, `/api/repos/${repo}/landings`, "/api/notifications/list"
  ].includes(url.pathname), route => route.fulfill({ status: 401, json: { message: "Sign in" } }))
  const command = async () => {
    const input = page.getByTestId("composer-input")
    if (!await input.isVisible()) await page.getByRole("button", { name: "Chat", exact: true }).click()
    await input.fill(`/repo.overview ${repo}`)
    await input.press("Enter")
    await expect(input).toBeHidden()
  }
  try {
    await page.goto(`/${repo}?design=off`)
    await command()
    await command()
    const waiting = page.locator('.notice[data-tone="live"]').filter({ hasText: "Loading repository" })
    await expect(waiting).toBeVisible()
    expect(reads).toBe(0)
    await page.getByRole("button", { name: "Chat", exact: true }).click()
    await page.getByTestId("composer-input").fill("Chat remains usable")
    await expect(page.getByTestId("composer-input")).toHaveValue("Chat remains usable")
    await page.goto(`/${repo}?design=off`)
    await expect(waiting).toBeVisible()
    expect(reads).toBe(0)
    admission.resolve()
    await expect.poll(() => reads).toBe(1)
    await expect(waiting).toBeVisible()
    activity.resolve()
    const card = page.locator(".repo-update")
    await expect(card).toContainText("Admitted activity")
    await expect(waiting).toHaveCount(0)
    expect(reads).toBe(1)
    await page.goto(`/${repo}?design=off`)
    await expect(card).toContainText("Admitted activity")
    expect(reads).toBe(1)
  } finally { admission.resolve(); activity.resolve() }
})
