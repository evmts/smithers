import type { SpendAlert } from "./schema"

// What a spend alert's toast says (docs/features/spend-alerts.md): its word, then the window's tokens and estimated
// cost, with the role when one role spent, or each role's tokens when several did.

/** The toast's word, in place of its state's. */
export const ALERT_WORD = "Model spend"

const count = (value: number) => Math.round(value).toLocaleString("en-US")

const dollars = (usd: number) => (usd > 0 && usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`)

/** `agent · 12,340 tokens · $0.02`, or with several roles `12,340 tokens · $0.02 · agent 12,000 · judge 340`. */
export const alertDetail = (alert: Pick<SpendAlert, "tokens" | "costUsd" | "roles">): string => {
  const total = [`${count(alert.tokens)} tokens`, ...(alert.costUsd === null ? [] : [dollars(alert.costUsd)])]
  const [only] = alert.roles
  if (alert.roles.length === 1 && only !== undefined) return [only.role, ...total].join(" · ")
  return [...total, ...alert.roles.map((role) => `${role.role} ${count(role.tokens)}`)].join(" · ")
}
