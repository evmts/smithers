import { expect, test } from "./browserTest"
import { SCOPED_TEST_USER, signedOutVisitor, skipSignup, identityRoute } from "./identity"
import { APPLICATION_SIGN_IN_PATH } from "@smthrs/rpc/ApplicationAuth"

for (const key of ["Enter", "Space"]) test(`a Chat refusal survives account cleanup and an explicit ${key} retry`, async ({ page }) => {
  await signedOutVisitor(page)
  let signedIn = true
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", route => identityRoute(signedIn ? SCOPED_TEST_USER.login : null)(route))
  // smithersai/smithers is the signed-in user's own repository. No public
  // catalog admits it: signed-out catalog admission ended with guest chat (68f1d894).
  await page.route(url => url.pathname === "/api/user/repos", route => route.fulfill({ json: { repos: signedIn ? [{
    owner: "smithersai", name: "smithers", full_name: "smithersai/smithers", default_bookmark: "main", owner_type: "Organization"
  }] : [] } }))
  // /owner/repo opens the repository frame (59f7a91e, bf0ae9f8). Signed out,
  // its Ask door is sign-in. A 204 handoff keeps the page, so the retry is
  // observable and the refusal must still be on screen after it.
  const signIns: string[] = []
  await page.route(url => url.pathname === APPLICATION_SIGN_IN_PATH, route => { signIns.push(route.request().url()); return route.fulfill({ status: 204 }) })
  // Hold the real SQLite commit while the account privacy barrier is active.
  // No application debug API or replacement persistence implementation.
  await page.addInitScript(() => {
    const nativePost = Worker.prototype.postMessage
    const held: Array<() => void> = []
    const probe = { armed: true, commits: 0, release: () => { probe.armed = false; for (const send of held.splice(0)) send() } }
    ;(window as any).privacyCommitProbe = probe
    Worker.prototype.postMessage = function(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
      const send = () => Reflect.apply(nativePost, this, [message, options])
      if (probe.armed && JSON.parse(localStorage.getItem("smithers-mvp.privacyRetirement") ?? "null")?.phase === "pending" &&
          typeof message === "object" && message !== null && "sql" in message && typeof message.sql === "string" && /^\s*COMMIT\b/i.test(message.sql)) {
        probe.commits++; held.push(send)
      } else send()
    }
  })
  await page.goto("/smithersai/smithers/")
  await skipSignup(page)
  signedIn = false
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  const input = page.getByTestId("composer-input")
  const ask = page.getByRole("button", { name: "Ask", exact: true })
  const notice = page.getByRole("alert").filter({ hasText: "Account cleanup is running. Try again in a moment." })
  try {
    await expect.poll(() => page.evaluate(() => (window as any).privacyCommitProbe.commits)).toBeGreaterThan(0)
    await expect(ask).toBeVisible()
    await ask.focus()
    await expect(ask).toBeFocused()
    await page.keyboard.press(key)
    await expect(input).toBeHidden()
    await expect(notice).toBeVisible()
    expect(signIns).toEqual([])
    await page.evaluate(() => (window as any).privacyCommitProbe.release())
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("smithers-mvp.privacyRetirement") ?? "null")?.phase)).toBe("complete")
    // Cleanup cannot silently replay the refused gesture or erase its failure.
    await expect(input).toBeHidden()
    await expect(notice).toBeVisible()
    expect(signIns).toEqual([])
    // The explicit retry runs the signed-out Ask door once, keeping this route. The Ask door's
    // sign-in returns to the page with Ask open (Design d-fbhqgy, 1279014a): `?ask=1`, no draft.
    await ask.focus()
    await page.keyboard.press(key)
    await expect.poll(() => signIns.length).toBe(1)
    expect(new URL(signIns[0]!).searchParams.get("return_to")).toBe("/smithersai/smithers/?ask=1")
    expect(new URL(page.url()).pathname).toBe("/smithersai/smithers/")
    // A later act does not acknowledge the refusal; it stays until dismissed.
    await expect(notice).toBeVisible()
    await expect(input).toBeHidden()
  } finally {
    await page.evaluate(() => (window as any).privacyCommitProbe.release()).catch(() => {})
  }
})
