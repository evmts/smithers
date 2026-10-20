import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import type { BrowserContext, Request } from "@playwright/test"
import { VIEWS_ROUTE } from "../src/features/views/contract"
import { CANT_OPEN } from "../src/features/web/contract"
import { expect, test } from "./devices"

// Web pages, end to end (docs/features/web-pages.md): the real app, its engine worker, ChatApi, Electric and the real
// model. The agent embeds a page in the conversation or adds a card that opens one in a new tab; a person's own `/web`
// opens a tab straight from their keypress; a page the app won't open stays in the composer saying why. A view is a
// conversation row, so a second device shows it too. The live cases are few and short: Cerebras rate-limits calls.
// Under `alchemy dev` the page is the local developer, and `http://localhost` pages open in a new tab only there.

/** A page of its own on this machine, served by the test: never the app's origin. */
let server: Server
let local: string
test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end("<!doctype html><title>Local test page</title><h1>Local test page</h1>")
  })
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve))
  local = `http://localhost:${(server.address() as AddressInfo).port}`
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

/** The views this context's engine worker added, as `POST /api/views` bodies, in order. */
const viewsAdded = (context: BrowserContext) => {
  const added: Array<{ readonly id: string; readonly template: string; readonly props: { readonly url: string } }> = []
  context.on("request", (request: Request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === VIEWS_ROUTE) added.push(request.postDataJSON())
  })
  return added
}

const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"

/** Typing a person can follow in the video. */
const typing = { delay: 30 }

test("embed: the agent shows https://example.com in the chat with its origin above it, on every device, at full size too", async ({ devices }) => {
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  const added = viewsAdded(a.device.context)

  await a.askAndWaitTaken(`Show me https://example.com in the chat, then reply with the word web-${word}.`)
  await expect.poll(() => added.filter((view) => view.template === "webpage").length, { timeout: 60_000 }).toBe(1)
  const id = added.find((view) => view.template === "webpage")!.id
  expect(added[0]!.props.url).toBe("https://example.com/")

  const view = a.page.locator(`[data-view="${id}"]`)
  await expect(view).toBeVisible({ timeout: 30_000 })
  await expect(view.locator('[data-slot="web-page-origin"]')).toHaveText("https://example.com")
  const frame = view.locator("iframe")
  await expect(frame).toHaveAttribute("src", "https://example.com/")
  await expect(frame).toHaveAttribute("sandbox", SANDBOX)
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer")
  await expect(frame).toHaveAttribute("loading", "lazy")
  const newTab = view.getByRole("link", { name: "Open in new tab" })
  await expect(newTab).toHaveAttribute("href", "https://example.com/")
  await expect(newTab).toHaveAttribute("target", "_blank")
  await expect(newTab).toHaveAttribute("rel", "noopener noreferrer")

  // The view is a conversation row: the other device shows it from its own synced copy.
  await expect(b.page.locator(`[data-view="${id}"] iframe`)).toHaveAttribute("src", "https://example.com/", { timeout: 30_000 })

  // Its full size is the same view at its own route.
  await view.getByRole("link", { name: "Full screen" }).click()
  await expect(a.page).toHaveURL(new RegExp(`/app/views/${id}$`))
  const full = a.page.getByRole("main", { name: "View" })
  await expect(full.locator("iframe")).toHaveAttribute("src", "https://example.com/")
  await expect(full.locator('[data-slot="web-page-origin"]')).toHaveText("https://example.com")
  await full.getByRole("link", { name: "Back to chat" }).click()
  await expect(a.page).toHaveURL(/\/app$/)
})

test("tab: the agent's card shows the page's origin, and its Open opens the page in a new tab", async ({ devices }) => {
  const word = devices.word
  const [a] = await devices.open("A")
  const added = viewsAdded(a.device.context)

  await a.askAndWaitTaken(`Open ${local}/ in a new browser tab, then reply with the word tab-${word}.`)
  await expect.poll(() => added.filter((view) => view.template === "link").length, { timeout: 60_000 }).toBe(1)
  const card = a.page.locator(`[data-view="${added.find((view) => view.template === "link")!.id}"]`)
  await expect(card.locator('[data-slot="web-link-origin"]')).toHaveText(local, { timeout: 30_000 })

  const opening = a.device.context.waitForEvent("page")
  await card.getByRole("link", { name: "Open" }).click()
  const opened = await opening
  await opened.waitForLoadState()
  expect(opened.url()).toBe(`${local}/`)
  await expect(opened).toHaveTitle("Local test page")
  // The app itself stayed where it was.
  await expect(a.page).toHaveURL(/\/app$/)
})

test("a person's /web <url> tab opens the page straight from their Enter, and adds nothing to the chat", async ({ devices }) => {
  const [a] = await devices.open("A")
  const added = viewsAdded(a.device.context)
  await a.openComposer()

  const opening = a.device.context.waitForEvent("page")
  await a.composer.pressSequentially(`/web ${local}/from-enter tab`, typing)
  await a.composer.press("Enter")
  const opened = await opening
  await opened.waitForLoadState()
  expect(opened.url()).toBe(`${local}/from-enter`)
  await expect(a.composer).toHaveValue("")
  expect(added).toEqual([])
})

test("refusals: a javascript: page, and the app's own origin, stay in the composer saying why; nothing runs", async ({ devices }) => {
  const [a] = await devices.open("A")
  const added = viewsAdded(a.device.context)
  const dialogs: Array<string> = []
  a.page.on("dialog", (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  const status = a.composerForm.locator(".sui-chat-composer-status")
  await a.openComposer()

  await a.composer.pressSequentially("/web javascript:alert(document.cookie)", typing)
  await a.composer.press("Enter")
  await expect(status).toHaveText(CANT_OPEN.scheme)
  await expect(a.composer).toHaveValue("/web javascript:alert(document.cookie)")

  // The app on :1337: a frame of it would hand it the app, and a tab of it is /navigate's.
  const app = new URL(a.page.url()).origin
  await a.composer.fill("")
  await a.composer.pressSequentially(`/web ${app.replace("http:", "https:")}/app`, typing)
  await a.composer.press("Enter")
  await expect(status).toHaveText(CANT_OPEN.same_origin)
  await a.composer.fill("")
  await a.composer.pressSequentially(`/web ${app}/app`, typing)
  await a.composer.press("Enter")
  await expect(status).toHaveText(CANT_OPEN.insecure)

  expect(added).toEqual([])
  expect(dialogs).toEqual([])
  await expect(a.page).toHaveURL(/\/app$/)
})

test("the app's own pages refuse to be framed, and frame nothing but https pages", async ({ request, devices }) => {
  const response = await request.get("/app")
  expect(response.headers()["content-security-policy"]).toBe("frame-ancestors 'none'")
  expect(response.headers()["x-frame-options"]).toBe("DENY")
  const [a] = await devices.open("A")
  await expect(a.page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute("content", "frame-src https:")
})
