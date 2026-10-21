import { describe, expect, it } from "vitest"
import type { Row } from "./shape"
import {
  DEFAULT_TOKEN_BUDGET,
  MAX_UNREAD,
  parseTimestamp,
  REREAD_MS,
  runStartedAt,
  SpendBudgetSpent,
  spendGuard,
  spentSince,
  SpendUnknown,
  tokenBudget,
} from "./spend"

const START = Date.UTC(2026, 9, 21, 17, 0, 0)

const row = (fields: Partial<Row>): Row => ({
  id: crypto.randomUUID(),
  role: "assistant",
  text: "",
  status: "done",
  question_id: null,
  failure: null,
  position: "1",
  input_tokens: "1000",
  output_tokens: "200",
  created_at: "2026-10-21 17:00:01.5+00",
  ...fields,
})

describe("Postgres timestamps", () => {
  it("read as ms since the epoch in every zone form Postgres and Electric write", () => {
    expect(parseTimestamp("2026-10-21 17:00:00+00")).toBe(START)
    expect(parseTimestamp("2026-10-21 17:00:00.123456+00")).toBe(START + 123)
    expect(parseTimestamp("2026-10-21T17:00:00Z")).toBe(START)
    expect(parseTimestamp("2026-10-21 10:00:00-07")).toBe(START)
    expect(parseTimestamp("2026-10-21 22:30:00+05:30")).toBe(START)
    expect(parseTimestamp("2026-10-21 22:30:00+0530")).toBe(START)
  })

  it("are NaN when they aren't one", () => {
    expect(parseTimestamp("yesterday")).toBeNaN()
    expect(parseTimestamp("2026-10-21 17:00:00")).toBeNaN()
  })
})

describe("the run's spend", () => {
  it("adds up the tokens of the answers written since the run began", () => {
    const rows = [
      row({}),
      row({ input_tokens: "3000", output_tokens: null, created_at: "2026-10-21 17:05:00+00" }),
      row({ created_at: "2026-10-21 16:59:59.999+00" }),
      row({ role: "user", created_at: "2026-10-21 17:01:00+00" }),
      row({ created_at: undefined }),
      row({ created_at: "not a time" }),
      row({ input_tokens: null, output_tokens: undefined }),
    ]
    expect(spentSince(rows, START)).toBe(1200 + 3000)
  })

  it("is nothing before any answer", () => {
    expect(spentSince([], START)).toBe(0)
  })
})

describe("the budget", () => {
  it("is E2E_TOKEN_BUDGET, or 600,000 tokens when it is unset or empty", () => {
    expect(tokenBudget({})).toBe(DEFAULT_TOKEN_BUDGET)
    expect(tokenBudget({ E2E_TOKEN_BUDGET: "" })).toBe(600_000)
    expect(tokenBudget({ E2E_TOKEN_BUDGET: "50000" })).toBe(50_000)
  })

  it("refuses a budget that isn't a whole number of tokens above 0", () => {
    for (const bad of ["0", "-5", "1.5", "lots", "1e400"]) {
      expect(() => tokenBudget({ E2E_TOKEN_BUDGET: bad }), bad).toThrow(`E2E_TOKEN_BUDGET is "${bad}"`)
    }
  })

  it("is spent with the numbers in the error the test fails with", () => {
    const error = new SpendBudgetSpent(612_000, 600_000)
    expect(error.name).toBe("SpendBudgetSpent")
    expect(error.message).toBe("The run's answers used 612000 tokens, its budget is 600000 (E2E_TOKEN_BUDGET): this test doesn't start.")
  })
})

describe("the run's start", () => {
  it("is what playwright.config.ts set, and its absence is an error", () => {
    expect(runStartedAt({ E2E_RUN_STARTED_AT: String(START) })).toBe(START)
    expect(() => runStartedAt({})).toThrow("E2E_RUN_STARTED_AT is unset")
    expect(() => runStartedAt({ E2E_RUN_STARTED_AT: "soon" })).toThrow("E2E_RUN_STARTED_AT is unset")
  })
})

describe("the guard", () => {
  const setup = (rows: Array<Row>, applies = true) => {
    let clock = START + 1_000
    let reads = 0
    let failing: Error | undefined
    const unread: Array<unknown> = []
    const guard = spendGuard({
      applies: () => applies,
      budget: () => 2_000,
      since: () => START,
      rows: async () => {
        reads++
        if (failing !== undefined) throw failing
        return rows
      },
      unread: (error) => unread.push(error),
      // The real clock where nothing applies: the guard never asks it.
      ...(applies ? { now: () => clock } : {}),
    })
    return { guard, reads: () => reads, tick: (ms: number) => (clock += ms), fail: (error?: Error) => (failing = error), unread }
  }

  it("lets tests start while the run's answers are under budget, reading the conversation once a minute", async () => {
    const rows = [row({})]
    const { guard, reads, tick } = setup(rows)
    await guard()
    await guard()
    expect(reads()).toBe(1)
    rows.push(row({ input_tokens: "900" }))
    tick(REREAD_MS - 1)
    await guard()
    expect(reads()).toBe(1)
    tick(1)
    await expect(guard()).rejects.toThrow(SpendBudgetSpent)
    expect(reads()).toBe(2)
  })

  it("stops every later test once the budget is spent", async () => {
    const { guard } = setup([row({ input_tokens: "1800" })])
    await expect(guard()).rejects.toMatchObject({ spent: 2_000, budget: 2_000 })
    await expect(guard()).rejects.toThrow("this test doesn't start")
  })

  it("lets a test start when a read fails, reports it, keeps its last total and reads again before the next test", async () => {
    const rows = [row({ input_tokens: "1800" })]
    const { guard, reads, fail, unread, tick } = setup(rows)
    const down = new Error("ChatApi serves the messages shape: 503")
    fail(down)
    await guard()
    await guard()
    expect(reads()).toBe(2)
    expect(unread).toEqual([down, down])
    fail(undefined)
    await expect(guard()).rejects.toThrow(SpendBudgetSpent)
    fail(down)
    tick(REREAD_MS)
    await expect(guard(), "the last total stands while a read fails").rejects.toThrow(SpendBudgetSpent)
    expect(unread).toHaveLength(3)
  })

  it("stops tests once the spend can't be read MAX_UNREAD times in a row, and starts them again after a read", async () => {
    const { guard, fail, unread } = setup([row({})])
    const down = new Error("503")
    fail(down)
    for (let read = 1; read < MAX_UNREAD; read++) await guard()
    await expect(guard()).rejects.toThrow(SpendUnknown)
    await expect(guard()).rejects.toMatchObject({ reads: MAX_UNREAD + 1 })
    expect(unread).toHaveLength(MAX_UNREAD + 1)
    fail(undefined)
    await guard()
  })

  it("reads nothing where it doesn't apply: locally, or for a person who can't ask", async () => {
    const { guard, reads } = setup([row({ input_tokens: "999999" })], false)
    await guard()
    expect(reads()).toBe(0)
  })
})
