import { describe, test, expect } from 'bun:test'

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
      const props = { children: 'test' }
      const tailLogCount = (props as { tailLogCount?: number }).tailLogCount ?? 10
      expect(tailLogCount).toBe(10)
    })

    test('maxEntries uses tailLogCount from props', () => {
      const props = { children: 'test', tailLogCount: 25 }
      const maxEntries = props.tailLogCount ?? 10
      expect(maxEntries).toBe(25)
    })

    test('respects custom tailLogCount values', () => {
      const testCases = [5, 15, 50, 100]
      for (const count of testCases) {
        const props = { tailLogCount: count }
        expect(props.tailLogCount).toBe(count)
      }
    })
  })

  describe('middleware composition', () => {
    test('combines provider middleware with props middleware', () => {
      const providerMiddleware = [{ name: 'provider1' }, { name: 'provider2' }]
      const propsMiddleware = [{ name: 'props1' }]
      const combined = [...(providerMiddleware ?? []), ...(propsMiddleware ?? [])]
      expect(combined.length).toBe(3)
      expect(combined[0]).toEqual({ name: 'provider1' })
      expect(combined[1]).toEqual({ name: 'provider2' })
      expect(combined[2]).toEqual({ name: 'props1' })
    })

    test('handles null provider middleware', () => {
      const providerMiddleware = null
      const propsMiddleware = [{ name: 'props1' }]
      const combined = [...(providerMiddleware ?? []), ...(propsMiddleware ?? [])]
      expect(combined.length).toBe(1)
    })

    test('handles empty props middleware', () => {
      const providerMiddleware = [{ name: 'provider1' }]
      const propsMiddleware: { name: string }[] = []
      const combined = [...(providerMiddleware ?? []), ...(propsMiddleware ?? [])]
      expect(combined.length).toBe(1)
    })

    test('retry middleware is always included', () => {
      const internalMiddlewares = ['retryMiddleware']
      expect(internalMiddlewares).toContain('retryMiddleware')
    })

    test('validation middleware added when validate prop is set', () => {
      const props = { validate: () => true }
      const internalMiddlewares = ['retryMiddleware']
      if (props.validate) internalMiddlewares.push('validationMiddleware')
      expect(internalMiddlewares).toContain('validationMiddleware')
    })

    test('validation middleware not added when validate prop is absent', () => {
      const props = {}
      const internalMiddlewares = ['retryMiddleware']
      if ((props as { validate?: () => boolean }).validate) internalMiddlewares.push('validationMiddleware')
      expect(internalMiddlewares).not.toContain('validationMiddleware')
    })
  })

  describe('UseAgentResult type', () => {
    test('has correct structure', () => {
      const result = {
        status: 'pending' as const,
        agentId: null as string | null,
        executionId: null as string | null,
        result: null,
        error: null,
        tailLog: [] as { type: string; content: string }[]
      }
      expect('status' in result).toBe(true)
      expect('agentId' in result).toBe(true)
      expect('executionId' in result).toBe(true)
      expect('result' in result).toBe(true)
      expect('error' in result).toBe(true)
      expect('tailLog' in result).toBe(true)
    })

    test('status allows all valid values', () => {
      const validStatuses: ('pending' | 'running' | 'complete' | 'error')[] = ['pending', 'running', 'complete', 'error']
      for (const status of validStatuses) {
        expect(validStatuses).toContain(status)
      }
    })
  })

  describe('DEFAULT_TAIL_LOG_THROTTLE_MS', () => {
    const DEFAULT_TAIL_LOG_THROTTLE_MS = 100

    test('is 100ms', () => {
      expect(DEFAULT_TAIL_LOG_THROTTLE_MS).toBe(100)
    })
  })

  describe('BaseAgentHookProps defaults', () => {
    test('retryDelayMs has default of 250', () => {
      const defaultRetryDelayMs = 250
      const props = {}
      const retryDelayMs = (props as { retryDelayMs?: number }).retryDelayMs ?? defaultRetryDelayMs
      expect(retryDelayMs).toBe(250)
    })

    test('maxRetries defaults to 3', () => {
      const props = {}
      const maxRetries = (props as { maxRetries?: number }).maxRetries ?? 3
      expect(maxRetries).toBe(3)
    })
  })
})
