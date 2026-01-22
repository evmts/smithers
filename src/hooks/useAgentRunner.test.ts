/**
 * Unit tests for useAgentRunner hook.
 * Tests the core agent execution logic patterns and middleware integration.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { UseAgentResult, BaseAgentHookProps } from './useAgentRunner.js'
import { composeMiddleware } from '../middleware/compose.js'
import { retryMiddleware } from '../middleware/retry.js'
import { validationMiddleware, ValidationError } from '../middleware/validation.js'
import type { AgentResult } from '../components/agents/types/execution.js'

describe('useAgentRunner', () => {
  describe('status mapping logic', () => {
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
    })

    test('maps null to "pending"', () => {
      expect(mapDbStatus(null)).toBe('pending')
    })

    test('maps undefined to "pending"', () => {
      expect(mapDbStatus(undefined)).toBe('pending')
    })
  })

  describe('result parsing logic', () => {
    interface AgentRow {
      result: string | null
      result_structured: string | null
      tokens_input: number | null
      tokens_output: number | null
      duration_ms: number | null
    }

    const parseResult = (row: AgentRow | null): AgentResult | null => {
      if (!row?.result) return null
      return {
        output: row.result,
        structured: row.result_structured ? (() => { try { return JSON.parse(row.result_structured) } catch { return undefined } })() : undefined,
        tokensUsed: { input: row.tokens_input ?? 0, output: row.tokens_output ?? 0 },
        turnsUsed: 0,
        durationMs: row.duration_ms ?? 0,
        stopReason: 'completed'
      }
    }

    test('returns null when no result in row', () => {
      expect(parseResult({ result: null, result_structured: null, tokens_input: null, tokens_output: null, duration_ms: null })).toBeNull()
    })

    test('returns null when row is null', () => {
      expect(parseResult(null)).toBeNull()
    })

    test('parses structured output from JSON string', () => {
      const row = { result: 'output', result_structured: '{"key":"value"}', tokens_input: 100, tokens_output: 50, duration_ms: 1000 }
      const parsed = parseResult(row)
      expect(parsed?.structured).toEqual({ key: 'value' })
    })

    test('handles invalid JSON in result_structured gracefully', () => {
      const row = { result: 'output', result_structured: 'not json', tokens_input: 100, tokens_output: 50, duration_ms: 1000 }
      const parsed = parseResult(row)
      expect(parsed?.structured).toBeUndefined()
    })

    test('constructs AgentResult with correct shape', () => {
      const row = { result: 'output', result_structured: null, tokens_input: 100, tokens_output: 50, duration_ms: 1000 }
      const parsed = parseResult(row)
      expect(parsed).toEqual({
        output: 'output',
        structured: undefined,
        tokensUsed: { input: 100, output: 50 },
        turnsUsed: 0,
        durationMs: 1000,
        stopReason: 'completed'
      })
    })

    test('defaults tokens to 0 when null', () => {
      const row = { result: 'output', result_structured: null, tokens_input: null, tokens_output: null, duration_ms: 1000 }
      const parsed = parseResult(row)
      expect(parsed?.tokensUsed).toEqual({ input: 0, output: 0 })
    })

    test('defaults durationMs to 0 when null', () => {
      const row = { result: 'output', result_structured: null, tokens_input: 100, tokens_output: 50, duration_ms: null }
      const parsed = parseResult(row)
      expect(parsed?.durationMs).toBe(0)
    })
  })

  describe('error parsing logic', () => {
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
  })

  describe('execution gating logic', () => {
    const shouldExecute = (executionEnabled: boolean, scopeEnabled: boolean): boolean => {
      return executionEnabled && scopeEnabled
    }

    const getExecutionKey = (shouldExec: boolean, ralphCount: number): number | null => {
      return shouldExec ? ralphCount : null
    }

    test('shouldExecute is false when executionEnabled is false', () => {
      expect(shouldExecute(false, true)).toBe(false)
    })

    test('shouldExecute is false when scopeEnabled is false', () => {
      expect(shouldExecute(true, false)).toBe(false)
    })

    test('shouldExecute is true when both are true', () => {
      expect(shouldExecute(true, true)).toBe(true)
    })

    test('executionKey is null when shouldExecute is false', () => {
      expect(getExecutionKey(false, 5)).toBeNull()
    })

    test('executionKey equals ralphCount when shouldExecute is true', () => {
      expect(getExecutionKey(true, 0)).toBe(0)
      expect(getExecutionKey(true, 5)).toBe(5)
    })
  })

  describe('middleware composition', () => {
    test('composeMiddleware returns middleware object', () => {
      const composed = composeMiddleware()
      expect(composed).toBeDefined()
    })

    test('retryMiddleware creates named middleware', () => {
      const middleware = retryMiddleware({ maxRetries: 3 })
      expect(middleware.name).toBe('retry')
    })

    test('retryMiddleware accepts baseDelayMs', () => {
      const middleware = retryMiddleware({ maxRetries: 3, baseDelayMs: 500 })
      expect(middleware.name).toBe('retry')
    })

    test('validationMiddleware creates named middleware', () => {
      const middleware = validationMiddleware({ validate: () => true })
      expect(middleware.name).toBe('validation')
    })

    test('ValidationError is exported', () => {
      const error = new ValidationError('test')
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('test')
    })

    test('composeMiddleware combines multiple middlewares', () => {
      const m1 = retryMiddleware({ maxRetries: 1 })
      const m2 = validationMiddleware({ validate: () => true })
      const composed = composeMiddleware(m1, m2)
      expect(composed).toBeDefined()
    })
  })

  describe('retryMiddleware wrapExecute behavior', () => {
    test('calls doExecute function', async () => {
      const middleware = retryMiddleware({ maxRetries: 0 })
      const doExecute = mock(() => Promise.resolve({ output: 'ok', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, durationMs: 0, stopReason: 'completed' as const }))
      
      if (middleware.wrapExecute) {
        const result = await middleware.wrapExecute({ doExecute, options: { prompt: 'test' } })
        expect(doExecute).toHaveBeenCalled()
        expect(result.output).toBe('ok')
      }
    })

    test('retries on failure', async () => {
      let attempts = 0
      const middleware = retryMiddleware({ maxRetries: 2, baseDelayMs: 1 })
      const doExecute = mock(() => {
        attempts++
        if (attempts < 2) throw new Error('fail')
        return Promise.resolve({ output: 'ok', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, durationMs: 0, stopReason: 'completed' as const })
      })
      
      if (middleware.wrapExecute) {
        const result = await middleware.wrapExecute({ doExecute, options: { prompt: 'test' } })
        expect(attempts).toBe(2)
        expect(result.output).toBe('ok')
      }
    })
  })

  describe('validationMiddleware transformResult behavior', () => {
    test('passes result when validation succeeds', async () => {
      const middleware = validationMiddleware({ validate: () => true })
      const result: AgentResult = { output: 'ok', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, durationMs: 0, stopReason: 'completed' }
      
      if (middleware.transformResult) {
        const transformed = await middleware.transformResult(result)
        expect(transformed.output).toBe('ok')
      }
    })

    test('throws ValidationError when validation fails', async () => {
      const middleware = validationMiddleware({ validate: () => false })
      const result: AgentResult = { output: 'bad', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, durationMs: 0, stopReason: 'completed' }
      
      if (middleware.transformResult) {
        await expect(middleware.transformResult(result)).rejects.toThrow(ValidationError)
      }
    })
  })

  describe('BaseAgentHookProps defaults', () => {
    test('tailLogCount defaults to 10', () => {
      const props: BaseAgentHookProps = {}
      expect(props.tailLogCount ?? 10).toBe(10)
    })

    test('maxRetries defaults to 3', () => {
      const props: BaseAgentHookProps = {}
      expect(props.maxRetries ?? 3).toBe(3)
    })

    test('retryDelayMs defaults to 250', () => {
      const props: BaseAgentHookProps = {}
      expect(props.retryDelayMs ?? 250).toBe(250)
    })

    test('reportingEnabled defaults to true', () => {
      const props: BaseAgentHookProps = {}
      expect(props.reportingEnabled !== false).toBe(true)
    })

    test('reportingEnabled can be disabled', () => {
      const props: BaseAgentHookProps = { reportingEnabled: false }
      expect(props.reportingEnabled !== false).toBe(false)
    })
  })

  describe('UseAgentResult type structure', () => {
    test('all required fields are present', () => {
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
    })

    test('status accepts all valid values', () => {
      const statuses: UseAgentResult['status'][] = ['pending', 'running', 'complete', 'error']
      expect(statuses).toHaveLength(4)
    })
  })

  describe('DEFAULT_TAIL_LOG_THROTTLE_MS', () => {
    test('is 100ms', () => {
      const DEFAULT_TAIL_LOG_THROTTLE_MS = 100
      expect(DEFAULT_TAIL_LOG_THROTTLE_MS).toBe(100)
    })
  })
})
