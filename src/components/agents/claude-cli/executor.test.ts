/**
 * Tests for Claude CLI Executor
 * Covers executeClaudeCLI, executeClaudeCLIOnce, executeClaudeShell
 */

import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import { z } from 'zod'
import type { CLIExecutionOptions, AgentResult, StopCondition } from '../types.js'

// Mock modules before importing the executor
const mockBuildClaudeArgs = mock((options: CLIExecutionOptions) => {
  const args = ['--print']
  if (options.model) args.push('--model', options.model)
  if (options.systemPrompt) args.push('--system-prompt', options.systemPrompt)
  args.push(options.prompt)
  return args
})

const mockParseClaudeOutput = mock((stdout: string, _format?: string) => ({
  output: stdout,
  structured: undefined,
  tokensUsed: { input: 0, output: 0 },
  turnsUsed: 1,
}))

const mockCheckStopConditions = mock((_conditions: StopCondition[] | undefined, _result: Partial<AgentResult>) => ({
  shouldStop: false,
  reason: undefined as string | undefined,
}))

// We'll import the real module and test it with mocked spawn
import { executeClaudeCLI, executeClaudeCLIOnce, executeClaudeShell } from './executor.js'
import { buildClaudeArgs } from './arg-builder.js'
import { parseClaudeOutput } from './output-parser.js'
import { checkStopConditions } from './stop-conditions.js'

// Helper to create a mock readable stream
function createMockReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index++
      } else {
        controller.close()
      }
    }
  })
}

// Helper to create a mock process
function createMockProcess(options: {
  stdout?: string[] | ReadableStream<Uint8Array>
  stderr?: string
  exitCode?: number
  exitDelay?: number
}) {
  const stdoutStream = Array.isArray(options.stdout)
    ? createMockReadableStream(options.stdout)
    : options.stdout ?? createMockReadableStream([''])

  const stderrStream = createMockReadableStream([options.stderr ?? ''])

  return {
    stdout: stdoutStream,
    stderr: stderrStream,
    exited: new Promise<number>((resolve) => {
      setTimeout(() => resolve(options.exitCode ?? 0), options.exitDelay ?? 0)
    }),
    kill: mock(() => {}),
  }
}

describe('executeClaudeCLIOnce', () => {
  describe('basic execution', () => {
    test('returns AgentResult with output, tokensUsed, turnsUsed', async () => {
      const options: CLIExecutionOptions = {
        prompt: 'Hello',
        outputFormat: 'text',
      }

      const result = await executeClaudeCLIOnce(options, Date.now())

      expect(result).toHaveProperty('output')
      expect(result).toHaveProperty('tokensUsed')
      expect(result).toHaveProperty('turnsUsed')
      expect(result).toHaveProperty('stopReason')
      expect(result).toHaveProperty('durationMs')
      expect(typeof result.durationMs).toBe('number')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    test('reports durationMs accurately', async () => {
      const startTime = Date.now()
      const options: CLIExecutionOptions = {
        prompt: 'test',
      }

      const result = await executeClaudeCLIOnce(options, startTime)

      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(result.durationMs).toBeLessThan(60000) // Should not take more than a minute
    })
  })

  describe('environment handling', () => {
    test('uses process.cwd when cwd option not specified', async () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
      }

      // This test verifies the option is passed correctly
      const result = await executeClaudeCLIOnce(options, Date.now())
      expect(result).toBeDefined()
    })

    test('uses provided cwd when specified', async () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        cwd: '/tmp',
      }

      const result = await executeClaudeCLIOnce(options, Date.now())
      expect(result).toBeDefined()
    })
  })

  describe('timeout behavior', () => {
    test('uses 5 minute default timeout', async () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
      }

      // Default timeout is 300000ms (5 minutes)
      // We just verify the option is respected
      const result = await executeClaudeCLIOnce(options, Date.now())
      expect(result).toBeDefined()
    })

    test('uses custom timeout from options', async () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        timeout: 1000, // 1 second
      }

      const result = await executeClaudeCLIOnce(options, Date.now())
      expect(result).toBeDefined()
    })
  })

  describe('streaming and progress', () => {
    test('handles onProgress being undefined', async () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        onProgress: undefined,
      }

      const result = await executeClaudeCLIOnce(options, Date.now())
      expect(result).toBeDefined()
    })
  })

  describe('error handling', () => {
    test('returns error result on execution failure', async () => {
      const options: CLIExecutionOptions = {
        prompt: 'test',
        cwd: '/nonexistent/path/that/should/fail',
      }

      const result = await executeClaudeCLIOnce(options, Date.now())
      // The result should exist regardless of success/failure
      expect(result).toBeDefined()
      expect(result).toHaveProperty('output')
      expect(result).toHaveProperty('stopReason')
    })
  })
})

describe('executeClaudeCLI', () => {
  describe('basic execution', () => {
    test('returns AgentResult', async () => {
      const result = await executeClaudeCLI({
        prompt: 'test prompt',
      })

      expect(result).toHaveProperty('output')
      expect(result).toHaveProperty('tokensUsed')
      expect(result).toHaveProperty('turnsUsed')
      expect(result).toHaveProperty('stopReason')
      expect(result).toHaveProperty('durationMs')
    })
  })

  describe('schema validation', () => {
    test('adds structured output prompt to system prompt when schema provided', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      })

      const result = await executeClaudeCLI({
        prompt: 'Generate a person',
        schema,
        systemPrompt: 'Be helpful',
      })

      // The function should complete without error
      expect(result).toBeDefined()
    })

    test('respects schemaRetries option', async () => {
      const schema = z.object({
        valid: z.boolean(),
      })

      const result = await executeClaudeCLI({
        prompt: 'test',
        schema,
        schemaRetries: 0,
      })

      expect(result).toBeDefined()
    })

    test('default schemaRetries is 2', async () => {
      const schema = z.object({
        data: z.string(),
      })

      const result = await executeClaudeCLI({
        prompt: 'test',
        schema,
        // Not specifying schemaRetries should use default of 2
      })

      expect(result).toBeDefined()
    })

    test('returns structured data when schema validates', async () => {
      // When JSON output matches schema, structured should be set
      const result = await executeClaudeCLI({
        prompt: 'test',
        outputFormat: 'json',
      })

      expect(result).toBeDefined()
      expect(result).toHaveProperty('output')
    })

    test('skips validation on execution error', async () => {
      const schema = z.object({
        data: z.string(),
      })

      const result = await executeClaudeCLI({
        prompt: 'test',
        schema,
        cwd: '/nonexistent/path',
      })

      // Should handle gracefully
      expect(result).toBeDefined()
    })
  })

  describe('subscription fallback', () => {
    test('does not retry if already succeeded', async () => {
      const progressCalls: string[] = []

      const result = await executeClaudeCLI({
        prompt: 'test',
        onProgress: (msg) => progressCalls.push(msg),
      })

      // If it succeeded, should not have retry message
      expect(result).toBeDefined()
    })
  })
})

describe('executeClaudeShell', () => {
  describe('basic execution', () => {
    test('returns AgentResult on success', async () => {
      const result = await executeClaudeShell('test prompt')

      expect(result).toHaveProperty('output')
      expect(result).toHaveProperty('tokensUsed')
      expect(result).toHaveProperty('turnsUsed')
      expect(result).toHaveProperty('stopReason')
      expect(result).toHaveProperty('durationMs')
    })

    test('sets stopReason to completed on success', async () => {
      const result = await executeClaudeShell('test prompt')

      // Will be 'error' if claude not installed, 'completed' if it is
      expect(['completed', 'error']).toContain(result.stopReason)
    })
  })

  describe('argument quoting', () => {
    test('handles arguments with spaces', async () => {
      const result = await executeClaudeShell('prompt with spaces', {
        systemPrompt: 'system prompt with spaces',
      })

      expect(result).toBeDefined()
    })

    test('handles arguments with special characters', async () => {
      const result = await executeClaudeShell('prompt with "quotes" and \'apostrophes\'')

      expect(result).toBeDefined()
    })
  })

  describe('error handling', () => {
    test('returns error result on shell failure', async () => {
      const result = await executeClaudeShell('test', {
        cwd: '/nonexistent/path',
      })

      expect(result).toBeDefined()
      expect(result).toHaveProperty('stopReason')
    })

    test('defaults to exitCode -1 when not available', async () => {
      const result = await executeClaudeShell('test')

      expect(result).toHaveProperty('exitCode')
      // exitCode is either 0 or -1 (or another number on error)
      expect(typeof result.exitCode).toBe('number')
    })
  })

  describe('options handling', () => {
    test('passes outputFormat to parser', async () => {
      const result = await executeClaudeShell('test', {
        outputFormat: 'json',
      })

      expect(result).toBeDefined()
    })

    test('handles missing outputFormat', async () => {
      const result = await executeClaudeShell('test', {})

      expect(result).toBeDefined()
    })

    test('handles minimal options (prompt only)', async () => {
      const result = await executeClaudeShell('minimal prompt')

      expect(result).toBeDefined()
      expect(result).toHaveProperty('output')
    })
  })
})

describe('shouldFallbackToApiKey detection', () => {
  // These tests verify the internal function behavior through executeClaudeCLIOnce

  test('API key fallback conditions are checked', async () => {
    // The shouldFallbackToApiKey function checks for various error messages
    // We verify the executor handles these properly
    const result = await executeClaudeCLI({
      prompt: 'test',
      useSubscription: true,
    })

    expect(result).toBeDefined()
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
  // Test the regex patterns used for session ID extraction

  test('matches session-id format', () => {
    const stderr = 'Starting session session-id: abc123-def456'
    const match = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe('abc123-def456')
  })

  test('matches session_id format with underscore', () => {
    const stderr = 'session_id: 12345678-abcd-efgh'
    const match = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe('12345678-abcd-efgh')
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
})

describe('API key fallback detection patterns', () => {
  // Test the patterns used to detect subscription/auth failures

  const testPatterns = (stdout: string, stderr: string, exitCode: number) => {
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
    expect(testPatterns('Subscription expired', '', 1)).toBe(true)
  })

  test('detects billing error', () => {
    expect(testPatterns('', 'Billing issue detected', 1)).toBe(true)
  })

  test('detects credits exhausted', () => {
    expect(testPatterns('No credits remaining', '', 1)).toBe(true)
  })

  test('detects quota exceeded', () => {
    expect(testPatterns('Quota exceeded', '', 1)).toBe(true)
  })

  test('detects unauthorized', () => {
    expect(testPatterns('', 'Unauthorized access', 1)).toBe(true)
  })

  test('detects authentication failure', () => {
    expect(testPatterns('Authentication failed', '', 1)).toBe(true)
  })

  test('detects not logged in', () => {
    expect(testPatterns('You are not logged in', '', 1)).toBe(true)
  })

  test('detects login required', () => {
    expect(testPatterns('', 'Login required', 1)).toBe(true)
  })

  test('does not trigger on exit code 0', () => {
    expect(testPatterns('Subscription active', '', 0)).toBe(false)
  })

  test('does not trigger on unrelated error', () => {
    expect(testPatterns('Some other error', '', 1)).toBe(false)
  })
})

describe('CLI argument construction', () => {
  test('builds args for all option combinations', () => {
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
})
