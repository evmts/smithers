/**
 * Retry backoff and stall detection as a runnable program.
 *
 * Both are plain data with no runtime: `RetryPolicy.decide` turns one failed
 * attempt into "retry after N ms" or "give up", and `Stall.observe` folds one
 * round into the carried state and reports when a loop has stopped making
 * progress. Run it with `node examples/retry-and-stall.ts`;
 * `test/examples.test.ts` runs it so this program and the docs stay in step.
 *
 * @since 1.0.0
 */

import { RetryPolicy, Stall } from "@smthrs/flow"

/**
 * The decision after each failed attempt of a policy that doubles from 100 ms,
 * caps at 1 second, and allows five attempts, as one line per attempt.
 *
 * @returns One line per failed attempt, ending with the give-up line.
 * @throws Never; the policy below passes `RetryPolicy.make` validation.
 * @since 1.0.0
 * @category examples
 */
export const retrySchedule = (): ReadonlyArray<string> => {
  const policy = RetryPolicy.make({ initialMs: 100, factor: 2, maxMs: 1_000, maxAttempts: 5 })
  const lines: Array<string> = []
  for (let attempt = 1;; attempt++) {
    const decision = RetryPolicy.decide(policy, { attempt, error: new Error("connection reset") })
    if (decision._tag === "GiveUp") {
      lines.push(`attempt ${attempt}: give up (${decision.reason})`)
      return lines
    }
    lines.push(`attempt ${attempt}: retry after ${decision.delayMs} ms`)
  }
}

/**
 * Feeds a repair loop's rounds through a stall policy that stops after the
 * same failing checks in three rounds in a row, as one line per round.
 *
 * @returns One line per round, ending with the round that stalled.
 * @throws Never; the policy below passes `Stall.policy` validation.
 * @since 1.0.0
 * @category examples
 */
export const stallVerdict = (): ReadonlyArray<string> => {
  const policy = Stall.policy({ rounds: 3, on: "stop" })
  const rounds: ReadonlyArray<Stall.Observation> = [
    { tree: "tree-a", checks: ["typecheck"] },
    { tree: "tree-b", checks: ["lint", "test"] },
    // Order does not matter: these are the same failing checks.
    { tree: "tree-c", checks: ["test", "lint"] },
    { tree: "tree-d", checks: ["lint", "test"] },
    { tree: "tree-e", checks: [] }
  ]
  const lines: Array<string> = []
  let state = Stall.initial
  for (const [index, observation] of rounds.entries()) {
    const { stalled, state: next } = Stall.observe(policy, state, observation)
    state = next
    if (stalled !== undefined) {
      lines.push(`round ${index + 1}: stalled on ${stalled.signal} for ${stalled.rounds} rounds, ${stalled.on}`)
      return lines
    }
    lines.push(`round ${index + 1}: progress`)
  }
  return lines
}

if (import.meta.main) {
  for (const line of [...retrySchedule(), ...stallVerdict()]) {
    process.stdout.write(`${line}\n`)
  }
}
