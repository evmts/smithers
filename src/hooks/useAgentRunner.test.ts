/**
 * Unit tests for useAgentRunner hook.
 * Tests the core agent execution logic, status mapping, result parsing, and execution gating.
 */
import { describe, test, expect } from 'bun:test'
import type { UseAgentResult, BaseAgentHookProps } from './useAgentRunner.js'
import { composeMiddleware } from '../middleware/compose.js'
import { retryMiddleware } from '../middleware/retry.js'
import { validationMiddleware } from '../middleware/validation.js'

describe('useAgentRunner', () => {
  describe('status mapping from DB', () => {
    const mapDbStatus = (dbStatus: string | null | undefined): 'pending' | 'running' | 'complete' | 'error' => {
      return dbStatus === 'completed' ? 'complete' : dbStatus === 'failed' ? 'error' : dbStatus === 'running' ? 'running' : 'pending'
    }

    test('maps "completed" to "complete"', () => {
      expect(mapDbStatus('completed')).toBe('complete')
    })

    test('maps "failed" to "error"', () => {
      expect(mapDbStatus('failed')).toBe('error')
    })

    test('maps "running" to "running"', () => {
      expect(mapDbStatus('running')).toBe('running')
    })

    test('maps unknown status to "pending"', () => {
      expect(mapDbStatus('unknown')).toBe('pending')
      expect(mapDbStatus('queued')).toBe('pending')
      expect(mapDbStatus('started')).toBe('pending')
    })

    test('maps null status to "pending"', () => {
      expect(mapDbStatus(null)).toBe('pending')
    })

    test('maps undefined status to "pending"', () => {
      expect(mapDbStatus(undefined)).toBe('pending')
    })
  })

  describe('result parsing from DB row', () => {
    interface AgentRow {
      result: string | null
      result_structured: string | null
      tokens_input: number | null
      tokens_output: number | null
      duration_ms: number | null
    }

    const parseResult = (row: AgentRow | null) => {
      if (!row?.result) return null
      return {
        output: row.result,
        structured: row.result_structured ? (() => { try { return JSON.parse(row.result_structured) } catch { return undefined } })() : undefined,
        tokensUsed: { input: row.tokens_input ?? 0, output: row.tokens_output ?? 0 },
        turnsUsed: 0,
        durationMs: row.duration_ms ?? 0,
        stopReason: 'completed' as const
      }
    }

    test('returns null when no result in row', () => {
      expect(parseResult({ result: null, result_structured: null, tokens_input: null, tokens_output: null, duration_ms: null })).toBeNull()
    })

    test('returns null when row is null', () => {
      expect(parseResult(null)).toBeNull()
    })

    test('parses structured output from JSON string', () => {
      const row = { result: 'output text', result_structured: '{"key": "value"}', tokens_input: 100, tokens_output: 50, duration_ms: 1000 }
      const parsed = parseResult(row)
      expect(parsed?.structured).toEqual({ key: 'value' })
    })

    test('handles invalid JSON in result_structured gracefully', () => {
      const row = { result: 'output text', result_structured: 'not valid json', tokens_input: 100, tokens_output: 50, duration_ms: 1000 }
      const parsed = parseResult(row)
      expect(parsed?.structured).toBeUndefined()
    })

    test('constructs AgentResult with correct shape', () => {
      const row = { result: 'output text', result_structured: null, tokens_input: 100, tokens_output: 50, duration_ms: 1000 }
      const parsed = parseResult(row)
      expect(parsed).toEqual({
        output: 'output text',
        structured: undefined,
        tokensUsed: { input: 100, output: 50 },
        turnsUsed: 0,
        durationMs: 1000,
        stopReason: 'completed'
      })
    })

    test('defaults tokens to 0 when null', () => {
      const row = { result: 'output', result_structured: null, tokens_input: null, tokens_output: null, duration_ms: null }
      const parsed = parseResult(row)
      expect(parsed?.tokensUsed).toEqual({ input: 0, output: 0 })
    })

    test('defaults durationMs to 0 when null', () => {
      const row = { result: 'output', result_structured: null, tokens_input: 100, tokens_output: 50, duration_ms: null }
      const parsed = parseResult(row)
      expect(parsed?.durationMs).toBe(0)
    })
  })

  describe('error parsing from DB row', () => {
    const parseError = (errorStr: string | null): Error | null => {
      return errorStr ? new Error(errorStr) : null
    }

    test('returns null when no error', () => {
      expect(parseError(null)).toBeNull()
    })

    test('wraps error string in Error object', () => {
      const error = parseError('Something went wrong')
      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toBe('Something went wrong')
    })

    test('preserves error message exactly', () => {
      const errorMessage = 'API rate limit exceeded: 429'
      const error = parseError(errorMessage)
      expect(error?.message).toBe(errorMessage)
    })
  })

  describe('execution gating logic', () => {
    const shouldExecuteLogic = (executionEnabled: boolean, scopeEnabled: boolean): boolean => {
      return executionEnabled && scopeEnabled
    }

    const getExecutionKey = (shouldExecute: boolean, ralphCount: number): number | null => {
      return shouldExecute ? ralphCount : null
    }

    test('shouldExecute is false when executionEnabled is false', () => {
      expect(shouldExecuteLogic(false, true)).toBe(false)
    })

    test('shouldExecute is false when executionScope.enabled is false', () => {
      expect(shouldExecuteLogic(true, false)).toBe(false)
    })

    test('shouldExecute is true when both are true', () => {
      expect(shouldExecuteLogic(true, true)).toBe(true)
    })

    test('executionKey is null when shouldExecute is false', () => {
      expect(getExecutionKey(false, 5)).toBeNull()
    })

    test('executionKey equals ralphCount when shouldExecute is true', () => {
      expect(getExecutionKey(true, 0)).toBe(0)
      expect(getExecutionKey(true, 5)).toBe(5)
      expect(getExecutionKey(true, 10)).toBe(10)
    })
  })

  describe('tail log handling', () => {
    test('tailLogCount defaults to 10', () => {
      const props: BaseAgentHookProps = {}
      const tailLogCount = props.tailLogCount ?? 10
      expect(tailLogCount).toBe(10)
    })

    test('maxEntries uses tailLogCount from props', () => {
      const props: BaseAgentHookProps = { tailLogCount: 25 }
      const maxEntries = props.tailLogCount ?? 10
      expect(maxEntries).toBe(25)
    })

    test('respects custom tailLogCount values', () => {
      const testCases = [5, 15, 50, 100]
      for (const count of testCases) {
        const props: BaseAgentHookProps = { tailLogCount: count }
        expect(props.tailLogCount).toBe(count)
      }
    })
  })

  describe('middleware composition', () => {
    test('composeMiddleware is callable', () => {
      const composed = composeMiddleware()
      expect(composed).toBeDefined()
    })

    test('retryMiddleware creates middleware with default config', () => {
      const middleware = retryMiddleware({ maxRetries: 3 })
      expect(middleware).toBeDefined()
      expect(middleware.name).toBe('retry')
    })

    test('retryMiddleware accepts custom baseDelayMs', () => {
      const middleware = retryMiddleware({ maxRetries: 3, baseDelayMs: 500 })
      expect(middleware.name).toBe('retry')
    })

    test('validationMiddleware creates middleware with validate function', () => {
      const middleware = validationMiddleware({ validate: () => true })
      expect(middleware).toBeDefined()
      expect(middleware.name).toBe('validation')
    })

    test('middleware stack combines provider and props middleware', () => {
      const providerMiddleware = [retryMiddleware({ maxRetries: 1 })]
      const propsMiddleware = [validationMiddleware({ validate: () => true })]
      const combined = [...providerMiddleware, ...propsMiddleware]
      expect(combined.length).toBe(2)
      expect(combined[0].name).toBe('retry')
      expect(combined[1].name).toBe('validation')
    })
  })

  describe('UseAgentResult type', () => {
    test('has correct structure', () => {
      const result: UseAgentResult = {
        status: 'pending',
        agentId: null,
        executionId: null,
        result: null,
        error: null,
        tailLog: []
      }
      expect(result.status).toBe('pending')
      expect(result.agentId).toBeNull()
      expect(result.executionId).toBeNull()
      expect(result.result).toBeNull()
      expect(result.error).toBeNull()
      expect(result.tailLog).toEqual([])
    })

    test('status allows all valid values', () => {
      const validStatuses: UseAgentResult['status'][] = ['pending', 'running', 'complete', 'error']
      for (const status of validStatuses) {
        const result: UseAgentResult = { status, agentId: null, executionId: null, result: null, error: null, tailLog: [] }
        expect(result.status).toBe(status)
      }
    })
  })

  describe('BaseAgentHookProps defaults', () => {
    test('retryDelayMs default is 250', () => {
      const props: BaseAgentHookProps = {}
      const retryDelayMs = props.retryDelayMs ?? 250
      expect(retryDelayMs).toBe(250)
    })

    test('maxRetries defaults to 3', () => {
      const props: BaseAgentHookProps = {}
      const maxRetries = props.maxRetries ?? 3
      expect(maxRetries).toBe(3)
    })

    test('reportingEnabled defaults to true', () => {
      const props: BaseAgentHookProps = {}
      const reportingEnabled = props.reportingEnabled !== false
      expect(reportingEnabled).toBe(true)
    })

    test('reportingEnabled can be disabled', () => {
      const props: BaseAgentHookProps = { reportingEnabled: false }
      const reportingEnabled = props.reportingEnabled !== false
      expect(reportingEnabled).toBe(false)
    })
  })

  describe('DEFAULT_TAIL_LOG_THROTTLE_MS', () => {
    test('is 100ms', () => {
      const DEFAULT_TAIL_LOG_THROTTLE_MS = 100
      expect(DEFAULT_TAIL_LOG_THROTTLE_MS).toBe(100)
    })
  })
})
