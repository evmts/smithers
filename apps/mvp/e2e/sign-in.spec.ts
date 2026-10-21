import { SIGN_IN, SIGN_IN_TO_ASK, SIGN_OUT } from "../src/features/auth/contract"
import { QUESTIONS_ROUTE, SHAPE_ROUTE } from "../src/features/chat/contract"
import type { Dialog, Page } from "@playwright/test"
import { faults } from "./faults"
import { expect, type Tab, test } from "./devices"

// Sign-in, end to end (docs/features/sign-in.md): the real app, ChatApi and Postgres. Under `alchemy dev` without the
// GitHub App, a local developer is signed in as an Admin until they sign out, and "Sign in with GitHub" signs them in
// again without GitHub (`worker/DevChatApi.ts`). A deployment signs in through GitHub, which this suite can't drive.

const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(process.env.BASE_URL ?? "http://localhost:1337")
test.skip(!local, "signing in on a deployment goes through GitHub; these run against alchemy dev's local developer")

test("signed out: the composer is gated, ChatApi refuses an ask, and signing in brings the composer back", { annotation: { type: "summary", description: "Signed out, a person can't ask, the server refuses an ask, and signing in brings the composer back." } }, async ({ devices }) => {
  const [a] = await devices.open("A")
  const page = a.page
  await expect(a.chatButton).toBeVisible({ timeout: 30_000 })

  // Sign out: the page continues as a visitor, with the sign-in prompt where the composer was.
  await page.getByRole("button", { name: SIGN_OUT }).click()
  await expect(page.getByText(SIGN_IN_TO_ASK)).toBeVisible({ timeout: 30_000 })
  await expect(a.chatButton).toBeHidden()
  await page.keyboard.press("ControlOrMeta+k")
  await expect(a.composer).toBeHidden()

  // Nothing a signed-out page sends is taken: ChatApi refuses the ask itself, and writes nothing.
  const refused = await page.request.post(QUESTIONS_ROUTE, {
    data: { id: crypto.randomUUID(), answerId: crypto.randomUUID(), text: `signed out ${devices.word}` },
  })
  expect(refused.status()).toBe(401)

  // Sign in again: the button returns to this page, signed in, and the composer is back.
  await page.getByRole("link", { name: SIGN_IN }).first().click()
  await expect(a.chatButton).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(SIGN_IN_TO_ASK)).toBeHidden()
})

test("sign out wipes the device: its unsent questions go, and the conversation syncs again from scratch", { annotation: { type: "summary", description: "Signing out deletes the device's unsent questions, and the conversation syncs again from scratch." } }, async ({ devices }) => {
  const word = devices.word
  const [a] = await devices.openFaulty("A")
  const page = a.page

  // A question ChatApi refused stays on the device, Not sent: the person's own data, kept in the device's store.
  await faults(page).questions.failNext("bad_request")
  const kept = `Never sent ${word}`
  await a.ask(kept)
  await a.expectNotSent(kept)

  // Sign out. The tab wipes the device's database, the engine's journal and the outbox, then opens as a visitor.
  // The shape requests of the page signing out opens as: a navigation starts the list over.
  const shapes: Array<URL> = []
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) shapes.length = 0
  })
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (url.pathname === SHAPE_ROUTE) shapes.push(url)
  })
  await page.getByRole("button", { name: SIGN_OUT }).click()
  await expect(page.getByText(SIGN_IN_TO_ASK)).toBeVisible({ timeout: 30_000 })

  // The unsent question is gone, and the conversation's first request after signing out starts over (offset -1, no
  // handle): nothing the device stored for the session survived.
  await expect(a.question(kept)).toHaveCount(0)
  await expect.poll(() => shapes.length, { timeout: 30_000 }).toBeGreaterThan(0)
  expect(shapes[0]!.searchParams.get("offset")).toBe("-1")
  expect(shapes[0]!.searchParams.get("handle")).toBeNull()
  expect(await outboxSize(page), "the outbox holds nothing").toBe(0)
})

test("sign out wipes the device for every tab: a tab still holding the data holds the wipe off, and no tab opens on the session's data", { annotation: { type: "summary", description: "Signing out wipes the device only once no tab holds its data, and no tab reopens on it." } }, async ({ devices }) => {
  test.setTimeout(240_000)
  const word = devices.word
  const [one] = await devices.openFaulty("Tab 1")
  const two = await devices.tab(one.device, "Tab 2")

  // A question ChatApi refused, kept on the device, shows in both tabs: both hold the device's data.
  await faults(one.page).questions.failNext("bad_request")
  const kept = `Never sent in two tabs ${word}`
  await one.ask(kept)
  await one.expectNotSent(kept)
  await two.expectNotSent(kept)
  const shapes = [firstShapes(one), firstShapes(two)]

  // Tab 2 is slow to unload: a "Leave site?" prompt holds it open, with its databases, until the test answers it.
  // The test adds the prompt, not the app, and a click gives the page the activation the browser requires for one.
  let leaving: Dialog | undefined
  two.page.on("dialog", (dialog) => {
    if (dialog.type() === "beforeunload") leaving = dialog
  })
  await two.page.evaluate(() => addEventListener("beforeunload", (event) => event.preventDefault()))
  await two.page.locator("body").click({ position: { x: 4, y: 4 } })

  // Tab 1 signs out. Tab 2 hears it and starts to unload, held by the prompt; tab 1's wipe waits for it, so tab 1
  // opens nothing of the session and the mark stays.
  await one.page.getByRole("button", { name: SIGN_OUT }).click()
  await expect.poll(() => leaving !== undefined, { message: "tab 2 started to unload", timeout: 30_000 }).toBe(true)
  try {
    await expect.poll(() => waitingForData(one.page), { message: "tab 1's wipe waits for tab 2", timeout: 30_000 }).toBe(true)
    expect(await wipeMark(one.page)).toBe("1")
    await expect(one.page.getByRole("main", { name: "App" })).toBeHidden()
  } finally {
    // Tab 2 leaves; the wipe finishes, and both tabs open as visitors on an empty device.
    await leaving!.accept()
  }
  for (const tab of [one, two]) {
    await expect(tab.page.getByText(SIGN_IN_TO_ASK), `${tab.name} opens as a visitor`).toBeVisible({ timeout: 60_000 })
    await expect(tab.question(kept), `${tab.name} shows nothing of the session`).toHaveCount(0)
  }
  await expect.poll(() => wipeMark(one.page), { message: "the wipe finished", timeout: 30_000 }).toBeNull()
  expect(await outboxSize(one.page), "the outbox holds nothing").toBe(0)
  for (const [index, tab] of [one, two].entries()) {
    const seen = shapes[index]!
    await expect.poll(() => seen.length, { timeout: 30_000 }).toBeGreaterThan(0)
    expect(seen[0]!.searchParams.get("offset"), `${tab.name} syncs from scratch`).toBe("-1")
    expect(seen[0]!.searchParams.get("handle")).toBeNull()
  }
  // No row of the session comes back: tab 1 opens again, and the unsent question stays gone from both.
  await one.reload()
  await expect(one.page.getByText(SIGN_IN_TO_ASK)).toBeVisible({ timeout: 30_000 })
  await expect(one.question(kept)).toHaveCount(0)
  await expect(two.question(kept)).toHaveCount(0)
})

/** The shape requests `tab` makes from its next navigation on, in order: a navigation starts the list over. */
const firstShapes = (tab: Tab) => {
  const shapes: Array<URL> = []
  tab.page.on("framenavigated", (frame) => {
    if (frame === tab.page.mainFrame()) shapes.length = 0
  })
  tab.page.on("request", (request) => {
    const url = new URL(request.url())
    if (url.pathname === SHAPE_ROUTE) shapes.push(url)
  })
  return shapes
}

/** Whether the page's boot is waiting to take the device's data from every other tab (the wipe's `smithers-data` lock). */
const waitingForData = (page: Page) =>
  page.evaluate(async () =>
    ((await navigator.locks.query()).pending ?? []).some((lock) => lock.name === "smithers-data" && lock.mode === "exclusive")
  )

/** The sign-out wipe's mark in the device's localStorage: `"1"` while a wipe is unfinished, else `null`. */
const wipeMark = (page: Page) => page.evaluate(() => localStorage.getItem("smithers-wipe"))

/** How many writes the device's outbox (IndexedDB `smithers-outbox`) holds; -1 when it can't be read. */
const outboxSize = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open("smithers-outbox")
        open.onsuccess = () => {
          const database = open.result
          const stores = [...database.objectStoreNames]
          if (stores.length === 0) {
            database.close()
            return resolve(0)
          }
          const count = database.transaction(stores, "readonly").objectStore(stores[0]!).count()
          count.onsuccess = () => {
            database.close()
            resolve(count.result)
          }
          count.onerror = () => resolve(-1)
        }
        open.onerror = () => resolve(-1)
      }),
  )
