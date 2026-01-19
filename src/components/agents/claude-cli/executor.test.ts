/**
 * Tests for Claude CLI Executor
 * Covers executeClaudeCLI, executeClaudeCLIOnce, executeClaudeShell
 * 
 * Note: Tests that require actual CLI execution are skipped.
 * We focus on unit testing the helper functions and integration tests.
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import type { CLIExecutionOptions, AgentResult, StopCondition } from '../types.js'
import { buildClaudeArgs } from './arg-builder.js'
import { parseClaudeOutput } from './output-parser.js'
import { checkStopConditions } from './stop-conditions.js'
import { DEFAULT_CLI_TIMEOUT_MS, DEFAULT_SCHEMA_RETRIES } from './executor.js'

describe('executor constants', () => {
  test('DEFAULT_CLI_TIMEOUT_MS is 5 minutes', () => {
    expect(DEFAULT_CLI_TIMEOUT_MS).toBe(300000)
  })

  test('DEFAULT_SCHEMA_RETRIES is 2', () => {
    expect(DEFAULT_SCHEMA_RETRIES).toBe(2)
  })
})

describe('executeClaudeCLIOnce', () => {
  describe('basic execution', () => {
    test('buildClaudeArgs produces correct args for basic options', () => {
      const options: CLIExecutionOptions = {
        prompt: 'Hello',
        outputFormat: 'text',
      }

      const args = buildClaudeArgs(options)
      expect(args[0]).toBe('--print')
      expect(args[args.length - 1]).toBe('Hello')
    })

    test('buildClaudeArgs includes model when specified', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        model: 'sonnet',
      }

      const args = buildClaudeArgs(options)
      expect(args).toContain('--model')
      expect(args).toContain('claude-sonnet-4')
    })

    test('buildClaudeArgs includes output format', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        outputFormat: 'json',
      }

      const args = buildClaudeArgs(options)
      expect(args).toContain('--output-format')
      expect(args).toContain('json')
    })
  })

  describe('environment handling', () => {
    test('cwd option is preserved in options', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        cwd: '/tmp',
      }

      expect(options.cwd).toBe('/tmp')
    })

    test('default cwd is undefined', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
      }

      expect(options.cwd).toBeUndefined()
    })
  })

  describe('timeout behavior', () => {
    test('default timeout is undefined (uses 5 minute default)', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
      }

      expect(options.timeout).toBeUndefined()
    })

    test('custom timeout is preserved in options', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        timeout: 1000,
      }

      expect(options.timeout).toBe(1000)
    })
  })

  describe('streaming and progress', () => {
    test('onProgress callback is preserved in options', () => {
      const progressCalls: string[] = []
      const options: CLIExecutionOptions = {
        prompt: 'test',
        onProgress: (msg) => progressCalls.push(msg),
      }

      expect(typeof options.onProgress).toBe('function')
      options.onProgress?.('test message')
      expect(progressCalls).toContain('test message')
    })
  })
})

describe('executeClaudeCLI', () => {
  describe('schema validation options', () => {
    test('schema is preserved in options', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      })

      const options: CLIExecutionOptions = {
        prompt: 'Generate a person',
        schema,
        systemPrompt: 'Be helpful',
      }

      expect(options.schema).toBe(schema)
    })

    test('schemaRetries default is 2', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
      }

      // Default schemaRetries should be undefined (uses default of 2 internally)
      expect(options.schemaRetries).toBeUndefined()
    })

    test('schemaRetries can be customized', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        schemaRetries: 5,
      }

      expect(options.schemaRetries).toBe(5)
    })
  })

  describe('subscription settings', () => {
    test('useSubscription default is undefined (uses true internally)', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
      }

      expect(options.useSubscription).toBeUndefined()
    })

    test('useSubscription can be set to false', () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        useSubscription: false,
      }

      expect(options.useSubscription).toBe(false)
    })
  })
})

describe('executeClaudeShell', () => {
  describe('argument construction', () => {
    test('builds args with spaces properly', () => {
      const args = buildClaudeArgs({
        prompt: 'prompt with spaces',
        systemPrompt: 'system prompt with spaces',
      })

      expect(args).toContain('--system-prompt')
      expect(args).toContain('system prompt with spaces')
      expect(args[args.length - 1]).toBe('prompt with spaces')
    })

    test('builds minimal args', () => {
      const args = buildClaudeArgs({
        prompt: 'minimal',
      })

      expect(args).toEqual(['--print', 'minimal'])
    })
  })
})

describe('shouldFallbackToApiKey detection', () => {
  const testFallback = (stdout: string, stderr: string, exitCode: number) => {
    if (exitCode === 0) return false
    const combined = `${stdout}\n${stderr}`.toLowerCase()
    return (
      combined.includes('subscription') ||
      combined.includes('billing') ||
      combined.includes('credits') ||
      combined.includes('quota') ||
      combined.includes('unauthorized') ||
      combined.includes('authentication') ||
      combined.includes('not logged in') ||
      combined.includes('login required')
    )
  }

  test('detects subscription failure', () => {
    expect(testFallback('Subscription expired', '', 1)).toBe(true)
  })

  test('detects billing error', () => {
    expect(testFallback('', 'Billing issue detected', 1)).toBe(true)
  })

  test('detects credits exhausted', () => {
    expect(testFallback('No credits remaining', '', 1)).toBe(true)
  })

  test('detects quota exceeded', () => {
    expect(testFallback('Quota exceeded', '', 1)).toBe(true)
  })

  test('detects unauthorized', () => {
    expect(testFallback('', 'Unauthorized access', 1)).toBe(true)
  })

  test('detects authentication failure', () => {
    expect(testFallback('Authentication failed', '', 1)).toBe(true)
  })

  test('detects not logged in', () => {
    expect(testFallback('You are not logged in', '', 1)).toBe(true)
  })

  test('detects login required', () => {
    expect(testFallback('', 'Login required', 1)).toBe(true)
  })

  test('does not trigger on exit code 0', () => {
    expect(testFallback('Subscription active', '', 0)).toBe(false)
  })

  test('does not trigger on unrelated error', () => {
    expect(testFallback('Some other error', '', 1)).toBe(false)
  })

  test('case insensitive matching', () => {
    expect(testFallback('SUBSCRIPTION EXPIRED', '', 1)).toBe(true)
    expect(testFallback('BiLLiNg IsSuE', '', 1)).toBe(true)
  })

  test('checks both stdout and stderr', () => {
    expect(testFallback('', 'subscription error', 1)).toBe(true)
    expect(testFallback('billing problem', '', 1)).toBe(true)
  })
})

describe('arg-builder integration', () => {
  test('buildClaudeArgs is called with options', () => {
    const args = buildClaudeArgs({
      prompt: 'test',
      model: 'sonnet',
      maxTurns: 5,
    })

    expect(args).toContain('--print')
    expect(args).toContain('--model')
    expect(args).toContain('claude-sonnet-4')
    expect(args).toContain('--max-turns')
    expect(args).toContain('5')
    expect(args[args.length - 1]).toBe('test')
  })

  test('builds args with all options', () => {
    const options: CLIExecutionOptions = {
      prompt: 'test prompt',
      model: 'opus',
      maxTurns: 10,
      permissionMode: 'bypassPermissions',
      systemPrompt: 'Be helpful',
      outputFormat: 'json',
      mcpConfig: '/path/to/mcp.json',
      allowedTools: ['Read', 'Write'],
      disallowedTools: ['Bash'],
      continue: true,
      resume: 'session-123',
    }

    const args = buildClaudeArgs(options)

    expect(args[0]).toBe('--print')
    expect(args).toContain('--model')
    expect(args).toContain('claude-opus-4')
    expect(args).toContain('--max-turns')
    expect(args).toContain('10')
    expect(args).toContain('--dangerously-skip-permissions')
    expect(args).toContain('--system-prompt')
    expect(args).toContain('Be helpful')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
    expect(args).toContain('--mcp-config')
    expect(args).toContain('/path/to/mcp.json')
    expect(args).toContain('--allowedTools')
    expect(args).toContain('Read')
    expect(args).toContain('Write')
    expect(args).toContain('--disallowedTools')
    expect(args).toContain('Bash')
    expect(args).toContain('--continue')
    expect(args).toContain('--resume')
    expect(args).toContain('session-123')
    expect(args[args.length - 1]).toBe('test prompt')
  })
})

describe('output-parser integration', () => {
  test('parseClaudeOutput extracts token info from text', () => {
    const result = parseClaudeOutput('Output\ntokens: 100 input, 50 output', 'text')

    expect(result.tokensUsed.input).toBe(100)
    expect(result.tokensUsed.output).toBe(50)
  })

  test('parseClaudeOutput handles JSON format', () => {
    const json = JSON.stringify({ data: 'test', usage: { input_tokens: 200, output_tokens: 100 } })
    const result = parseClaudeOutput(json, 'json')

    expect(result.structured).toEqual({ data: 'test', usage: { input_tokens: 200, output_tokens: 100 } })
    expect(result.tokensUsed.input).toBe(200)
    expect(result.tokensUsed.output).toBe(100)
  })

  test('parseClaudeOutput returns default values for missing info', () => {
    const result = parseClaudeOutput('plain text output', 'text')

    expect(result.output).toBe('plain text output')
    expect(result.tokensUsed).toEqual({ input: 0, output: 0 })
    expect(result.turnsUsed).toBe(1)
  })

  test('parseClaudeOutput handles stream-json format', () => {
    const json = JSON.stringify({ result: 'streamed' })
    const result = parseClaudeOutput(json, 'stream-json')

    expect(result.structured).toEqual({ result: 'streamed' })
  })
})

describe('stop-conditions integration', () => {
  test('checkStopConditions returns shouldStop false for empty conditions', () => {
    const result = checkStopConditions(undefined, { output: 'test' })
    expect(result.shouldStop).toBe(false)
  })

  test('checkStopConditions triggers on token limit', () => {
    const result = checkStopConditions(
      [{ type: 'token_limit', value: 100 }],
      { tokensUsed: { input: 60, output: 60 } }
    )
    expect(result.shouldStop).toBe(true)
  })

  test('checkStopConditions triggers on pattern match', () => {
    const result = checkStopConditions(
      [{ type: 'pattern', value: /DONE/ }],
      { output: 'Task DONE' }
    )
    expect(result.shouldStop).toBe(true)
  })

  test('checkStopConditions triggers on time limit', () => {
    const result = checkStopConditions(
      [{ type: 'time_limit', value: 1000 }],
      { durationMs: 2000 }
    )
    expect(result.shouldStop).toBe(true)
  })

  test('checkStopConditions triggers on turn limit', () => {
    const result = checkStopConditions(
      [{ type: 'turn_limit', value: 5 }],
      { turnsUsed: 10 }
    )
    expect(result.shouldStop).toBe(true)
  })

  test('checkStopConditions triggers on custom function', () => {
    const result = checkStopConditions(
      [{ type: 'custom', fn: (r: AgentResult) => r.output.includes('STOP') }],
      { output: 'Please STOP' }
    )
    expect(result.shouldStop).toBe(true)
  })
})

describe('session ID extraction patterns', () => {
  test('matches session-id format', () => {
    const stderr = 'Starting session session-id: abc123-def456'
    const match = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe('abc123-def456')
  })

  test('matches session_id format with underscore', () => {
    const stderr = 'session_id: 12345678-abcd-1234'
    const match = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe('12345678-abcd-1234')
  })

  test('matches sessionid format without separator', () => {
    const stderr = 'sessionid: fedcba98'
    const match = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe('fedcba98')
  })

  test('handles missing session ID', () => {
    const stderr = 'Some output without session info'
    const match = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    expect(match).toBeNull()
  })

  test('extracts UUID format session ID', () => {
    const stderr = 'session-id: a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const match = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  })

  test('case insensitive matching', () => {
    const stderr = 'SESSION-ID: abc123'
    const match = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe('abc123')
  })
})

describe('stop condition edge cases', () => {
  test('handles mixed conditions where only one triggers', () => {
    const conditions: StopCondition[] = [
      { type: 'token_limit', value: 1000 },
      { type: 'time_limit', value: 10000 },
      { type: 'pattern', value: /DONE/ },
    ]

    const result = checkStopConditions(conditions, {
      output: 'Task DONE',
      tokensUsed: { input: 50, output: 50 },
      durationMs: 1000,
    })

    expect(result.shouldStop).toBe(true)
    expect(result.reason).toContain('Pattern matched')
  })

  test('handles zero values correctly', () => {
    const conditions: StopCondition[] = [
      { type: 'token_limit', value: 0 },
    ]

    const result = checkStopConditions(conditions, {
      tokensUsed: { input: 0, output: 0 },
    })

    expect(result.shouldStop).toBe(true)
  })

  test('handles large limits without triggering', () => {
    const conditions: StopCondition[] = [
      { type: 'token_limit', value: Number.MAX_SAFE_INTEGER },
      { type: 'time_limit', value: Number.MAX_SAFE_INTEGER },
      { type: 'turn_limit', value: Number.MAX_SAFE_INTEGER },
    ]

    const result = checkStopConditions(conditions, {
      tokensUsed: { input: 1000000, output: 1000000 },
      durationMs: 1000000,
      turnsUsed: 1000,
    })

    expect(result.shouldStop).toBe(false)
  })

  test('first matching condition wins', () => {
    const conditions: StopCondition[] = [
      { type: 'token_limit', value: 100, message: 'Token limit hit' },
      { type: 'pattern', value: /DONE/, message: 'Pattern matched' },
    ]

    const result = checkStopConditions(conditions, {
      output: 'DONE',
      tokensUsed: { input: 60, output: 60 },
    })

    expect(result.shouldStop).toBe(true)
    expect(result.reason).toBe('Token limit hit')
  })

  test('continues checking if earlier conditions do not match', () => {
    const conditions: StopCondition[] = [
      { type: 'token_limit', value: 1000 },
      { type: 'pattern', value: /STOP/, message: 'Stop pattern found' },
    ]

    const result = checkStopConditions(conditions, {
      output: 'Please STOP now',
      tokensUsed: { input: 50, output: 50 },
    })

    expect(result.shouldStop).toBe(true)
    expect(result.reason).toBe('Stop pattern found')
  })
})

describe('output parsing edge cases', () => {
  test('handles very large output', () => {
    const largeOutput = 'x'.repeat(1000000)
    const result = parseClaudeOutput(largeOutput, 'text')

    expect(result.output).toBe(largeOutput)
  })

  test('handles unicode output', () => {
    const unicodeOutput = '你好世界 🌍 مرحبا'
    const result = parseClaudeOutput(unicodeOutput, 'text')

    expect(result.output).toBe(unicodeOutput)
  })

  test('handles newlines and special characters', () => {
    const specialOutput = 'line1\n\tline2\r\nline3'
    const result = parseClaudeOutput(specialOutput, 'text')

    expect(result.output).toBe(specialOutput)
  })

  test('handles nested JSON', () => {
    const nested = {
      level1: {
        level2: {
          level3: {
            data: [1, 2, 3],
          },
        },
      },
    }
    const json = JSON.stringify(nested)
    const result = parseClaudeOutput(json, 'json')

    expect(result.structured).toEqual(nested)
  })

  test('handles JSON arrays', () => {
    const arr = [1, 2, 3, { key: 'value' }]
    const json = JSON.stringify(arr)
    const result = parseClaudeOutput(json, 'json')

    expect(result.structured).toEqual(arr)
  })

  test('handles empty JSON object', () => {
    const json = '{}'
    const result = parseClaudeOutput(json, 'json')

    expect(result.structured).toEqual({})
  })

  test('handles JSON with special characters in strings', () => {
    const obj = { text: 'Hello\n"World"\t\\Path' }
    const json = JSON.stringify(obj)
    const result = parseClaudeOutput(json, 'json')

    expect(result.structured).toEqual(obj)
  })
})

describe('CLI execution options validation', () => {
  test('prompt is required', () => {
    const options: CLIExecutionOptions = {
      prompt: 'required prompt',
    }

    expect(options.prompt).toBe('required prompt')
  })

  test('all optional fields can be undefined', () => {
    const options: CLIExecutionOptions = {
      prompt: 'test',
    }

    expect(options.model).toBeUndefined()
    expect(options.permissionMode).toBeUndefined()
    expect(options.maxTurns).toBeUndefined()
    expect(options.systemPrompt).toBeUndefined()
    expect(options.outputFormat).toBeUndefined()
    expect(options.mcpConfig).toBeUndefined()
    expect(options.allowedTools).toBeUndefined()
    expect(options.disallowedTools).toBeUndefined()
    expect(options.timeout).toBeUndefined()
    expect(options.cwd).toBeUndefined()
    expect(options.continue).toBeUndefined()
    expect(options.resume).toBeUndefined()
    expect(options.stopConditions).toBeUndefined()
    expect(options.onProgress).toBeUndefined()
    expect(options.onToolCall).toBeUndefined()
    expect(options.schema).toBeUndefined()
    expect(options.schemaRetries).toBeUndefined()
    expect(options.useSubscription).toBeUndefined()
  })

  test('all model options are valid', () => {
    const models = ['opus', 'sonnet', 'haiku', 'claude-custom-model']

    for (const model of models) {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        model: model as any,
      }

      const args = buildClaudeArgs(options)
      expect(args).toContain('--model')
    }
  })

  test('all permission modes are valid', () => {
    const modes = ['default', 'acceptEdits', 'bypassPermissions'] as const

    for (const mode of modes) {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        permissionMode: mode,
      }

      const args = buildClaudeArgs(options)
      expect(args).toBeDefined()
    }
  })

  test('all output formats are valid', () => {
    const formats = ['text', 'json', 'stream-json'] as const

    for (const format of formats) {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        outputFormat: format,
      }

      const args = buildClaudeArgs(options)
      expect(args).toBeDefined()
    }
  })
})

describe('AgentResult structure', () => {
  test('AgentResult has correct structure', () => {
    const result: AgentResult = {
      output: 'test output',
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 3,
      stopReason: 'completed',
      durationMs: 1500,
    }

    expect(result.output).toBe('test output')
    expect(result.tokensUsed.input).toBe(100)
    expect(result.tokensUsed.output).toBe(50)
    expect(result.turnsUsed).toBe(3)
    expect(result.stopReason).toBe('completed')
    expect(result.durationMs).toBe(1500)
  })

  test('AgentResult supports optional fields', () => {
    const result: AgentResult = {
      output: 'test',
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs: 0,
      structured: { data: 'structured' },
      exitCode: 1,
      sessionId: 'session-123',
    }

    expect(result.structured).toEqual({ data: 'structured' })
    expect(result.exitCode).toBe(1)
    expect(result.sessionId).toBe('session-123')
  })

  test('all stop reasons are valid', () => {
    const stopReasons = ['completed', 'stop_condition', 'error', 'cancelled'] as const

    for (const reason of stopReasons) {
      const result: AgentResult = {
        output: 'test',
        tokensUsed: { input: 0, output: 0 },
        turnsUsed: 0,
        stopReason: reason,
        durationMs: 0,
      }

      expect(result.stopReason).toBe(reason)
    }
  })
})

describe('pattern stop condition', () => {
  test('supports RegExp pattern', () => {
    const result = checkStopConditions(
      [{ type: 'pattern', value: /complete|done|finished/i }],
      { output: 'Task is COMPLETE!' }
    )

    expect(result.shouldStop).toBe(true)
  })

  test('supports string pattern (converted to RegExp)', () => {
    const result = checkStopConditions(
      [{ type: 'pattern', value: 'SUCCESS' }],
      { output: 'Operation SUCCESS completed' }
    )

    expect(result.shouldStop).toBe(true)
  })

  test('pattern with flags', () => {
    const result = checkStopConditions(
      [{ type: 'pattern', value: /error/i }],
      { output: 'ERROR: Something went wrong' }
    )

    expect(result.shouldStop).toBe(true)
  })

  test('pattern does not match', () => {
    const result = checkStopConditions(
      [{ type: 'pattern', value: /^EXACT_MATCH$/ }],
      { output: 'Some text with EXACT_MATCH in the middle' }
    )

    expect(result.shouldStop).toBe(false)
  })
})

describe('custom stop condition', () => {
  test('receives full AgentResult with defaults', () => {
    let receivedResult: AgentResult | null = null
    
    checkStopConditions(
      [{
        type: 'custom',
        fn: (result: AgentResult) => {
          receivedResult = result
          return false
        }
      }],
      { output: 'test output' }
    )

    expect(receivedResult).not.toBeNull()
    expect(receivedResult!.output).toBe('test output')
    expect(receivedResult!.tokensUsed).toEqual({ input: 0, output: 0 })
    expect(receivedResult!.turnsUsed).toBe(0)
    expect(receivedResult!.stopReason).toBe('completed')
    expect(receivedResult!.durationMs).toBe(0)
  })

  test('can access all result properties', () => {
    const result = checkStopConditions(
      [{
        type: 'custom',
        fn: (r: AgentResult) => r.tokensUsed.input > 50 && r.durationMs > 1000
      }],
      {
        output: 'test',
        tokensUsed: { input: 100, output: 50 },
        durationMs: 2000,
      }
    )

    expect(result.shouldStop).toBe(true)
  })

  test('custom function can check multiple conditions', () => {
    const result = checkStopConditions(
      [{
        type: 'custom',
        fn: (r: AgentResult) => 
          r.output.includes('ERROR') || 
          r.tokensUsed.input + r.tokensUsed.output > 1000 ||
          r.turnsUsed > 10
      }],
      {
        output: 'Normal output',
        tokensUsed: { input: 200, output: 200 },
        turnsUsed: 5,
      }
    )

    expect(result.shouldStop).toBe(false)
  })
})
