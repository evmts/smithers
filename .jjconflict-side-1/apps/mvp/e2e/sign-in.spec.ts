import { SIGN_IN, SIGN_IN_TO_ASK, SIGN_OUT } from "../src/features/auth/contract"
import { QUESTIONS_ROUTE, SHAPE_ROUTE } from "../src/features/chat/contract"
import { faults } from "./faults"
import { expect, test } from "./devices"

// Sign-in, end to end (docs/features/sign-in.md): the real app, ChatApi and Postgres. Under `alchemy dev` without the
// GitHub App, a local developer is signed in as an Admin until they sign out, and "Sign in with GitHub" signs them in
// again without GitHub (`worker/DevChatApi.ts`). A deployment signs in through GitHub, which this suite can't drive.

const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(process.env.BASE_URL ?? "http://localhost:1337")
test.skip(!local, "signing in on a deployment goes through GitHub; these run against alchemy dev's local developer")

test("signed out: the composer is gated, ChatApi refuses an ask, and signing in brings the composer back", async ({ devices }) => {
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

test("sign out wipes the device: its unsent questions go, and the conversation syncs again from scratch", async ({ devices }) => {
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
  const outbox = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open("smithers-outbox")
        open.onsuccess = () => {
          const database = open.result
          const stores = [...database.objectStoreNames]
          if (stores.length === 0) return resolve(0)
          const count = database.transaction(stores, "readonly").objectStore(stores[0]!).count()
          count.onsuccess = () => resolve(count.result)
          count.onerror = () => resolve(-1)
        }
        open.onerror = () => resolve(-1)
      }),
  )
  expect(outbox, "the outbox holds nothing").toBe(0)
})
