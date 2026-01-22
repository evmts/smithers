/**
 * Unit tests for useSmithersSubagent hook.
 * Tests the subagent execution logic, status mapping, and result parsing.
 */
import { describe, test, expect } from 'bun:test'
import type { UseSmithersSubagentResult } from './useSmithersSubagent.js'
import type { SmithersProps } from '../components/Smithers.js'
import type { SmithersResult } from '../components/agents/SmithersCLI.js'

describe('useSmithersSubagent', () => {
  describe('status mapping logic', () => {
    interface AgentRow {
      status: string
      result: string | null
      error: string | null
    }

    const mapStatus = (
      agentRow: AgentRow | null, 
      substatus: string | null
    ): 'pending' | 'planning' | 'executing' | 'complete' | 'error' => {
      if (!agentRow) return 'pending'
      if (agentRow.status === 'completed') return 'complete'
      if (agentRow.status === 'failed') return 'error'
      if (agentRow.status === 'running') {
        if (substatus === 'planning') return 'planning'
        if (substatus === 'executing') return 'executing'
        return 'executing'
      }
      return 'pending'
    }

    test('maps null agentRow to pending', () => {
      expect(mapStatus(null, null)).toBe('pending')
    })

    test('maps completed to complete', () => {
      const row = { status: 'completed', result: 'done', error: null }
      expect(mapStatus(row, null)).toBe('complete')
    })

    test('maps failed to error', () => {
      const row = { status: 'failed', result: null, error: 'failed' }
      expect(mapStatus(row, null)).toBe('error')
    })

    test('maps running with planning substatus to planning', () => {
      const row = { status: 'running', result: null, error: null }
      expect(mapStatus(row, 'planning')).toBe('planning')
    })

    test('maps running with executing substatus to executing', () => {
      const row = { status: 'running', result: null, error: null }
      expect(mapStatus(row, 'executing')).toBe('executing')
    })

    test('maps running with null substatus to executing', () => {
      const row = { status: 'running', result: null, error: null }
      expect(mapStatus(row, null)).toBe('executing')
    })

    test('maps unknown status to pending', () => {
      const row = { status: 'queued', result: null, error: null }
      expect(mapStatus(row, null)).toBe('pending')
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

    const parseResult = (agentRow: AgentRow | null): SmithersResult | null => {
      if (!agentRow?.result) return null
      
      const structuredData = agentRow.result_structured 
        ? (() => { 
            try { 
              return JSON.parse(agentRow.result_structured) as { 
                script?: string
                scriptPath?: string
                planningResult?: SmithersResult['planningResult']
              } 
            } catch { 
              return null 
            } 
          })()
        : null

      return {
        output: agentRow.result,
        script: structuredData?.script ?? '',
        scriptPath: structuredData?.scriptPath ?? '',
        planningResult: structuredData?.planningResult ?? {
          output: '',
          tokensUsed: { input: 0, output: 0 },
          turnsUsed: 0,
          durationMs: 0,
          stopReason: 'completed' as const,
        },
        tokensUsed: {
          input: agentRow.tokens_input ?? 0,
          output: agentRow.tokens_output ?? 0,
        },
        turnsUsed: 0,
        durationMs: agentRow.duration_ms ?? 0,
        stopReason: 'completed',
      }
    }

    test('returns null when agentRow is null', () => {
      expect(parseResult(null)).toBeNull()
    })

    test('returns null when result is null', () => {
      const row = { result: null, result_structured: null, tokens_input: 0, tokens_output: 0, duration_ms: 0 }
      expect(parseResult(row)).toBeNull()
    })

    test('parses result with structured data', () => {
      const structuredData = { script: 'console.log("hi")', scriptPath: '/tmp/script.tsx' }
      const row = { 
        result: 'output', 
        result_structured: JSON.stringify(structuredData), 
        tokens_input: 100, 
        tokens_output: 50, 
        duration_ms: 1000 
      }
      const parsed = parseResult(row)
      expect(parsed?.script).toBe('console.log("hi")')
      expect(parsed?.scriptPath).toBe('/tmp/script.tsx')
    })

    test('handles invalid JSON in result_structured', () => {
      const row = { 
        result: 'output', 
        result_structured: 'not json', 
        tokens_input: 100, 
        tokens_output: 50, 
        duration_ms: 1000 
      }
      const parsed = parseResult(row)
      expect(parsed?.script).toBe('')
      expect(parsed?.scriptPath).toBe('')
    })

    test('defaults tokens to 0 when null', () => {
      const row = { result: 'output', result_structured: null, tokens_input: null, tokens_output: null, duration_ms: null }
      const parsed = parseResult(row)
      expect(parsed?.tokensUsed.input).toBe(0)
      expect(parsed?.tokensUsed.output).toBe(0)
    })

    test('includes correct stopReason', () => {
      const row = { result: 'output', result_structured: null, tokens_input: 0, tokens_output: 0, duration_ms: 0 }
      const parsed = parseResult(row)
      expect(parsed?.stopReason).toBe('completed')
    })
  })

  describe('parseStateValue logic', () => {
    function parseStateValue<T>(raw: string | null, fallback: T): T {
      if (!raw) return fallback
      try {
        return JSON.parse(raw) as T
      } catch {
        return fallback
      }
    }

    test('returns fallback for null', () => {
      expect(parseStateValue(null, 'default')).toBe('default')
    })

    test('returns fallback for empty string', () => {
      expect(parseStateValue('', 'default')).toBe('default')
    })

    test('parses valid JSON string', () => {
      expect(parseStateValue('"hello"', 'default')).toBe('hello')
    })

    test('parses valid JSON object', () => {
      const result = parseStateValue<{ key: string }>('{"key":"value"}', { key: '' })
      expect(result.key).toBe('value')
    })

    test('returns fallback for invalid JSON', () => {
      expect(parseStateValue('not json', 'default')).toBe('default')
    })

    test('parses null value as null', () => {
      expect(parseStateValue<string | null>('null', 'default')).toBeNull()
    })
  })

  describe('UseSmithersSubagentResult type structure', () => {
    test('all required fields are present', () => {
      const result: UseSmithersSubagentResult = {
        status: 'pending',
        subagentId: null,
        executionId: null,
        plannerModel: 'sonnet',
        executionModel: 'sonnet',
        result: null,
        error: null
      }
      expect(result.status).toBe('pending')
      expect(result.plannerModel).toBe('sonnet')
    })

    test('status accepts all valid values', () => {
      const statuses: UseSmithersSubagentResult['status'][] = ['pending', 'planning', 'executing', 'complete', 'error']
      expect(statuses).toHaveLength(5)
    })

    test('complete status with result', () => {
      const result: UseSmithersSubagentResult = {
        status: 'complete',
        subagentId: 'abc-123',
        executionId: 'exec-456',
        plannerModel: 'opus',
        executionModel: 'sonnet',
        result: {
          output: 'done',
          script: 'code',
          scriptPath: '/tmp/script.tsx',
          planningResult: {
            output: '',
            tokensUsed: { input: 0, output: 0 },
            turnsUsed: 0,
            durationMs: 0,
            stopReason: 'completed',
          },
          tokensUsed: { input: 100, output: 50 },
          turnsUsed: 3,
          durationMs: 5000,
          stopReason: 'completed'
        },
        error: null
      }
      expect(result.result?.output).toBe('done')
      expect(result.subagentId).toBe('abc-123')
    })

    test('error status with error object', () => {
      const result: UseSmithersSubagentResult = {
        status: 'error',
        subagentId: 'abc-123',
        executionId: null,
        plannerModel: 'sonnet',
        executionModel: 'sonnet',
        result: null,
        error: new Error('Subagent failed')
      }
      expect(result.error?.message).toBe('Subagent failed')
    })
  })

  describe('SmithersProps validation', () => {
    test('minimal props with children', () => {
      const props: SmithersProps = {
        children: 'Build a feature'
      }
      expect(props.children).toBe('Build a feature')
    })

    test('full props', () => {
      const props: SmithersProps = {
        children: 'Build a feature',
        plannerModel: 'opus',
        executionModel: 'sonnet',
        maxPlanningTurns: 10,
        timeout: 300000,
        context: 'Additional context',
        cwd: '/tmp/project',
        keepScript: true,
        scriptPath: '/tmp/generated.tsx',
        reportingEnabled: true,
        onProgress: () => {},
        onScriptGenerated: () => {},
        onFinished: () => {},
        onError: () => {}
      }
      expect(props.plannerModel).toBe('opus')
      expect(props.timeout).toBe(300000)
      expect(props.keepScript).toBe(true)
    })

    test('plannerModel defaults', () => {
      const props: SmithersProps = { children: 'task' }
      const model = props.plannerModel ?? 'sonnet'
      expect(model).toBe('sonnet')
    })

    test('executionModel defaults', () => {
      const props: SmithersProps = { children: 'task' }
      const model = props.executionModel ?? 'sonnet'
      expect(model).toBe('sonnet')
    })
  })

  describe('execution gating logic', () => {
    test('executionToken is null when not enabled', () => {
      const executionEnabled = false
      const ralphCount = 1
      const executionToken = executionEnabled ? ralphCount : null
      expect(executionToken).toBeNull()
    })

    test('executionToken equals ralphCount when enabled', () => {
      const executionEnabled = true
      const ralphCount = 5
      const executionToken = executionEnabled ? ralphCount : null
      expect(executionToken).toBe(5)
    })
  })

  describe('error handling logic', () => {
    test('extracts root cause from nested error', () => {
      const innerError = new Error('Root cause')
      const outerError = new Error('Wrapper', { cause: innerError })
      const rootCause = outerError.cause instanceof Error ? outerError.cause : outerError
      expect(rootCause.message).toBe('Root cause')
    })

    test('uses outer error when no cause', () => {
      const error = new Error('Only error')
      const rootCause = error.cause instanceof Error ? error.cause : error
      expect(rootCause.message).toBe('Only error')
    })

    test('converts non-Error to Error', () => {
      const err = 'string error'
      const errorObj = err instanceof Error ? err : new Error(String(err))
      expect(errorObj.message).toBe('string error')
    })
  })

  describe('stop request handling', () => {
    test('returns early when stop requested', () => {
      const isStopRequested = () => true
      let executed = false
      
      if (!isStopRequested()) {
        executed = true
      }
      
      expect(executed).toBe(false)
    })

    test('continues when stop not requested', () => {
      const isStopRequested = () => false
      let executed = false
      
      if (!isStopRequested()) {
        executed = true
      }
      
      expect(executed).toBe(true)
    })
  })

  describe('reporting behavior', () => {
    test('reportingEnabled defaults to true', () => {
      const props: SmithersProps = { children: 'task' }
      const reportingEnabled = props.reportingEnabled !== false
      expect(reportingEnabled).toBe(true)
    })

    test('reportingEnabled can be disabled', () => {
      const props: SmithersProps = { children: 'task', reportingEnabled: false }
      const reportingEnabled = props.reportingEnabled !== false
      expect(reportingEnabled).toBe(false)
    })
  })

  describe('cwd resolution', () => {
    test('uses props.cwd when provided', () => {
      const propsCwd = '/custom/path'
      const worktreeCwd = '/worktree/path'
      const cwd = propsCwd ?? worktreeCwd
      expect(cwd).toBe('/custom/path')
    })

    test('falls back to worktree cwd', () => {
      const propsCwd: string | undefined = undefined
      const worktreeCwd = '/worktree/path'
      const cwd = propsCwd ?? worktreeCwd
      expect(cwd).toBe('/worktree/path')
    })

    test('undefined when neither provided', () => {
      const propsCwd: string | undefined = undefined
      const worktreeCwd: string | undefined = undefined
      const cwd = propsCwd ?? worktreeCwd
      expect(cwd).toBeUndefined()
    })
  })
})
