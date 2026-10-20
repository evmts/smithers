import { allServerRows, CHAT_FAILED, expect, expectSameThread, PAGE_SIZE, pairs, serverRows, test } from "./devices"

// Local-first guarantees across real devices: separate browser contexts, each holding the conversation Electric syncs
// from Postgres and asking through ChatApi, which answers on the server. No mocks. `setOffline` is a device losing its
// network; aborting `/api/shapes/*` is the sync service being down for one device. Every device records video:
// `pnpm e2e:gifs` makes one GIF per flow. The conversation is shared and keeps earlier runs, so every assertion is
// scoped to the test's own word (`devices.word`), and answers are matched on a word they contain, never exact wording.
// One-word answers keep the model's token use low; the few long answers are what make "mid-answer" possible.

// A long answer that ends in a word of its own, so "complete" means its last line arrived.
const longQuestion = (start: string, end: string) =>
  `Write ${start} on the first line, then count from 1 to 120 in words, one number per line, then write ${end} on the last line.`

test("offline ask: the question shows at once and fails, chat works after reconnecting, and no other device sees it", async ({ devices, request }) => {
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  await a.offline()

  // A asks with no network: the question shows at once (ask checks it within 1 s), then reads the failure copy.
  const offline = `Asked offline ${word}`
  await a.ask(offline)
  await a.expectFailed(offline, 20_000)
  expect(a.asked.map(({ text, error }) => ({ text, reached: error === undefined })), "the ask never reached ChatApi").toEqual([
    { text: offline, reached: false },
  ])
  await expect(a.composerForm, "the composer is ready again").toHaveAttribute("data-status", "ready")

  // Back online, chat is usable: the next question is answered, on A and on B.
  await a.online()
  const next = `Reply with exactly the word: next-${word}`
  await a.ask(next)
  await a.expectAnswered(next, `next-${word}`)
  await b.expectAnswered(next, `next-${word}`)

  // A keeps its failed question where it showed it, before the next one.
  const onA = pairs(await a.thread(word))
  expect(onA.map(([question]) => question.text)).toEqual([offline, next])
  expect(onA[0]![1].text).toBe(CHAT_FAILED)

  // B never sees the failed question, and Postgres never had it.
  await expect(b.question(offline)).toHaveCount(0)
  expect(pairs(await b.thread(word)).map(([question]) => question.text)).toEqual([next])
  const rows = await serverRows(request, word)
  expect(rows.map(({ role, text }) => ({ role, asked: role === "user" ? text : undefined }))).toEqual([
    { role: "user", asked: next },
    { role: "assistant", asked: undefined },
  ])
})

test("late joiner: a device that opens later shows the same latest messages, and Load earlier pages back through Postgres' order", async ({ devices, request }) => {
  const word = devices.word
  const [a] = await devices.open("A")
  const asked = [`Reply with exactly the word: first-${word}`, `Reply with exactly the word: second-${word}`]
  for (const [index, question] of asked.entries()) {
    await a.ask(question)
    await a.expectAnswered(question, `${index === 0 ? "first" : "second"}-${word}`)
  }

  // A new device, with nothing in memory, gets this test's messages exactly as A has them...
  const [late] = await devices.open("Late")
  const thread = await expectSameThread([a, late], word, 4)
  expect(pairs(thread).map(([question]) => question.text)).toEqual(asked)

  // ...and the same latest page of the conversation: every message, in the same order, with the same text.
  const total = (await allServerRows(request)).length
  await expect(async () => {
    const [onA, onLate] = await Promise.all([a.transcript(), late.transcript()])
    expect(onLate).toHaveLength(Math.min(PAGE_SIZE, total))
    expect(onLate).toEqual(onA)
  }).toPass({ timeout: 30_000 })

  // Load earlier pages back: the late device then shows the latest two pages, questions in Postgres' order.
  test.skip(total <= PAGE_SIZE, `the conversation has ${total} messages, one page: nothing earlier to load`)
  await expect(late.loadEarlier).toBeVisible()
  await late.loadEarlier.click()
  await expect(async () => {
    const [onLate, rows] = await Promise.all([late.transcript(), allServerRows(request)])
    const latest = rows.slice(-2 * PAGE_SIZE)
    expect(onLate).toHaveLength(latest.length)
    expect(onLate.map(({ role }) => role)).toEqual(latest.map(({ role }) => role))
    expect(onLate.filter(({ role }) => role === "user").map(({ text }) => text)).toEqual(
      latest.filter(({ role }) => role === "user").map(({ text }) => text),
    )
  }).toPass({ timeout: 30_000 })
})

test("two tabs: one browser's tabs share the conversation, and each tab keeps its own composer", async ({ devices }) => {
  const word = devices.word
  const [one] = await devices.open("Tab 1")
  const two = await devices.tab(one.device, "Tab 2")

  // The composer belongs to its tab: tab 1's is open with a draft, tab 2's stays hidden, then opens empty.
  const draft = `Reply with exactly the word: draft-${word}`
  await one.openComposer()
  await one.composer.fill(draft)
  await expect(two.chatButton).toBeVisible()
  await expect(two.composer).toBeHidden()
  await two.openComposer()
  await expect(two.composer).toHaveValue("")
  await expect(one.composer).toHaveValue(draft)

  // Tab 2 asks; tab 1 watches the answer arrive, and its draft is untouched.
  const asked = `Reply with exactly the word: tabs-${word}`
  await two.ask(asked)
  await one.expectAnswered(asked, `tabs-${word}`)
  await two.expectAnswered(asked, `tabs-${word}`)
  await expect(one.composer).toHaveValue(draft)

  // Hiding tab 2's composer leaves tab 1's open; tab 1 sends its draft and tab 2 sees it answered.
  await two.page.keyboard.press("Escape")
  await expect(two.composer).toBeHidden()
  await expect(one.composer).toBeVisible()
  await one.composer.press("Enter")
  await two.expectAnswered(draft, `draft-${word}`)

  const thread = await expectSameThread([one, two], word, 4)
  expect(pairs(thread).map(([question]) => question.text)).toEqual([asked, draft])
  // Each tab asked ChatApi once, for its own question.
  expect(one.asked.map(({ text }) => text)).toEqual([draft])
  expect(two.asked.map(({ text }) => text)).toEqual([asked])
})

test("concurrent asks: two devices ask at the same moment, and each question gets exactly one answer, in one order everywhere", async ({ devices, request }) => {
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  const alpha = `Reply with exactly the word: alpha-${word}`
  const bravo = `Reply with exactly the word: bravo-${word}`
  await a.openComposer()
  await b.openComposer()
  await a.composer.fill(alpha)
  await b.composer.fill(bravo)
  await Promise.all([a.composer.press("Enter"), b.composer.press("Enter")])

  const thread = await expectSameThread([a, b], word, 4)
  const answers = new Map(pairs(thread).map(([question, answer]) => [question.text, answer.text]))
  expect([...answers.keys()].sort()).toEqual([alpha, bravo])
  expect(answers.get(alpha)).toContain(`alpha-${word}`)
  expect(answers.get(alpha)).not.toContain(`bravo-${word}`)
  expect(answers.get(bravo)).toContain(`bravo-${word}`)
  expect(answers.get(bravo)).not.toContain(`alpha-${word}`)
  // Each device asked once, and Postgres holds each question with its own answer right after it.
  expect(a.asked.map(({ text, status }) => ({ text, status }))).toEqual([{ text: alpha, status: 202 }])
  expect(b.asked.map(({ text, status }) => ({ text, status }))).toEqual([{ text: bravo, status: 202 }])
  const rows = await serverRows(request, word)
  expect(rows.map(({ role }) => role)).toEqual(["user", "assistant", "user", "assistant"])
  for (const index of [0, 2]) {
    expect(rows[index + 1]!.question_id, "each answer follows its own question").toBe(rows[index]!.id)
    expect(Number(rows[index + 1]!.position)).toBeGreaterThan(Number(rows[index]!.position))
  }
  expect(rows.filter(({ role }) => role === "user").map(({ text }) => text)).toEqual(pairs(thread).map(([question]) => question.text))
})

test("tab closes mid-answer: the watching device sees the answer complete, because the server owns it", async ({ devices, request }) => {
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  const asked = longQuestion(`gone-${word}`, `end-${word}`)
  await a.askAndWaitTaken(asked)

  // The asking device goes away for good while the server is still answering: closed laptop, killed browser.
  await a.device.context.close()

  await b.expectAnswered(asked, `end-${word}`)
  const [question, answer] = await serverRows(request, word)
  expect(question?.text).toBe(asked)
  expect(answer?.status).toBe("done")
  expect(answer?.text).toContain(`end-${word}`)
})

test("reload mid-answer: the asking device reloads while another watches, and both see the answer complete", async ({ devices }) => {
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  const asked = longQuestion(`reload-${word}`, `end-${word}`)
  await a.askAndWaitTaken(asked)
  await a.reload()

  for (const tab of [b, a]) await tab.expectAnswered(asked, `end-${word}`)
  await expectSameThread([a, b], word, 2)

  // A's chat works after the reload: the next question is answered on both devices.
  const next = `Reply with exactly the word: after-${word}`
  await a.ask(next)
  await b.expectAnswered(next, `after-${word}`)
  const thread = await expectSameThread([a, b], word, 4)
  expect(pairs(thread).map(([question]) => question.text)).toEqual([asked, next])
})

test("long outage: a device offline until it says it lost its connection catches up on everything asked meanwhile", async ({ devices }) => {
  test.setTimeout(180_000)
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  await a.offline()

  // A request A had open may still deliver until it ends: going offline doesn't cancel it. Once no request has
  // succeeded for 10 s, A says it lost its connection, and from then on nothing reaches it.
  await expect(a.syncLost, "A says it lost its connection").toBeVisible({ timeout: 60_000 })

  const meanwhile = [`Reply with exactly the word: away1-${word}`, `Reply with exactly the word: away2-${word}`]
  for (const [index, question] of meanwhile.entries()) {
    await b.ask(question)
    await b.expectAnswered(question, `away${index + 1}-${word}`)
  }
  for (const question of meanwhile) await expect(a.question(question)).toHaveCount(0)
  await expect(a.syncLost).toBeVisible()

  // Back online, A syncs at once: the alert clears by itself and A has both questions and answers, as B has them.
  const back = Date.now()
  await a.online()
  await expect(a.syncLost, "A's alert clears once sync is back").toBeHidden({ timeout: 30_000 })
  const thread = await expectSameThread([a, b], word, 4, 30_000)
  expect(pairs(thread).map(([question]) => question.text)).toEqual(meanwhile)
  test.info().annotations.push({ type: "catch-up", description: `${Date.now() - back} ms from online to A showing both answers` })
})

test("flapping network: questions asked online between drops arrive once each, in order, and asks made offline fail visibly", async ({ devices, request }) => {
  test.setTimeout(180_000)
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  const kept: Array<string> = []
  const dropped: Array<string> = []
  for (const round of [1, 2, 3]) {
    await a.offline()
    const lost = `Asked during drop ${round} ${word}`
    await a.ask(lost)
    await a.expectFailed(lost, 20_000)
    dropped.push(lost)

    await a.online()
    const question = `Reply with exactly the word: flap${round}-${word}`
    await a.ask(question)
    await a.expectAnswered(question, `flap${round}-${word}`)
    kept.push(question)
  }

  // B has exactly the questions A asked online, once each, in order, each answered.
  const onB = pairs(await expectSameThread([b], word, 6))
  expect(onB.map(([question]) => question.text)).toEqual(kept)
  for (const [index, [, answer]] of onB.entries()) expect(answer.text).toContain(`flap${index + 1}-${word}`)

  // A shows all six in the order asked, each dropped one failed where it was asked.
  const onA = pairs(await a.thread(word))
  expect(onA.map(([question]) => question.text)).toEqual([dropped[0], kept[0], dropped[1], kept[1], dropped[2], kept[2]])
  for (const [question, answer] of onA) {
    if (dropped.includes(question.text)) expect(answer.text).toBe(CHAT_FAILED)
    else expect(answer.text).not.toBe(CHAT_FAILED)
  }

  // Postgres has the kept questions only.
  const rows = await serverRows(request, word)
  expect(rows.filter(({ role }) => role === "user").map(({ text }) => text)).toEqual(kept)
})

test("sync down while asking: a question ChatApi took shows failed, then its answer replaces the failure once sync returns", async ({ devices }) => {
  test.setTimeout(180_000)
  const word = devices.word
  const [a, b] = await devices.open("A", "B")

  // The sync service goes down for A only. Once A's open request ends and the next fails for 10 s, A says so.
  await a.device.syncDown()
  await expect(a.syncLost, "A says it lost its connection").toBeVisible({ timeout: 60_000 })
  await expect(b.syncLost).toHaveCount(0)

  // ChatApi takes A's question and answers it; B sees the answer. A can't confirm it, so A shows it failed.
  const asked = `Reply with exactly the word: unsynced-${word}`
  await a.askAndWaitTaken(asked)
  await b.expectAnswered(asked, `unsynced-${word}`)
  await a.expectFailed(asked, 30_000)

  // Sync returns: A recovers by itself, and Postgres' rows replace A's failure, so A shows the question once, answered.
  await a.device.syncUp()
  await expect(a.syncLost, "A's alert clears by itself once sync is back").toBeHidden({ timeout: 30_000 })
  await a.expectAnswered(asked, `unsynced-${word}`, 30_000)
  await expectSameThread([a, b], word, 2)

  // A's chat works: the next question is answered.
  const next = `Reply with exactly the word: resynced-${word}`
  await a.ask(next)
  await a.expectAnswered(next, `resynced-${word}`)
  await expectSameThread([a, b], word, 4)
})

test("duplicate ask: resending a question ChatApi already took, or reusing its id, changes nothing on any device or in Postgres", async ({ devices, request }) => {
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  const asked = `Reply with exactly the word: once-${word}`
  await a.ask(asked)
  await a.expectAnswered(asked, `once-${word}`)

  // The same question again, ids and all, as a retry after a lost response sends it: ChatApi answers 200 and says
  // the question is already there.
  const [first] = a.asked
  const retry = await request.post("/api/questions", { data: { id: first!.questionId, answerId: first!.answerId, text: first!.text } })
  expect(retry.status()).toBe(200)
  expect(await retry.json()).toEqual({ txid: null, existing: true })

  // The same id with another answer id is a different question: refused, and nothing is written.
  const conflict = await request.post("/api/questions", { data: { id: first!.questionId, answerId: crypto.randomUUID(), text: first!.text } })
  expect(conflict.status()).toBe(409)

  const rows = await serverRows(request, word)
  expect(rows.map(({ id, role, status }) => ({ id, role, status }))).toEqual([
    { id: first!.questionId, role: "user", status: "done" },
    { id: first!.answerId, role: "assistant", status: "done" },
  ])
  await expectSameThread([a, b], word, 2)
})
