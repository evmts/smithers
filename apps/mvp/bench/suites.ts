// The measurements: real Chromium pages against the real app, ChatApi, Postgres, Electric and model, and ChatApi over
// plain HTTP from Node. No mocks and no route interception. The UI suites ask through the composer; the API suites
// post `POST /api/questions` as the browser does.
import type { Browser, BrowserContext, Page } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { type Follower, initialSync, postQuestion, type Row, settled, sleep } from "./chatapi.ts"
import { installProbe, watchExchange, type BenchWindow, type Exchange } from "./probe.ts"

export type Check = { suite: string; iteration: number; name: string; ok: boolean; detail?: string }

export type Recorder = {
  sample: (metric: string, ms: number) => void
  check: (suite: string, iteration: number, name: string, ok: boolean, detail?: string) => void
  // A browser-reported metric the browser didn't report for one iteration.
  missing: (metric: string) => void
  // An occurrence worth counting, not timing: an HTTP status, a 429, a failure.
  count: (name: string) => void
  detail: (suite: string, record: Record<string, unknown>) => void
}

export type Bench = {
  browser: Browser
  baseUrl: string
  // Iterations of the suites that don't ask the model (load, cmdk, shape), and of those that do (question, answer, sync).
  n: number
  nAnswer: number
  // The `concurrent` suite: this many asks at once, this many times.
  concurrency: number
  bursts: number
  runId: string
  // The run's newest question, which the load suite waits to see.
  newestWord: string
  // Listens to the shape for the whole run, as one more device.
  follower: Follower
  record: Recorder
}

const COMPOSER = 'textarea[aria-label="Message Smithers"]'
const ANSWER_TIMEOUT = 90_000
const LOAD_TIMEOUT = 60_000
// The browser's own limit for Electric to deliver an asked question's txid (ChatConfig.confirmWithin).
const CONFIRM_TIMEOUT = 15_000
// After a 429 from the model, wait this long times the attempt, then ask again with a new word.
const BACKOFF_MS = 30_000
const RETRIES = 2

// A one-word answer, as the e2e tests ask. ChatApi sends the model up to the last 19 finished exchanges with every
// question, and the model key's tokens-per-minute limit is shared, so long answers would make every later question
// expensive (docs/benchmarks.md#limitations).
export const question = (word: string) => `Reply with exactly the word: ${word}`

// The model refused an answer with 429 (`failure: rate_limited`): not a latency sample.
class RateLimited extends Error {}

// Runs one iteration that asks the model, with a new word per attempt. A rate-limited answer backs off and asks again,
// at most RETRIES times, then fails the iteration's check.
const attempt = async (bench: Bench, suite: string, stem: string, iteration: number, body: (word: string) => Promise<void>) => {
  for (let retry = 0; ; retry++) {
    try {
      return await body(`bench-${bench.runId}-${stem}${retry > 0 ? `r${retry}` : ""}`)
    } catch (error) {
      if (!(error instanceof RateLimited)) throw error
      bench.record.count(`${suite}.rate_limited`)
      if (retry === RETRIES) {
        bench.record.check(suite, iteration, "answered without a 429", false, `rate limited on ${retry + 1} attempts`)
        return
      }
      const wait = BACKOFF_MS * (retry + 1)
      console.error(`bench: ${suite} #${iteration}: the model answered 429; backing off ${wait / 1000} s`)
      await sleep(wait)
    }
  }
}

// The answer to the question containing `word`, as Postgres settled it, seen by the follower.
const settledAnswer = (bench: Bench, word: string, timeoutMs = CONFIRM_TIMEOUT) =>
  bench.follower.until(
    () => {
      const asked = bench.follower.questionWith(word)
      return asked === undefined ? undefined : settled(bench.follower.answerTo(asked.id))
    },
    timeoutMs,
    `settled answer to ${word}`,
  )

// After the page showed the answer done: throws RateLimited when the model refused it.
const unlessRateLimited = async (bench: Bench, word: string) => {
  const answer = await settledAnswer(bench, word)
  if (answer.failure === "rate_limited") throw new RateLimited()
  return answer
}

// A fresh browser context: its own cookies and HTTP cache. Nothing else persists in the browser: the conversation
// lives in an in-memory TanStack DB collection that syncs from Electric on every page load.
const newContext = async ({ browser, baseUrl, newestWord }: Bench) => {
  const context = await browser.newContext({ baseURL: baseUrl })
  await context.addInitScript(installProbe, newestWord)
  return context
}

const waitForLoad = (page: Page, untilNewest: boolean) =>
  page.waitForFunction(
    (untilNewest) => {
      const probe = (window as unknown as BenchWindow).__bench
      return probe.usableAt > 0 && (!untilNewest || probe.newestAt > 0)
    },
    untilNewest,
    { timeout: LOAD_TIMEOUT },
  )

const openApp = async (context: BrowserContext, untilNewest = true) => {
  const page = await context.newPage()
  await page.goto("/app", { waitUntil: "commit" })
  await waitForLoad(page, untilNewest)
  return page
}

const openComposer = async (page: Page) => {
  await page.keyboard.press("ControlOrMeta+k")
  await page.getByRole("textbox", { name: "Message Smithers" }).waitFor({ state: "visible" })
}

// Asks on `asker` through the composer and waits until every watcher page shows the answer done.
// Returns each watcher's exchange with absolute times (timeOrigin + performance.now()).
const ask = async (asker: Page, word: string, watchers: ReadonlyArray<Page>) => {
  await asker.locator('form[data-slot="chat-composer"][data-status="ready"]').waitFor()
  const composer = asker.getByRole("textbox", { name: "Message Smithers" })
  await composer.fill(question(word))
  for (const page of watchers) await page.evaluate(watchExchange, word)
  await asker.evaluate(() => {
    ;(window as unknown as BenchWindow).__bench.enterAt = 0
  })
  await composer.press("Enter")
  await Promise.all(
    watchers.map((page) =>
      page.waitForFunction((word) => ((window as unknown as BenchWindow).__bench.exchanges[word]?.completeAt ?? 0) > 0, word, {
        timeout: ANSWER_TIMEOUT,
      }),
    ),
  )
  const enterAt = await asker.evaluate(() => performance.timeOrigin + (window as unknown as BenchWindow).__bench.enterAt)
  const exchanges = await Promise.all(
    watchers.map((page) =>
      page.evaluate((word) => {
        const exchange = (window as unknown as BenchWindow).__bench.exchanges[word]!
        const origin = performance.timeOrigin
        return {
          ...exchange,
          questionAt: origin + exchange.questionAt,
          firstTextAt: origin + exchange.firstTextAt,
          completeAt: origin + exchange.completeAt,
          samples: exchange.samples.map((sample) => ({ at: origin + sample.at, text: sample.text })),
        } satisfies Exchange
      }, word),
    ),
  )
  return { enterAt, exchanges }
}

// The warm-up: asks the run's first question so the dev server, model connection and Electric are hot, and gives the
// load and shape suites a newest message to wait for. Its numbers are discarded.
export const seed = async (bench: Bench) => {
  const context = await newContext(bench)
  try {
    const page = await openApp(context, false)
    await openComposer(page)
    await attempt(bench, "seed", "seed", 0, async (word) => {
      const { exchanges } = await ask(page, word, [page])
      await unlessRateLimited(bench, word)
      const answer = exchanges[0]!.answerText
      bench.record.check("seed", 0, "answer contains the word", answer.includes(word), answer)
      bench.newestWord = word
    })
  } finally {
    await context.close()
  }
}

// Page load of /app in a fresh context (cold), then a reload of that context (warm). Both build the conversation from
// Electric's shape; the reload may get the app's modules and Electric's non-live responses from the HTTP cache.
export const load = async (bench: Bench) => {
  const read = (page: Page) =>
    page.evaluate(async () => {
      // Two frames after the last mark, so the LCP candidate for that render has been reported.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const probe = (window as unknown as BenchWindow).__bench
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]
      // The shape requests that finished before the conversation showed; the live long-poll is still open.
      const shapes = (performance.getEntriesByType("resource") as Array<PerformanceResourceTiming>).filter((entry) =>
        entry.name.includes("/api/shapes/messages"),
      )
      return {
        ttfb: navigation?.responseStart ?? Number.NaN,
        fcp: fcp?.startTime ?? Number.NaN,
        lcp: probe.lcp > 0 ? probe.lcp : Number.NaN,
        usable: probe.usableAt,
        newest: probe.newestAt,
        messages: probe.messages,
        shapeRequests: shapes.length,
        shapeRequestsFromCache: shapes.filter((entry) => entry.transferSize === 0 && entry.decodedBodySize > 0).length,
      }
    })
  for (let iteration = 0; iteration < bench.n; iteration++) {
    const context = await newContext(bench)
    try {
      const page = await openApp(context)
      const cold = await read(page)
      await page.reload({ waitUntil: "commit" })
      await waitForLoad(page, true)
      const warm = await read(page)
      for (const [kind, marks] of [["cold", cold], ["warm", warm]] as const) {
        for (const metric of ["ttfb", "fcp", "lcp", "usable", "newest"] as const) {
          const value = marks[metric]
          const reported = Number.isFinite(value) && value > 0
          if (reported) bench.record.sample(`load.${kind}.${metric}`, value)
          // Chromium decides what counts as a contentful paint (see docs/benchmarks.md); the app's own marks must exist.
          else if (metric === "fcp" || metric === "lcp") bench.record.missing(`load.${kind}.${metric}`)
          else bench.record.check("load", iteration, `${kind} ${metric} measured`, false, String(value))
        }
      }
      bench.record.detail("load", { iteration, cold, warm })
    } finally {
      await context.close()
    }
  }
}

// From the ⌘K keydown to the composer taking focus; Esc hides it again between presses.
export const cmdk = async (bench: Bench) => {
  const context = await newContext(bench)
  try {
    const page = await openApp(context)
    const chat = page.getByRole("button", { name: /Chat/ })
    for (let iteration = 0; iteration < bench.n; iteration++) {
      await chat.waitFor({ state: "visible" })
      await page.evaluate(() => {
        const probe = (window as unknown as BenchWindow).__bench
        probe.cmdKAt = 0
        probe.focusedAt = 0
      })
      await page.keyboard.press("ControlOrMeta+k")
      await page.waitForFunction(
        () => {
          const probe = (window as unknown as BenchWindow).__bench
          return probe.cmdKAt > 0 && probe.focusedAt > 0
        },
        null,
        { timeout: 10_000 },
      )
      const { cmdKAt, focusedAt, focused } = await page.evaluate((selector) => {
        const probe = (window as unknown as BenchWindow).__bench
        return { cmdKAt: probe.cmdKAt, focusedAt: probe.focusedAt, focused: document.activeElement?.matches(selector) === true }
      }, COMPOSER)
      bench.record.check("cmdk", iteration, "composer has focus", focused)
      bench.record.sample("cmdk.focus", focusedAt - cmdKAt)
      bench.record.detail("cmdk", { iteration, focus: focusedAt - cmdKAt })
      await page.keyboard.press("Escape")
    }
  } finally {
    await context.close()
  }
}

// What a new device fetches first, from Node: GET /api/shapes/messages from offset -1 to up-to-date. The proxy fixes
// the shape to the whole `messages` table, so N is the shared conversation's size, recorded with each iteration.
export const shape = async (bench: Bench) => {
  for (let iteration = 0; iteration < bench.n; iteration++) {
    const sync = await initialSync(bench.baseUrl)
    const texts = [...sync.rows.values()].map((row) => row.text ?? "")
    bench.record.check("shape", iteration, "the snapshot holds the run's newest question", texts.some((text) => text.includes(bench.newestWord)))
    bench.record.sample("shape.initial_sync", sync.ms)
    bench.record.detail("shape", {
      iteration,
      ms: sync.ms,
      rows: sync.rows.size,
      operations: sync.operations,
      requests: sync.requests,
      bytes: sync.bytes,
    })
  }
}

type Asked = Awaited<ReturnType<typeof askApi>>

// Posts a question as the browser does, then waits for Electric to deliver its txid and for its answer to settle.
const askApi = async (bench: Bench, word: string) => {
  const { follower } = bench
  const id = randomUUID()
  const answerId = randomUUID()
  const text = question(word)
  const posted = await postQuestion(bench.baseUrl, { id, answerId, text })
  const txid = posted.txid
  let confirmedAt = 0
  let answer: Row | undefined
  let error: string | undefined
  if (posted.status === 202 && txid !== null) {
    try {
      confirmedAt = await follower.until(() => follower.txids.get(txid), CONFIRM_TIMEOUT, `txid ${txid}`)
      answer = await follower.until(() => settled(follower.rows.get(answerId)), ANSWER_TIMEOUT, `settled answer ${answerId}`)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }
  }
  const timeline = follower.timelines.get(answerId)
  return {
    word,
    text,
    ...posted,
    confirmedAt,
    asked: follower.rows.get(id),
    answer,
    firstTextAt: timeline?.firstTextAt ?? 0,
    settledAt: timeline?.settledAt ?? 0,
    error,
  }
}

const asDetail = ({ word, status, txid, sentAt, respondedAt, confirmedAt, firstTextAt, settledAt, answer, error }: Asked) => ({
  word,
  status,
  txid,
  accepted: respondedAt - sentAt,
  confirmed: confirmedAt > 0 ? confirmedAt - sentAt : null,
  firstText: firstTextAt > 0 ? firstTextAt - sentAt : null,
  settled: settledAt > 0 ? settledAt - sentAt : null,
  answer: answer?.text ?? null,
  answerStatus: answer?.status ?? null,
  failure: answer?.failure ?? null,
  ...(error === undefined ? {} : { error }),
})

// The question round trip, from Node: POST /api/questions to its 202, and to Electric delivering the question's txid
// on a live shape. Then server-owned answering as Electric delivers it: to the answer's first text and to done.
export const questions = async (bench: Bench) => {
  for (let iteration = 0; iteration < bench.nAnswer; iteration++) {
    await attempt(bench, "question", `q${iteration}`, iteration, async (word) => {
      const asked = await askApi(bench, word)
      if (asked.answer?.failure === "rate_limited") throw new RateLimited()
      const { status, txid, sentAt, respondedAt, confirmedAt, answer } = asked
      const check = (name: string, ok: boolean, detail?: string) => bench.record.check("question", iteration, name, ok, detail)
      check("ChatApi took the question (202 with a txid)", status === 202 && txid !== null, `HTTP ${status}`)
      check("Electric delivered the question's txid", confirmedAt > 0, asked.error)
      check("the question row holds the question as asked", asked.asked?.text === asked.text, asked.asked?.text)
      check("the answer settled done", answer?.status === "done", `${answer?.status} ${answer?.failure ?? ""}`)
      check("answer contains the word", answer?.text?.includes(word) === true, answer?.text)
      if (status === 202) bench.record.sample("question.accepted", respondedAt - sentAt)
      if (confirmedAt > 0) bench.record.sample("question.confirmed", confirmedAt - sentAt)
      if (asked.firstTextAt > 0) bench.record.sample("question.first_text", asked.firstTextAt - sentAt)
      if (answer?.status === "done") bench.record.sample("question.done", asked.settledAt - sentAt)
      bench.record.detail("question", { iteration, ...asDetail(asked) })
    })
  }
}

// Server-owned answering through the UI: one browser asks; from the Enter keydown to its question shown (the
// optimistic insert), the answer's first text, and the answer done, as Electric delivers ChatApi's writes.
export const answer = async (bench: Bench) => {
  const context = await newContext(bench)
  try {
    const page = await openApp(context)
    await openComposer(page)
    for (let iteration = 0; iteration < bench.nAnswer; iteration++) {
      await attempt(bench, "answer", `a${iteration}`, iteration, async (word) => {
        const { enterAt, exchanges } = await ask(page, word, [page])
        const row = await unlessRateLimited(bench, word)
        const exchange = exchanges[0]!
        bench.record.check("answer", iteration, "question shown as asked", exchange.questionText === question(word), exchange.questionText)
        bench.record.check("answer", iteration, "answer contains the word", exchange.answerText.includes(word), exchange.answerText)
        bench.record.check("answer", iteration, "the answer row settled done", row.status === "done", `${row.status} ${row.failure ?? ""}`)
        bench.record.sample("answer.question", exchange.questionAt - enterAt)
        bench.record.sample("answer.first_text", exchange.firstTextAt - enterAt)
        bench.record.sample("answer.done", exchange.completeAt - enterAt)
        bench.record.detail("answer", {
          iteration,
          word,
          answer: exchange.answerText,
          states: exchange.samples.length,
          question: exchange.questionAt - enterAt,
          firstText: exchange.firstTextAt - enterAt,
          done: exchange.completeAt - enterAt,
        })
      })
    }
  } finally {
    await context.close()
  }
}

// Electric fan-out: two devices (separate browser contexts). A asks; from A's Enter keydown to the question in B's DOM,
// and to the answer done on B. Both devices receive the answer from Electric; neither writes it.
export const sync = async (bench: Bench) => {
  const [contextA, contextB] = await Promise.all([newContext(bench), newContext(bench)])
  try {
    const [a, b] = await Promise.all([openApp(contextA), openApp(contextB)])
    await openComposer(a)
    for (let iteration = 0; iteration < bench.nAnswer; iteration++) {
      await attempt(bench, "sync", `s${iteration}`, iteration, async (word) => {
        const { enterAt, exchanges } = await ask(a, word, [a, b])
        await unlessRateLimited(bench, word)
        const [onA, onB] = exchanges as [Exchange, Exchange]
        bench.record.check("sync", iteration, "B shows the question as asked", onB.questionText === question(word), onB.questionText)
        bench.record.check("sync", iteration, "A's answer contains the word", onA.answerText.includes(word), onA.answerText)
        bench.record.check("sync", iteration, "B's answer matches A's", onB.answerText === onA.answerText, onB.answerText)
        bench.record.sample("sync.question", onB.questionAt - enterAt)
        bench.record.sample("sync.answer_done", onB.completeAt - enterAt)
        bench.record.detail("sync", {
          iteration,
          word,
          answer: onA.answerText,
          question: onB.questionAt - enterAt,
          doneOnA: onA.completeAt - enterAt,
          doneOnB: onB.completeAt - enterAt,
        })
      })
    }
  } finally {
    await Promise.all([contextA.close(), contextB.close()])
  }
}

// ChatApi under load, from Node: `concurrency` asks at once, `bursts` times, each burst once the last one's answers
// settled. A 429, from ChatApi or from the model, is counted, not failed; after one the next burst backs off.
export const concurrent = async (bench: Bench) => {
  for (let burst = 0; burst < bench.bursts; burst++) {
    const words = Array.from({ length: bench.concurrency }, (_, index) => `bench-${bench.runId}-c${burst}x${index}`)
    const results = await Promise.all(words.map((word) => askApi(bench, word)))
    let limited = 0
    for (const [index, asked] of results.entries()) {
      const iteration = burst * bench.concurrency + index
      bench.record.count("concurrent.asks")
      bench.record.count(`concurrent.http.${asked.status}`)
      if (asked.status === 202) bench.record.sample("concurrent.accepted", asked.respondedAt - asked.sentAt)
      if (asked.confirmedAt > 0) bench.record.sample("concurrent.confirmed", asked.confirmedAt - asked.sentAt)
      bench.record.detail("concurrent", { iteration, burst, ...asDetail(asked) })
      if (asked.status === 429 || asked.answer?.failure === "rate_limited") {
        limited++
        bench.record.count("concurrent.rate_limited")
        continue
      }
      const done = asked.answer?.status === "done"
      if (done) bench.record.sample("concurrent.done", asked.settledAt - asked.sentAt)
      const ok = asked.status === 202 && asked.confirmedAt > 0 && done && asked.answer?.text?.includes(asked.word) === true
      if (!ok) bench.record.count("concurrent.failed")
      bench.record.check(
        "concurrent",
        iteration,
        "taken, confirmed and answered with the word",
        ok,
        asked.error ?? `HTTP ${asked.status}, answer ${asked.answer?.status} ${asked.answer?.failure ?? ""} ${asked.answer?.text ?? ""}`,
      )
    }
    if (limited > 0 && burst < bench.bursts - 1) {
      console.error(`bench: concurrent burst ${burst}: ${limited} rate-limited; backing off ${BACKOFF_MS / 1000} s`)
      await sleep(BACKOFF_MS)
    }
  }
}

export const SUITES = { load, cmdk, shape, question: questions, answer, sync, concurrent } as const
export type SuiteName = keyof typeof SUITES
