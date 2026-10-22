import { expect, step, test } from "./fixtures"
import { requires } from "./target"

requires("faults", "member", "devPeople")

test("shape recovery: a new branch's composer appears after three 503s without reloading", {
  annotation: { type: "summary", description: "A temporary sync outage heals and the branch composer appears by itself." },
}, async ({ page }) => {
  const logs: string[] = []
  let navigations = 0
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++
    if (request.url().includes("/api/telemetry/v1/logs")) logs.push(request.postData() ?? "")
  })
  await step("Open a branch during a sync outage", async () => {
    await page.goto("/octocat/Spoon-Knife/tree/test-branch?faults=recovery")
    await page.waitForFunction(() => "faults" in window)
  })
  await step("The shape retries and the composer recovers", async () => {
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { faults: { shapes: { failures: () => number } } }).faults.shapes.failures(),
    ), { timeout: 30_000 }).toBe(3)
    await page.getByRole("button", { name: /Chat/ }).click()
    await expect(page.getByRole("textbox", { name: "Message Smithers" })).toBeVisible({ timeout: 30_000 })
    await page.getByRole("textbox", { name: "Message Smithers" }).fill("Recovered draft")
    await expect(page.getByRole("textbox", { name: "Message Smithers" })).toHaveValue("Recovered draft")
    await expect.poll(() => logs.join("\n"), { timeout: 30_000 }).toContain("chat load recovered")
    expect(logs.join("\n")).toContain("chat load failed")
    expect(navigations).toBe(1)
    expect(logs.join("\n")).not.toContain("Recovered draft")
  })
})

test("Member access: the page never requests Admin alert shapes and direct requests are 403", async ({ page, context }) => {
  await context.addCookies([{ name: "__Host-smithers_dev_person", value: "teammate", url: test.info().project.use.baseURL!, secure: true }])
  const requested: string[] = []
  page.on("request", (request) => requested.push(new URL(request.url()).pathname))
  await page.goto("/app")
  await expect(page.getByRole("button", { name: /Chat/ })).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => page.evaluate(async () => (await fetch("/api/auth/session")).json())).toMatchObject({ role: "member" })
  expect(requested.filter((path) => /shapes\/(spend-alerts|alert-channels|alert-deliveries)$/.test(path))).toEqual([])
  for (const name of ["spend-alerts", "alert-channels", "alert-deliveries"]) {
    const response = await context.request.get(`/api/shapes/${name}?offset=-1`)
    expect(response.status()).toBe(403)
    expect(response.headers()["retry-after"]).toBeUndefined()
  }
})
