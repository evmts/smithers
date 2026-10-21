import type { Row } from "./shape"

// The spend guard (docs/infrastructure.md#against-a-deployment): a run against a deployment spends its real model
// budget, which its people share. Before each test the guard adds up the tokens the run's answers have used, as the
// server recorded them on each answer (`input_tokens` and `output_tokens`, worker/Chat.ts), and once the total reaches
// the run's budget every later test fails with `SpendBudgetSpent` instead of asking. It counts the answers in the
// conversation the run asks in; a model call that writes no answer, such as a judge's, isn't counted.

/** The run's budget in tokens when `E2E_TOKEN_BUDGET` is unset: about 40 asks at today's 14,000 tokens each. */
export const DEFAULT_TOKEN_BUDGET = 600_000

/** How long a worker trusts the total it read last before reading the conversation again. */
export const REREAD_MS = 60_000

export const tokenBudget = (env: { readonly E2E_TOKEN_BUDGET?: string | undefined }) => {
  const named = env.E2E_TOKEN_BUDGET ?? ""
  if (named === "") return DEFAULT_TOKEN_BUDGET
  const budget = Number(named)
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error(`E2E_TOKEN_BUDGET is "${named}": it must be a whole number of tokens above 0`)
  return budget
}

/** Postgres' text form of a timestamp (`2026-10-21 17:03:04.123456+00`) as ms since the epoch; NaN when it isn't one. */
export const parseTimestamp = (text: string) => {
  const match = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(\.\d+)?(Z|[+-]\d\d(?::?\d\d)?)$/.exec(text)
  if (match === null) return Number.NaN
  const [, date, time, fraction = "", zone] = match as unknown as [string, string, string, string | undefined, string]
  const offset = zone === "Z" ? "Z" : /^[+-]\d\d$/.test(zone) ? `${zone}:00` : zone.replace(/^([+-]\d\d)(\d\d)$/, "$1:$2")
  return Date.parse(`${date}T${time}${fraction.slice(0, 4)}${offset}`)
}

/** The tokens the answers written since `since` (ms since the epoch) used. */
export const spentSince = (rows: ReadonlyArray<Row>, since: number) => {
  let total = 0
  for (const row of rows) {
    if (row.role !== "assistant" || row.created_at === undefined || !(parseTimestamp(row.created_at) >= since)) continue
    total += Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0)
  }
  return total
}

/** The run's answers used its whole budget: the rest of the run asks nothing. */
export class SpendBudgetSpent extends Error {
  override readonly name = "SpendBudgetSpent"
  constructor(readonly spent: number, readonly budget: number) {
    super(`The run's answers used ${spent} tokens, its budget is ${budget} (E2E_TOKEN_BUDGET): this test doesn't start.`)
  }
}

/** When the run began: playwright.config.ts sets it once, and every worker inherits it. */
export const runStartedAt = (env: { readonly E2E_RUN_STARTED_AT?: string | undefined }) => {
  const at = Number(env.E2E_RUN_STARTED_AT)
  if (!Number.isFinite(at) || at <= 0) throw new Error("E2E_RUN_STARTED_AT is unset: playwright.config.ts sets it for a deployment run")
  return at
}

/** What the guard reads: whether it applies to this run, the budget, when the run began, and the run's answers. */
export type SpendGuardOptions = {
  /** Only a deployment run whose person can ask spends a shared budget. */
  readonly applies: () => boolean
  readonly budget: () => number
  readonly since: () => number
  readonly rows: () => Promise<ReadonlyArray<Row>>
  readonly now?: () => number
}

/**
 * The guard a worker runs before each test: it fails the test once the run's answers spent the budget. It reads the
 * conversation at most once a `REREAD_MS`, so a run of many short tests reads it a few times a minute.
 */
export const spendGuard = (options: SpendGuardOptions) => {
  const now = options.now ?? Date.now
  let last: { readonly at: number; readonly spent: number } | undefined
  return async () => {
    if (!options.applies()) return
    const budget = options.budget()
    if (last === undefined || now() - last.at >= REREAD_MS) last = { at: now(), spent: spentSince(await options.rows(), options.since()) }
    if (last.spent >= budget) throw new SpendBudgetSpent(last.spent, budget)
  }
}
