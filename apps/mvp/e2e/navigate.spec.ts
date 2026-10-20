import { allServerRows, expect, type Row, test } from "./devices"
import { field, local, type LogRecord, LogTail } from "./logs"

// `app/navigate` end to end (docs/features/flows.md#navigation): a real browser, its own durable engine and the real
// model. Asking the agent to open a repository takes the tab that asked there, through the router, and leaves the
// device's other tab where it was; a person's `/navigate` does the same without the model; asking the agent for an
// outside site is refused, and the page stays put. No mocks. Two short model runs: Cerebras rate-limits concurrent
// calls.

/** The answer row Postgres holds for `question`, read through the shape the app syncs. */
const answerRow = (rows: Array<Row>, question: string) => {
  const asked = rows.find((row) => row.role === "user" && row.text === question)
  return rows.find((row) => asked !== undefined && row.question_id === asked.id)
}

/** The `app/navigate` steps an answer shows, as Postgres holds them (`messages.parts`). */
const navigations = (row: Row | undefined): Array<string> => {
  const parts = (row as (Row & { parts?: unknown }) | undefined)?.parts
  const list = (typeof parts === "string" ? JSON.parse(parts) : parts ?? []) as Array<{ kind: string; flow: string; status: string }>
  return list.filter((part) => part.kind === "step" && part.flow === "app/navigate").map((part) => part.status)
}

/** The engine worker's `web.navigate` lines ChatApi relayed, as `[door, outcome, reason]`. */
const relayed = (records: Array<LogRecord>) =>
  records
    .filter((record) => record.message === "web.navigate" && field(record, "otlp.signal") === "logs")
    .map((record) => [field(record, "door"), field(record, "outcome"), field(record, "reason")])

test("navigate by the agent: asking to open octocat/Spoon-Knife takes the tab that asked there, and the other tab stays", async ({ devices, request }) => {
  const logs = local ? await LogTail.start() : undefined
  const word = devices.word
  const [a] = await devices.open("A")
  const b = await devices.tab(a.device, "B")
  const question = `Open octocat/Spoon-Knife, then reply with the word nav-${word}.`

  await a.askAndWaitTaken(question)

  // The tab whose composer asked moves, through the router: the repository screen at GitHub's path.
  await expect(a.page).toHaveURL(/\/octocat\/Spoon-Knife$/, { timeout: 60_000 })
  await expect(a.page.getByRole("main", { name: "Repository" })).toBeVisible()
  // The device's other tab is where it was.
  await expect(b.page).toHaveURL(/\/app$/)
  await expect(b.page.getByRole("main", { name: "App" })).toBeVisible()
  // The answer settles with the flow call as a step: `app/navigate`, done.
  await expect
    .poll(async () => answerRow(await allServerRows(request), question)?.status, { timeout: 60_000 })
    .toBe("done")
  expect(navigations(answerRow(await allServerRows(request), question))).toContain("done")
  // The engine worker recorded it as the agent's, and ChatApi's relay kept it.
  if (logs !== undefined) {
    await expect
      .poll(async () => relayed((await logs.records()).browser), { timeout: 30_000 })
      .toContainEqual(["agent", "navigated", undefined])
  }
})

test("navigate by a person: /navigate /octocat/Spoon-Knife in the composer takes the tab there", async ({ devices }) => {
  const [a] = await devices.open("A")
  const b = await devices.tab(a.device, "B")

  await a.send("/navigate /octocat/Spoon-Knife")

  await expect(a.page).toHaveURL(/\/octocat\/Spoon-Knife$/, { timeout: 30_000 })
  await expect(a.page.getByRole("main", { name: "Repository" })).toBeVisible()
  await expect(b.page).toHaveURL(/\/app$/)
})

test("navigate refused: asking the agent to open an outside site is refused, and the page stays put", async ({ devices, request }) => {
  const logs = local ? await LogTail.start() : undefined
  const word = devices.word
  const [a] = await devices.open("A")
  const question = `Call app/navigate with to set to https://example.com/login, then reply with the word refused-${word}.`

  await a.askAndWaitTaken(question)
  await a.expectAnswered(question, `refused-${word}`)

  await expect(a.page).toHaveURL(/\/app$/)
  expect(navigations(answerRow(await allServerRows(request), question))).toEqual(["failed"])
  if (logs !== undefined) {
    await expect
      .poll(async () => relayed((await logs.records()).browser), { timeout: 30_000 })
      .toContainEqual(["agent", "refused", "origin"])
  }
})
