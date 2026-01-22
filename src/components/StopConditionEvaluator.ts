import type { SmithersDB } from '../db/index.js'
import { makeStateKey } from '../utils/scope.js'

export interface GlobalStopCondition {
  type: 'total_tokens' | 'total_agents' | 'total_time' | 'report_severity' | 'ci_failure' | 'custom'
  value?: number | string
  fn?: (context: OrchestrationContext) => boolean | Promise<boolean>
  message?: string
}

export interface OrchestrationContext {
  executionId: string
  totalTokens: number
  totalAgents: number
  totalToolCalls: number
  elapsedTimeMs: number
}

export interface OrchestrationResult {
  executionId: string
  status: 'completed' | 'stopped' | 'failed' | 'cancelled'
  totalAgents: number
  totalToolCalls: number
  totalTokens: number
  durationMs: number
}

type StopEvaluatorContext = {
  ctx: OrchestrationContext
  condition: GlobalStopCondition
  db: SmithersDB
  executionId: string
}

type StopEvaluatorResult = { shouldStop: boolean; message: string }

export const STOP_EVALUATORS: Record<GlobalStopCondition['type'], (args: StopEvaluatorContext) => Promise<StopEvaluatorResult>> = {
  total_tokens: async ({ ctx, condition }) => ({
    shouldStop: typeof condition.value === 'number' && ctx.totalTokens >= condition.value,
    message: condition.message ?? `Token limit ${condition.value} exceeded`,
  }),
  total_agents: async ({ ctx, condition }) => ({
    shouldStop: typeof condition.value === 'number' && ctx.totalAgents >= condition.value,
    message: condition.message ?? `Agent limit ${condition.value} exceeded`,
  }),
  total_time: async ({ ctx, condition }) => ({
    shouldStop: typeof condition.value === 'number' && ctx.elapsedTimeMs >= condition.value,
    message: condition.message ?? `Time limit ${condition.value}ms exceeded`,
  }),
  report_severity: async ({ db, condition }) => {
    const criticalReports = await db.vcs.getCriticalReports()
    return {
      shouldStop: criticalReports.length > 0,
      message: condition.message ?? `Critical report(s) found: ${criticalReports.length}`,
    }
  },
  ci_failure: async ({ db, executionId, condition }) => {
    const ciFailureKey = makeStateKey(executionId, 'hook', 'lastCIFailure')
    const ciFailure =
      await db.state.get<{ message?: string }>(ciFailureKey) ??
      await db.state.get<{ message?: string }>('last_ci_failure')
    return {
      shouldStop: ciFailure !== null,
      message: condition.message ?? `CI failure detected: ${ciFailure?.message ?? 'unknown'}`,
    }
  },
  custom: async ({ ctx, condition }) => ({
    shouldStop: condition.fn ? await condition.fn(ctx) : false,
    message: condition.message ?? 'Custom stop condition met',
  }),
}

export type { StopEvaluatorContext, StopEvaluatorResult }
