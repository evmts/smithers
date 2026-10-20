import { test as base, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test"
import { writeFile } from "node:fs/promises"
import { CHAT_FAILED, expect, flowName, PAGE_SIZE, SYNC_LOST } from "./fixtures"

// Multi-device helpers for the local-first tests. A device is its own browser context: its own memory, network and
// video. A tab is one page in a device. Every tab holds the conversation Electric syncs from Postgres, and asks
// through ChatApi (`POST /api/questions`). No mocks: `setOffline` is the device losing its network, and aborting a
// route's requests stands for that service being down.

export { CHAT_FAILED, expect, PAGE_SIZE, SYNC_LOST }

// Narrow devices, so two or three fit side by side in one GIF.
const VIEWPORT = { width: 560, height: 720 }

export type Message = { role: string; text: string; state: "pending" | "streaming" | "settled" }

// A small device label in each video, so a GIF shows which device is which and which is offline.
// It sits outside the app's root, ignores the pointer and is hidden from assistive technology.
const label = (name: string) => {
  const paint = () => {
    if (!document.body) return
    let badge = document.getElementById("e2e-device")
    if (!badge) {
      badge = document.createElement("div")
      badge.id = "e2e-device"
      badge.setAttribute("aria-hidden", "true")
      Object.assign(badge.style, {
        position: "fixed",
        top: "6px",
        right: "6px",
        zIndex: "2147483647",
        pointerEvents: "none",
        font: "600 12px/1.6 system-ui, sans-serif",
        color: "#fff",
        padding: "0 8px",
        borderRadius: "999px",
      })
      document.body.append(badge)
    }
    const state = sessionStorage.getItem("e2e-network") ?? ""
    badge.textContent = state === "" ? name : `${name} · ${state}`
    badge.style.background = state === "" ? "#1f2937" : "#b42318"
  }
  addEventListener("DOMContentLoaded", paint)
  addEventListener("e2e-network", paint)
  // Video only: follow the newest message the way a reader scrolls down, so each GIF shows its flow's messages.
  // The app opens scrolled to the oldest loaded message; chat.spec.ts "in view" tests that without this.
  let queued = false
  const follow = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      const root = document.scrollingElement
      if (root) root.scrollTop = root.scrollHeight
    })
  }
  addEventListener("DOMContentLoaded", () => new MutationObserver(follow).observe(document.body, { childList: true, subtree: true, characterData: true }))
}

// Every message on screen, in order, as a person reads it. `pending` is "Smithers is answering" with no text yet.
const readMessages = (word: string | null) => {
  const region = document.querySelector('section[aria-label="Conversation"]')
  const articles = [...(region?.querySelectorAll(".sui-chat-message") ?? [])]
  const read = (article: Element) => {
    const bubble = article.querySelector<HTMLElement>(".sui-chat-bubble")
    const response = article.querySelector('[data-slot="message-response"]')
    const state = bubble?.getAttribute("role") === "status" ? "pending" : response?.getAttribute("data-streaming") === "true" ? "streaming" : "settled"
    return { role: article.getAttribute("data-role") ?? "", text: (bubble?.innerText ?? "").trim(), state }
  }
  if (word === null) return articles.map(read)
  // This test's part of the shared conversation: each question with `word`, and the message right after it.
  return articles.flatMap((article, index) =>
    article.getAttribute("data-role") === "user" && article.textContent?.includes(word)
      ? [article, articles[index + 1]].filter((element): element is Element => element !== undefined).map(read)
      : [],
  )
}

/** One `POST /api/questions` a tab made, and ChatApi's status, or the network error when it never answered. */
export type Asked = { questionId: string; answerId: string; text: string; status?: number; error?: string }

export class Device {
  readonly tabs: Array<Tab> = []
  constructor(
    readonly name: string,
    readonly context: BrowserContext,
  ) {}

  // The device loses its network: no sync and no asking.
  async offline() {
    await this.context.setOffline(true)
    await this.paint("offline")
  }

  async online() {
    await this.context.setOffline(false)
    await this.paint("")
  }

  // The sync service is down for this device: every shape request fails as if Electric (or its proxy) were
  // unreachable. Asking still reaches ChatApi.
  async syncDown() {
    await this.context.route("**/api/shapes/**", (route) => route.abort("connectionrefused"))
    await this.paint("sync down")
  }

  async syncUp() {
    await this.context.unroute("**/api/shapes/**")
    await this.paint("")
  }

  private async paint(state: string) {
    for (const tab of this.tabs) {
      if (tab.page.isClosed()) continue
      await tab.page
        .evaluate((state) => {
          sessionStorage.setItem("e2e-network", state)
          dispatchEvent(new Event("e2e-network"))
        }, state)
        .catch(() => undefined)
    }
  }
}

const isQuestions = (url: string) => new URL(url).pathname === "/api/questions"
const isShape = (url: string) => new URL(url).pathname.startsWith("/api/shapes/")

export class Tab {
  readonly conversation: Locator
  readonly composer: Locator
  readonly composerForm: Locator
  readonly chatButton: Locator
  // "Smithers lost its connection.": sync has failed on this tab.
  readonly syncLost: Locator
  readonly loadEarlier: Locator
  readonly log: Array<string> = []
  // Every question this tab posted to ChatApi, in order.
  readonly asked: Array<Asked> = []
  // Shape requests that never got an answer: the device was offline or the sync service down.
  shapeFailures = 0
  // Seconds from the test's first device to this tab opening: where its video starts in the GIF.
  readonly openedAt: number

  constructor(
    readonly name: string,
    readonly device: Device,
    readonly page: Page,
    readonly startedAt: number,
  ) {
    this.conversation = page.getByRole("region", { name: "Conversation", exact: true })
    this.composer = page.getByRole("textbox", { name: "Message Smithers" })
    this.composerForm = page.locator('form[data-slot="chat-composer"]')
    this.chatButton = page.getByRole("button", { name: /Chat/ })
    this.syncLost = page.getByRole("alert").filter({ hasText: SYNC_LOST })
    this.loadEarlier = page.getByRole("button", { name: "Load earlier" })
    this.openedAt = (Date.now() - startedAt) / 1000
    const at = () => `${((Date.now() - startedAt) / 1000).toFixed(2)}s`
    page.on("console", (message) => this.log.push(`${at()} ${message.type()}: ${message.text()}`))
    page.on("pageerror", (error) => this.log.push(`${at()} pageerror: ${error.message}`))
    page.on("request", (request) => {
      if (!isQuestions(request.url()) || request.method() !== "POST") return
      const body = request.postDataJSON() as { id: string; answerId: string; text: string }
      this.asked.push({ questionId: body.id, answerId: body.answerId, text: body.text })
      this.log.push(`${at()} request: POST /api/questions ${body.id} answer ${body.answerId}`)
    })
    page.on("response", (response) => {
      if (!isQuestions(response.url())) return
      const body = response.request().postDataJSON() as { id: string }
      const asked = this.asked.find(({ questionId }) => questionId === body.id)
      if (asked) asked.status = response.status()
      this.log.push(`${at()} response: ${response.status()} POST /api/questions ${body.id}`)
    })
    page.on("requestfailed", (request) => {
      const error = request.failure()?.errorText
      if (isShape(request.url())) this.shapeFailures++
      if (isQuestions(request.url())) {
        const body = request.postDataJSON() as { id: string }
        const asked = this.asked.find(({ questionId }) => questionId === body.id)
        if (asked) asked.error = error
      }
      this.log.push(`${at()} requestfailed: ${request.method()} ${new URL(request.url()).pathname} ${error}`)
    })
  }

  // The app has opened the conversation: the shell renders only once its first snapshot loaded.
  async ready() {
    await expect(this.page.getByRole("main", { name: "App" }), `${this.name}: the app opens`).toBeVisible({ timeout: 30_000 })
  }

  async reload() {
    await this.page.reload()
    await this.ready()
  }

  async offline() {
    await this.device.offline()
  }

  async online() {
    await this.device.online()
  }

  question(text: string) {
    return this.conversation.locator('.sui-chat-message[data-role="user"]', { hasText: text })
  }

  // The message right after the question: its answer.
  answerTo(text: string) {
    return this.question(text).first().locator("xpath=following-sibling::*[1]")
  }

  // The answer ended as failed: the failure copy only, no "Smithers is answering" and no streaming caret.
  async expectFailed(text: string, timeout = 30_000) {
    const answer = this.answerTo(text)
    await expect(answer, `${this.name}: the answer to "${text}" ends as failed`).toHaveText(CHAT_FAILED, { timeout })
    await expect(answer).toHaveAttribute("data-role", "assistant")
    await expect(answer.getByRole("status")).toHaveCount(0)
    await expect(answer.locator('[data-slot="message-response"]')).toHaveAttribute("data-streaming", "false")
  }

  // The answer finished and contains `word`; model wording varies, so never an exact match.
  async expectAnswered(text: string, word: string, timeout = 60_000) {
    const answer = this.answerTo(text)
    await expect(answer, `${this.name}: the answer to "${text}" contains ${word}`).toContainText(word, { timeout })
    await expect(answer).toHaveAttribute("data-role", "assistant")
    await expect(answer.locator('[data-slot="message-response"]'), `${this.name}: the answer to "${text}" finished`).toHaveAttribute(
      "data-streaming",
      "false",
      { timeout },
    )
  }

  async openComposer() {
    if (await this.composer.isHidden()) await this.page.keyboard.press("ControlOrMeta+k")
    await expect(this.composer).toBeVisible()
  }

  // Types a question and presses Enter once the composer is ready to send.
  async send(text: string) {
    await this.openComposer()
    await expect(this.composerForm, `${this.name}: the composer is ready to send`).toHaveAttribute("data-status", "ready", { timeout: 30_000 })
    await this.composer.fill(text)
    await this.composer.press("Enter")
  }

  // Asks a question and checks it shows on this tab at once, whatever the network: the insert is optimistic.
  async ask(text: string) {
    await this.send(text)
    await expect(this.question(text), `${this.name}: "${text}" shows at once`).toHaveCount(1, { timeout: 1_000 })
    await expect(this.composer).toHaveValue("")
  }

  // Asks a question and waits until ChatApi took it (202): from then on the server answers it, whatever this tab does.
  async askAndWaitTaken(text: string) {
    const taken = this.page.waitForResponse((response) => isQuestions(response.url()) && response.request().postDataJSON()?.text === text)
    await this.ask(text)
    const response = await taken
    expect(response.status(), `${this.name}: ChatApi took "${text}"`).toBe(202)
    return response
  }

  // This test's questions and the message after each, in the order this tab shows them.
  thread(word: string): Promise<Array<Message>> {
    return this.page.evaluate(readMessages, word) as Promise<Array<Message>>
  }

  // The whole conversation on this tab.
  transcript(): Promise<Array<Message>> {
    return this.page.evaluate(readMessages, null) as Promise<Array<Message>>
  }
}

// Waits until every tab shows the same settled thread of `length` messages, and returns it.
export const expectSameThread = async (tabs: Array<Tab>, word: string, length: number, timeout = 60_000) => {
  let thread: Array<Message> = []
  await expect(async () => {
    const threads = await Promise.all(tabs.map((tab) => tab.thread(word)))
    for (const [index, other] of threads.entries()) {
      expect(other, `${tabs[index]!.name} shows the same messages, in the same order, as ${tabs[0]!.name}`).toEqual(threads[0])
    }
    expect(threads[0], "every question and answer, once each").toHaveLength(length)
    expect(threads[0]!.filter((message) => message.state !== "settled"), "no answer still streaming").toEqual([])
    thread = threads[0]!
  }).toPass({ timeout, intervals: [100, 250, 500, 1_000] })
  return thread
}

// [question, answer] pairs of a settled thread; every question is followed by exactly one assistant message.
export const pairs = (thread: Array<Message>) => {
  const result: Array<[question: Message, answer: Message]> = []
  for (let index = 0; index < thread.length; index += 2) {
    expect(thread[index]?.role, `message ${index} is a question`).toBe("user")
    expect(thread[index + 1]?.role, `message ${index + 1} is the answer to "${thread[index]?.text}"`).toBe("assistant")
    result.push([thread[index]!, thread[index + 1]!])
  }
  return result
}

/** A row of Postgres `messages` as Electric's shape serves it (snake_case columns). */
export type Row = { id: string; role: string; text: string; status: string; question_id: string | null; failure: string | null; position: string }

type ShapeMessage = {
  key?: string
  value?: Partial<Row>
  headers: { operation?: "insert" | "update" | "delete"; control?: string }
}

// Every row of Postgres `messages`, in `position` order, read the way devices read them: Electric's shape through
// ChatApi's proxy, from the start of its log until it is up to date.
export const allServerRows = async (request: APIRequestContext): Promise<Array<Row>> => {
  const rows = new Map<string, Row>()
  let query = "offset=-1"
  for (let page = 0; page < 1_000; page++) {
    const response = await request.get(`/api/shapes/messages?${query}`)
    expect(response.status(), "ChatApi serves the messages shape").toBe(200)
    for (const message of (await response.json()) as Array<ShapeMessage>) {
      const key = message.key ?? message.value?.id
      if (key === undefined) continue
      if (message.headers.operation === "delete") rows.delete(key)
      else if (message.headers.operation !== undefined) rows.set(key, { ...rows.get(key), ...message.value } as Row)
    }
    const headers = response.headers()
    if ("electric-up-to-date" in headers) break
    query = `offset=${headers["electric-offset"]}&handle=${headers["electric-handle"]}`
  }
  return [...rows.values()].sort((left, right) => Number(left.position) - Number(right.position))
}

// Postgres' rows for this test's questions: each question with `word`, and its answer.
export const serverRows = async (request: APIRequestContext, word: string): Promise<Array<Row>> => {
  const ordered = await allServerRows(request)
  const mine = new Set(ordered.filter((row) => row.role === "user" && row.text.includes(word)).map((row) => row.id))
  return ordered.filter((row) => mine.has(row.id) || (row.question_id !== null && mine.has(row.question_id)))
}

class Devices {
  // A word unique to this test run: the conversation is shared and keeps every earlier run's messages.
  readonly word = `lf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  private readonly startedAt = Date.now()
  private readonly all: Array<Device> = []

  constructor(
    private readonly browser: Browser,
    private readonly testInfo: TestInfo,
  ) {}

  // Opens one device per name, in parallel, each on /app with its conversation open.
  async open(...names: Array<string>) {
    return Promise.all(
      names.map(async (name) => {
        const context = await this.browser.newContext({
          viewport: VIEWPORT,
          recordVideo: { dir: this.testInfo.outputPath("videos"), size: VIEWPORT },
        })
        const device = new Device(name, context)
        this.all.push(device)
        return this.tab(device, name)
      }),
    )
  }

  // Opens another tab of the same device: same browser context, its own page and memory.
  async tab(device: Device, name: string) {
    const page = await device.context.newPage()
    await page.addInitScript(label, name)
    const tab = new Tab(name, device, page, this.startedAt)
    device.tabs.push(tab)
    await page.goto("/app")
    await tab.ready()
    return tab
  }

  async teardown() {
    const failed = this.testInfo.status !== this.testInfo.expectedStatus
    const tabs = this.all.flatMap((device) => device.tabs)
    if (failed) {
      // Saved beside the test's videos and attached: each tab's browser and network log, screenshot, and what it showed.
      const save = async (name: string, body: string | Buffer, contentType: string) => {
        const path = this.testInfo.outputPath(name)
        await writeFile(path, body)
        await this.testInfo.attach(name, { path, contentType })
      }
      for (const tab of tabs) {
        const slug = tab.name.replace(/\W+/g, "-")
        await save(`${slug}-browser.log`, tab.log.join("\n"), "text/plain")
        if (tab.page.isClosed()) continue
        const shot = await tab.page.screenshot({ timeout: 5_000 }).catch(() => undefined)
        if (shot) await save(`${slug}.png`, shot, "image/png")
        const thread = await tab.thread(this.word).catch((error: unknown) => ({ error: String(error) }))
        await save(`${slug}-thread.json`, JSON.stringify({ thread, asked: tab.asked }, null, 2), "application/json")
      }
    }
    await Promise.all(this.all.map((device) => device.context.close().catch(() => undefined)))
    // What e2e/gifs.mjs needs to lay the videos side by side, each starting when its tab opened.
    const videos = await Promise.all(
      tabs.map(async (tab) => ({ name: tab.name, video: await tab.page.video()?.path(), openedAt: tab.openedAt })),
    )
    await writeFile(
      this.testInfo.outputPath("devices.json"),
      JSON.stringify({ flow: flowName(this.testInfo), title: this.testInfo.title, status: this.testInfo.status, word: this.word, videos }, null, 2),
    )
  }
}

// Built on Playwright's own test, not fixtures.ts': a device test opens its own contexts and saves each tab's log,
// so it needs no default page.
export const test = base.extend<{ devices: Devices }>({
  devices: async ({ browser }, use, testInfo) => {
    const devices = new Devices(browser, testInfo)
    await use(devices)
    await devices.teardown()
  },
})
