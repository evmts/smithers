import { expect, test } from "./browserTest"
import { identityRoute } from "./identity"
const sha = "a".repeat(40)
const commit = { sha, short_sha: "aaaaaaa", title: "Serve real history", body: "Keep immutable identities.", author: "Ada", authored_at: "2026-10-18T10:00:00Z", committed_at: "2026-10-18T10:00:00Z", parents: ["b".repeat(40)] }
for (const width of [1440, 1280, 390]) for (const theme of ["light", "dark"] as const) {
 test(`history ${width} ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({width, height: width === 390 ? 844 : 900})
  await page.emulateMedia({colorScheme: theme})
  await page.route("**/api/bootstrap", route => route.fulfill({ json: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "cloud"], authFlow: "redirect", sandbox: null } }))
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute(null))
  await page.route("**/api/public/repos", route => route.fulfill({json:{repos:[{name:"alpha/one"}]}}))
  await page.route("**/api/repos/alpha/one", route => route.fulfill({json:{default_bookmark:"main",is_public:true}}))
  await page.route("**/api/repos/alpha/one/bookmarks?*", route => route.fulfill({json:{items:[{name:"main",target_change_id:"change",target_commit_id:sha}],next_cursor:""}}))
  let mode: "ready" | "error" | "empty" = "ready"
  await page.route("**/api/repos/alpha/one/commits?*", route => mode === "error" ? route.fulfill({status:503,json:{message:"History unavailable"}}) : route.fulfill({json:{items:mode === "empty" ? [] : [commit], ...(new URL(route.request().url()).searchParams.has("cursor") ? {} : {next_cursor:"next"})}}))
  await page.goto("/alpha/one/commits/main")
  const view=page.getByRole("region",{name:"Commit history"})
  await expect(view.getByRole("link",{name:commit.title})).toBeVisible()
  await expect(page.locator(".repo-frame")).toBeVisible()
  await expect(view).toContainText("Ada")
  await expect(view).not.toContainText("Verified")
  await page.screenshot({path:info.outputPath(`history-commits-main.${width}.${theme}.png`)})
  const controls=view.locator("a,button:not(:disabled)")
  for(let i=0;i<await controls.count();i++){await controls.nth(i).focus();await expect(controls.nth(i)).toBeFocused()}
  const older=page.waitForRequest(r=>r.url().includes("cursor=next"))
  await view.getByRole("link",{name:"Older",exact:true}).press("Enter"); await older
  await expect(view.getByRole("link",{name:"Newer",exact:true})).toBeEnabled()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  mode="error";await page.reload();await expect(view.getByRole("alert")).toBeVisible()
  mode="empty";await view.getByRole("button",{name:"Retry",exact:true}).press("Enter");await expect(view).toContainText("No commits found.")
 })
}
