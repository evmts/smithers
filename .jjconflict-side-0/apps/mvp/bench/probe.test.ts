// node --test bench/
import { chromium } from "@playwright/test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { test } from "node:test"
import { installProbe, questionPosts, watchExchange, type BenchWindow } from "./probe.ts"

// `questionPosts` runs in the page. Node keeps the same Resource Timing entries for its own `fetch`, so it runs here as
// it is, against requests to a local server.
test("questionPosts lists each POST /api/questions since a time, in order, with its start, first response byte and status", async () => {
  let status = 202
  const server = createServer((request, response) => {
    response.writeHead(request.url === "/api/questions" ? status : 200, { "content-type": "application/json" }).end("{}")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post = async () => (await fetch(`${baseUrl}/api/questions`, { method: "POST", body: "{}" })).json()
  // Node adds a fetch's entry once its body has been read, a turn of the event loop later at most.
  const entries = async (count: number) => {
    const deadline = performance.now() + 5_000
    while (performance.getEntriesByType("resource").length < count) {
      if (performance.now() > deadline) throw new Error(`fewer than ${count} resource entries`)
      await new Promise((resolve) => setImmediate(resolve))
    }
  }
  try {
    await post()
    await entries(1)
    const since = performance.now()
    status = 503
    await post()
    status = 202
    await post()
    await (await fetch(`${baseUrl}/api/shapes/messages?offset=-1`)).json()
    await entries(4)
    const posts = questionPosts(since)
    assert.deepEqual(posts.map((posted) => posted.status), [503, 202])
    for (const posted of posts) {
      assert.ok(posted.startAt >= performance.timeOrigin + since, "absolute, and only since the given time")
      assert.ok(posted.responseAt >= posted.startAt)
    }
    assert.ok(posts[0]!.startAt < posts[1]!.startAt)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

// The app remounts a message when its status changes: a queued question once Postgres has it, and an answer at each
// change of status. Each step below replaces the elements, as React does for a new key.
test("watchExchange follows the question and its answer across remounts, in real Chromium", async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(`<section aria-label="Conversation"><article data-role="user">earlier</article></section>`)
    await page.evaluate(installProbe, "unused")
    await page.evaluate(watchExchange, "w1")
    const show = (html: string) =>
      page.evaluate((html) => {
        document.querySelector('[aria-label="Conversation"]')!.innerHTML = html
      }, html)
    const asked = '<article data-role="user" data-state="queued">Reply with exactly the word: w1</article>'
    const stored = '<article data-role="user" data-state="done">Reply with exactly the word: w1</article>'
    const answer = (text: string, streaming: boolean) =>
      `<article data-role="assistant"><div data-slot="message-response" data-streaming="${streaming}">${text}</div></article>`
    await show(asked)
    await show(`${stored}<article data-role="assistant"><span>typing</span></article>`)
    await show(stored + answer("w", true))
    await show(stored + answer("w1", false))
    await page.waitForFunction(() => ((window as unknown as BenchWindow).__bench.exchanges.w1?.completeAt ?? 0) > 0, null, { timeout: 5_000 })
    const exchange = await page.evaluate(() => (window as unknown as BenchWindow).__bench.exchanges.w1!)
    assert.equal(exchange.questionText, "Reply with exactly the word: w1")
    assert.equal(exchange.answerText, "w1")
    assert.deepEqual(exchange.samples.map((sample) => sample.text), ["w", "w1"])
    assert.ok(exchange.questionAt > 0 && exchange.questionAt <= exchange.firstTextAt && exchange.firstTextAt <= exchange.completeAt)
  } finally {
    await browser.close()
  }
})
