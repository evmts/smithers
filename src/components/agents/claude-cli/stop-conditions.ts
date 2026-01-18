// Claude CLI Stop Condition Checker
// Checks if execution should stop based on configured conditions

import type { StopCondition, AgentResult } from '../types.js'

/**
 * Check if any stop condition is met
 */
export function checkStopConditions(
  conditions: StopCondition[] | undefined,
  partialResult: Partial<AgentResult>
): { shouldStop: boolean; reason?: string } {
  if (!conditions || conditions.length === 0) {
    return { shouldStop: false }
  }

  for (const condition of conditions) {
    switch (condition.type) {
      case 'token_limit': {
        const totalTokens =
          (partialResult.tokensUsed?.input ?? 0) +
          (partialResult.tokensUsed?.output ?? 0)
        if (typeof condition.value === 'number' && totalTokens >= condition.value) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Token limit ${condition.value} exceeded`,
          }
        }
        break
      }

      case 'time_limit': {
        if (
          typeof condition.value === 'number' &&
          (partialResult.durationMs ?? 0) >= condition.value
        ) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Time limit ${condition.value}ms exceeded`,
          }
        }
        break
      }

      case 'turn_limit': {
        if (
          typeof condition.value === 'number' &&
          (partialResult.turnsUsed ?? 0) >= condition.value
        ) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Turn limit ${condition.value} exceeded`,
          }
        }
        break
      }

      case 'pattern': {
        const pattern =
          condition.value instanceof RegExp
            ? condition.value
            : typeof condition.value === 'string'
              ? new RegExp(condition.value)
              : null
        if (pattern && partialResult.output && pattern.test(partialResult.output)) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Pattern matched: ${condition.value}`,
          }
        }
        break
      }

      case 'custom': {
        if (condition.fn && partialResult.output !== undefined) {
          const result: AgentResult = {
            output: partialResult.output ?? '',
            tokensUsed: partialResult.tokensUsed ?? { input: 0, output: 0 },
            turnsUsed: partialResult.turnsUsed ?? 0,
            stopReason: 'completed',
            durationMs: partialResult.durationMs ?? 0,
          }
          if (condition.fn(result)) {
            return {
              shouldStop: true,
              reason: condition.message ?? 'Custom stop condition met',
            }
          }
        }
        break
      }
    }
  }

  return { shouldStop: false }
}
