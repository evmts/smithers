import type { Page, Request } from "@playwright/test"
import { open, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { answerTo, CHAT_FAILED, expect, test } from "./fixtures"

// docs/observability.md, end to end: a real ask through the real browser, ChatApi, Postgres, Electric and model, read
// back from the records ChatApi writes. Locally `alchemy dev` writes each Worker's log under
// `.alchemy/log/dev_<user>/<Worker>/`, and ChatApi's log also holds the browser's OTLP records it relayed
// (`otlp.signal`). A deployment's logs are in Workers Logs, which this suite can't read, so these tests run locally only.

const baseURL = process.env.BASE_URL ?? "http://localhost:1337"
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(baseURL)
test.skip(!local, `BASE_URL ${baseURL} is a deployment: its logs are in Workers Logs, not in local .alchemy/log files`)

const LOG_ROOT = fileURLToPath(new URL("../.alchemy/log", import.meta.url))

type LogRecord = { message?: unknown; level?: string; annotations?: Record<string, unknown>; [key: string]: unknown }
type Line = { worker: string; file: string; text: string; record?: LogRecord }

// The lines each Worker's local log gains from now on: files that already exist are read from their current end,
// and files `alchemy dev` starts after a reload are read whole.
class LogTail {
  private constructor(private readonly offsets: Map<string, number>) {}

  private static async files() {
    const files: Array<{ worker: string; path: string }> = []
    const users = (await readdir(LOG_ROOT, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && entry.name.startsWith("dev_"))
    for (const user of users) {
      for (const worker of await readdir(join(LOG_ROOT, user.name), { withFileTypes: true })) {
        if (!worker.isDirectory()) continue
        const dir = join(LOG_ROOT, user.name, worker.name)
        for (const file of await readdir(dir)) if (file.endsWith(".log")) files.push({ worker: worker.name, path: join(dir, file) })
      }
    }
    return files
  }

  static async start() {
    const offsets = new Map<string, number>()
    for (const { path } of await LogTail.files()) offsets.set(path, (await stat(path)).size)
    expect([...offsets.keys()].some((path) => path.includes("/ChatApi/")), `alchemy dev writes ChatApi's log under ${LOG_ROOT}`).toBe(true)
    return new LogTail(offsets)
  }

  async lines(): Promise<Array<Line>> {
    const lines: Array<Line> = []
    for (const { worker, path } of await LogTail.files()) {
      const from = this.offsets.get(path) ?? 0
      const handle = await open(path, "r")
      try {
        const { size } = await handle.stat()
        if (size <= from) continue
        const buffer = Buffer.alloc(size - from)
        await handle.read(buffer, 0, buffer.length, from)
        for (const text of buffer.toString("utf8").split("\n")) {
          if (text.trim() === "") continue
          let record: LogRecord | undefined
          try {
            record = JSON.parse(text) as LogRecord
          } catch {
            record = undefined
          }
          lines.push({ worker, file: path, text, record })
        }
      } finally {
        await handle.close()
      }
    }
    return lines
  }

  // ChatApi's JSON records: its own, and the browser's it relayed (they carry `otlp.signal`).
  async records() {
    const records = (await this.lines()).filter((line) => line.worker === "ChatApi" && line.record !== undefined).map((line) => line.record!)
    const relayed = (record: LogRecord) => record.annotations?.["otlp.signal"] !== undefined
    return { own: records.filter((record) => !relayed(record)), browser: records.filter(relayed) }
  }
}

// A record's trace id, wherever its logger put it: top level or annotations, as trace_id, traceId or trace.id.
const traceIdOf = (record: LogRecord | undefined): string | undefined => {
  if (record === undefined) return undefined
  for (const fields of [record, record.annotations ?? {}]) {
    for (const [key, value] of Object.entries(fields)) {
      if (/^trace(_|\.)?id$/i.test(key) && typeof value === "string") return value
    }
  }
  return undefined
}

const field = (record: LogRecord, name: string) => record.annotations?.[name]

const openChat = async (page: Page) => {
  await page.goto("/app")
  await expect(page.getByRole("button", { name: /Chat/ })).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press("ControlOrMeta+k")
  return {
    composer: page.getByRole("textbox", { name: "Message Smithers" }),
    conversation: page.getByRole("region", { name: "Conversation", exact: true }),
  }
}

const isQuestions = (request: Request) => new URL(request.url()).pathname === "/api/questions"

test("correlation: the browser's ask and ChatApi's chat.question and chat.answer records share the answer id and trace id", async ({ page }) => {
  const logs = await LogTail.start()
  const { composer, conversation } = await openChat(page)
  const word = `trace-${Date.now()}`
  const question = `Reply with exactly the word: ${word}`
  const posted = page.waitForRequest(isQuestions)
  await composer.fill(question)
  await composer.press("Enter")

  // The browser's ask: W3C trace context on POST /api/questions, and the answer id in its body.
  const request = await posted
  const traceparent = request.headers()["traceparent"] ?? ""
  expect(traceparent, "POST /api/questions sends traceparent").toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/)
  const traceId = traceparent.split("-")[1]
  const { id: questionId, answerId } = request.postDataJSON() as { id: string; answerId: string }
  await expect(answerTo(conversation, question)).toContainText(word, { timeout: 60_000 })

  // ChatApi logs chat.question and chat.answer for this answer, and relays the browser's `question taken` log and its
  // `chat.ask` span, all carrying the answer id.
  let records = await logs.records()
  const find = (from: Array<LogRecord>, message: string) => from.find((record) => record.message === message && field(record, "answerId") === answerId)
  await expect
    .poll(
      async () => {
        records = await logs.records()
        return {
          "chat.question": find(records.own, "chat.question") !== undefined,
          "chat.answer": find(records.own, "chat.answer") !== undefined,
          "question taken": find(records.browser, "question taken") !== undefined,
          "chat.ask": find(records.browser, "chat.ask") !== undefined,
        }
      },
      { timeout: 30_000, message: "ChatApi's log has every record of this ask" },
    )
    .toEqual({ "chat.question": true, "chat.answer": true, "question taken": true, "chat.ask": true })
  const chatQuestion = find(records.own, "chat.question")!
  const chatAnswer = find(records.own, "chat.answer")!
  expect(field(chatQuestion, "questionId")).toBe(questionId)
  expect(field(chatQuestion, "status")).toBe(202)
  expect(field(chatAnswer, "questionId")).toBe(questionId)
  expect(field(chatAnswer, "outcome")).toBe("done")

  // One trace: the browser's records and ChatApi's carry the trace id the browser sent.
  expect.soft(traceIdOf(find(records.browser, "question taken")), "the browser's `question taken` log is in the ask's trace").toBe(traceId)
  expect.soft(traceIdOf(find(records.browser, "chat.ask")), "the browser's `chat.ask` span is in the ask's trace").toBe(traceId)
  expect.soft(traceIdOf(chatQuestion), "ChatApi's chat.question record carries the ask's trace id").toBe(traceId)
  expect.soft(traceIdOf(chatAnswer), "ChatApi's chat.answer record carries the ask's trace id").toBe(traceId)
})

test("redaction: a sentinel word in questions never appears in ChatApi's log or the browser's relayed records", async ({ page, context }) => {
  const logs = await LogTail.start()
  const { composer, conversation } = await openChat(page)
  const sentinel = `sentinel${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

  // An answered question: the sentinel is in the question and in the answer.
  const answered = `Reply with exactly the word: ${sentinel}`
  const posted = page.waitForRequest(isQuestions)
  await composer.fill(answered)
  await composer.press("Enter")
  const { answerId } = (await posted).postDataJSON() as { answerId: string }
  await expect(answerTo(conversation, answered)).toContainText(sentinel, { timeout: 60_000 })

  // A question ChatApi never got, because it was unreachable: the browser logs `question not taken`.
  await context.route("**/api/questions", (route) => route.abort("connectionrefused"))
  const lost = `Never delivered ${sentinel}`
  const lostPost = page.waitForRequest(isQuestions)
  await composer.fill(lost)
  await composer.press("Enter")
  const { answerId: lostAnswerId } = (await lostPost).postDataJSON() as { answerId: string }
  await expect(answerTo(conversation, lost)).toHaveText(CHAT_FAILED, { timeout: 30_000 })
  await context.unroute("**/api/questions")

  // Wait until every record of both asks is in the log, so the scan below covers them.
  await expect
    .poll(
      async () => {
        const { own, browser } = await logs.records()
        const has = (from: Array<LogRecord>, message: string, id: string) => from.some((record) => record.message === message && field(record, "answerId") === id)
        return {
          "chat.question": has(own, "chat.question", answerId),
          "chat.answer": has(own, "chat.answer", answerId),
          "question asked": has(browser, "question asked", answerId),
          "question taken": has(browser, "question taken", answerId),
          "question not taken": has(browser, "question not taken", lostAnswerId),
        }
      },
      { timeout: 30_000, message: "ChatApi's log has every record of both asks" },
    )
    .toEqual({ "chat.question": true, "chat.answer": true, "question asked": true, "question taken": true, "question not taken": true })

  const lines = await logs.lines()
  expect(lines.length).toBeGreaterThan(0)
  const leaks = lines.filter((line) => line.text.includes(sentinel)).map((line) => `${line.worker}: ${line.text.slice(0, 300)}`)
  expect(leaks, "no log line, of any Worker, carries what someone wrote or the answer").toEqual([])
})
