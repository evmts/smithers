import type { BrowserContext } from "@playwright/test"
import { allServerRows, expect, type Row, test } from "./devices"

// Jev in the agent's hands, end to end (docs/features/jev.md): a real browser asks Smithers which of three short items
// are bug reports. Its agent calls `app/jev/classify` on the device's own engine, the judgment goes through ChatApi's
// metered endpoint as role `judge` (`POST /api/model/judge`, the real model), and the answer gives a verdict per item.
// No mocks. One question: a few agent calls and one judge call, since Cerebras rate-limits concurrent calls.

/** Every model call this browser context made, by role: the engine worker's requests to the model endpoint. */
const modelCalls = (context: BrowserContext) => {
  const calls: Array<string> = []
  context.on("request", (request) => {
    const { pathname } = new URL(request.url())
    if (request.method() === "POST" && pathname.startsWith("/api/model/")) calls.push(pathname.slice("/api/model/".length))
  })
  return calls
}

/** The flow steps the answer to `question` shows, as Postgres holds them (`messages.parts`). */
const stepsOf = (rows: Array<Row>, question: string): Array<{ flow: string; status: string }> => {
  const asked = rows.find((row) => row.role === "user" && row.text === question)
  const answer = rows.find((row) => asked !== undefined && row.question_id === asked.id) as (Row & { parts?: unknown }) | undefined
  const parts = typeof answer?.parts === "string" ? JSON.parse(answer.parts) : answer?.parts ?? []
  return (parts as Array<{ kind: string; flow: string; status: string }>).filter((part) => part.kind === "step")
}

test("jev: asking which items are bugs classifies them through the judge role, and the answer gives each a verdict", async ({ devices, request }) => {
  const word = devices.word
  const [a] = await devices.open("A")
  const calls = modelCalls(a.device.context)
  const question =
    `Which of these are bug reports? 1. "The app crashes when I click Save" 2. "Please add a dark mode" ` +
    `3. "Sign-in fails with a 500 error". Ask Jev with app/jev/classify, then reply with one line per item, ` +
    `"<number>: <verdict>" using Jev's verdicts, and a last line jev-${word}.`
  await a.askAndWaitTaken(question)
  await a.expectAnswered(question, `jev-${word}`, 90_000)

  // The answer shows a verdict for each of the three items.
  const text = (await a.answerTo(question).textContent()) ?? ""
  for (const item of [1, 2, 3]) expect(text, `item ${item}'s verdict`).toMatch(new RegExp(`${item}:\\s*\\**(yes|no|unsure)`, "i"))
  // The agent called the flow once, and it settled; its judgment went through the endpoint's `judge` role.
  expect(stepsOf(await allServerRows(request), question)).toEqual([expect.objectContaining({ flow: "app/jev/classify", status: "done" })])
  expect(calls.filter((role) => role === "judge")).toHaveLength(1)
  expect(new Set(calls)).toEqual(new Set(["agent", "judge"]))
})
