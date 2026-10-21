import { Pricing } from "@smthrs/model"
import type { Trial } from "./checks"

// What an eval run spent and how it reads (docs/features/agent-evals.md#results): the metered endpoint's tokens and
// cost by role, the judge's, and the table an operator reads first. Pure.

/** One role's spend. */
export interface RoleSpend {
  readonly calls: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
}

/** A run's spend: by role, and in total. */
export interface Spend {
  readonly roles: Readonly<Record<string, RoleSpend>>
  readonly total: { readonly calls: number; readonly tokens: number; readonly costUsd: number }
}

/** What a judge reading reported it cost, when it reported anything. */
export interface ReadingUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly modelId?: string | undefined
  readonly costUsd?: number | undefined
}

const add = (into: Record<string, RoleSpend>, role: string, usage: ReadingUsage) => {
  const before = into[role] ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
  into[role] = {
    calls: before.calls + 1,
    inputTokens: before.inputTokens + usage.inputTokens,
    outputTokens: before.outputTokens + usage.outputTokens,
    costUsd: before.costUsd + (usage.costUsd ?? Pricing.cost(usage, usage.modelId)?.costUsd ?? 0),
  }
}

const totalOf = (roles: Readonly<Record<string, RoleSpend>>): Spend["total"] =>
  Object.values(roles).reduce(
    (sum, role) => ({
      calls: sum.calls + role.calls,
      tokens: sum.tokens + role.inputTokens + role.outputTokens,
      costUsd: sum.costUsd + role.costUsd,
    }),
    { calls: 0, tokens: 0, costUsd: 0 },
  )

/** What the metered endpoint served the trials, by role, priced at its model's list price. */
export const endpointSpend = (trials: ReadonlyArray<Trial>): Spend => {
  const roles: Record<string, RoleSpend> = {}
  for (const usage of trials.flatMap((trial) => trial.usage)) add(roles, usage.role, usage)
  return { roles, total: totalOf(roles) }
}

/** What the judge's readings cost, by the model that took them: the price it reported, else the list price. */
export const judgeSpend = (readings: ReadonlyArray<ReadingUsage | null>): Spend => {
  const roles: Record<string, RoleSpend> = {}
  for (const usage of readings) if (usage !== null) add(roles, usage.modelId ?? "unknown", usage)
  return { roles, total: totalOf(roles) }
}

/** A scorer's result for one case: its score, or `null` when it couldn't score, and why. */
export interface Scored {
  readonly score: number | null
  readonly reason: string | null
}

const cell = (scored: Scored | undefined) =>
  scored === undefined
    ? "-"
    : scored.score === null
    ? `? ${scored.reason}`
    : scored.score === 1
    ? "1"
    : `${scored.score} (${scored.reason})`

const line = (label: string, spend: Spend) =>
  `${label}: ${spend.total.calls} calls, ${spend.total.tokens} tokens, $${spend.total.costUsd.toFixed(4)}`

/** One row per case and scorer, then what the run spent and how long it took. */
export const summary = (run: {
  readonly cases: ReadonlyArray<{ readonly name: string; readonly scores: Readonly<Record<string, Scored>> }>
  readonly endpoint: Spend
  readonly judge: Spend
  readonly ms: number
}): string =>
  [
    "| case | behavior | safety | judge |",
    "|---|---|---|---|",
    ...run.cases.map((kase) =>
      `| ${kase.name} | ${cell(kase.scores["behavior"])} | ${cell(kase.scores["safety"])} | ${cell(kase.scores["judge"])} |`
    ),
    "",
    line("model endpoint", run.endpoint),
    line("judge", run.judge),
    `answers took ${Math.round(run.ms / 1000)} s`,
  ].join("\n")
