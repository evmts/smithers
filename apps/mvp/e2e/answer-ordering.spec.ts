import { expect, test } from "./devices"
import { requires, scriptedAgent } from "./target"

// An unhappy-path model service takes longer than the server's old 30-second liveness window. The browser engine,
// Worker routes, Postgres, Electric and UI are real. No route is intercepted and no clock is replaced. The slow model
// is the scripted agent's, a dev build's, and asking needs a Member or above.
requires("scriptedAgent", "member")

test("a follow-up waits through long reasoning and receives the earlier answer", {
  annotation: { type: "summary", description: "A slow answer keeps its place, and the next question receives its completed reply." },
}, async ({ devices }) => {
  test.setTimeout(180_000)
  const [a] = await devices.open("A")
  await a.page.goto(scriptedAgent("reasoning-order"))
  await a.ready()
  const word = devices.word
  const first = `Think quietly, then say ready: ${word}`
  const second = `Use the previous answer: ${word}`
  const turns = new Map<string, { readonly question: string; readonly history: ReadonlyArray<{ question: string; answer: string }> }>()
  a.device.context.on("response", async (response) => {
    const url = new URL(response.url())
    if (response.request().method() !== "GET" || !url.pathname.startsWith("/api/answers/") || response.status() !== 200) return
    const body = await response.json().catch(() => undefined)
    if (body?.question !== undefined && Array.isArray(body.history)) turns.set(body.question, body)
  })

  await test.step("Ask for an answer that takes time to think", async () => {
    await a.askAndWaitTaken(first)
    await expect.poll(() => turns.has(first), { timeout: 60_000 }).toBe(true)
  })
  await test.step("Ask the follow-up while the earlier answer is still working", async () => {
    await a.askAndWaitTaken(second)
    await expect(a.answerTo(first)).not.toContainText(`Ready ${word}.`)
  })
  await test.step("Both answers finish in order with the earlier reply in context", async () => {
    await a.expectAnswered(first, `Ready ${word}.`, 90_000)
    await a.expectAnswered(second, `Earlier answer included: ${word}.`, 60_000)
    await expect.poll(() => turns.get(second)?.history, { timeout: 10_000 }).toContainEqual({
      question: first,
      answer: `Ready ${word}.`,
    })
    await expect(a.answerTo(second)).not.toContainText("Earlier answer missing")
  })
})
