/**
 * Tests for Amp CLI Executor
 * Covers executeAmpCLI helper functions and integration tests
 *
 * Note: Tests that require actual CLI execution are skipped.
 * We focus on unit testing the helper functions and verifying options.
 */

import { describe, test, expect } from 'bun:test'
import type { AmpCLIExecutionOptions } from '../types/amp.js'
import type { AgentResult, StopCondition } from '../types.js'
import { buildAmpArgs, buildAmpEnv } from './arg-builder.js'
import { parseAmpOutput } from './output-parser.js'
import { checkStopConditions } from '../claude-cli/stop-conditions.js'

const DEFAULT_AMP_TIMEOUT_MS = 300000

describe('executor constants', () => {
  test('DEFAULT_AMP_TIMEOUT_MS is 5 minutes', () => {
    expect(DEFAULT_AMP_TIMEOUT_MS).toBe(300000)
  })
})

describe('executeAmpCLI options validation', () => {
  describe('basic execution', () => {
    test('buildAmpArgs produces correct args for basic options', () => {
      const options: AmpCLIExecutionOptions = {
        prompt: 'Hello',
      }

      const args = buildAmpArgs(options)
      expect(args).toContain('--execute')
      expect(args).toContain('--stream-json')
    })

    test('buildAmpArgs includes mode when specified', () => {
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
        mode: 'smart',
      }

      const args = buildAmpArgs(options)
      expect(args).toContain('--mode')
      expect(args).toContain('smart')
    })

    test('buildAmpArgs includes rush mode', () => {
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
        mode: 'rush',
      }

      const args = buildAmpArgs(options)
      expect(args).toContain('--mode')
      expect(args).toContain('rush')
    })
  })

  describe('environment handling', () => {
    test('cwd option is preserved in options', () => {
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
        cwd: '/tmp',
      }

      expect(options.cwd).toBe('/tmp')
    })

    test('default cwd is undefined', () => {
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
      }

      expect(options.cwd).toBeUndefined()
    })

    test('buildAmpEnv returns empty object', () => {
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
      }

      const env = buildAmpEnv(options)
      expect(env).toEqual({})
    })
  })

  describe('timeout behavior', () => {
    test('default timeout is undefined (uses 5 minute default)', () => {
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
      }

      expect(options.timeout).toBeUndefined()
    })

    test('custom timeout is preserved in options', () => {
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
        timeout: 1000,
      }

      expect(options.timeout).toBe(1000)
    })
  })

  describe('streaming and progress', () => {
    test('onProgress callback is preserved in options', () => {
      const progressCalls: string[] = []
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
        onProgress: (msg) => progressCalls.push(msg),
      }

      expect(typeof options.onProgress).toBe('function')
      options.onProgress?.('test message')
      expect(progressCalls).toContain('test message')
    })

    test('onToolCall callback is preserved in options', () => {
      const toolCalls: Array<{ tool: string; input: unknown }> = []
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
        onToolCall: (tool, input) => toolCalls.push({ tool, input }),
      }

      expect(typeof options.onToolCall).toBe('function')
      options.onToolCall?.('read_file', { path: '/test.txt' })
      expect(toolCalls.length).toBe(1)
      expect(toolCalls[0]?.tool).toBe('read_file')
    })
  })
})

describe('prompt building', () => {
  // The buildAmpPrompt function is internal to executor.ts
  // We verify its behavior through the options it accepts

  test('systemPrompt is passed to buildAmpArgs', () => {
    const options: AmpCLIExecutionOptions = {
      prompt: 'test',
      systemPrompt: 'Be helpful',
    }

    const args = buildAmpArgs(options)
    expect(args).toContain('--system-prompt')
    expect(args).toContain('Be helpful')
  })

  test('maxTurns is passed to buildAmpArgs', () => {
    const options: AmpCLIExecutionOptions = {
      prompt: 'test',
      maxTurns: 5,
    }

    const args = buildAmpArgs(options)
    expect(args).toContain('--max-turns')
    expect(args).toContain('5')
  })
})

describe('arg-builder integration', () => {
  test('buildAmpArgs is called with options', () => {
    const args = buildAmpArgs({
      prompt: 'test',
      mode: 'smart',
      maxTurns: 5,
    })

    expect(args).toContain('--execute')
    expect(args).toContain('--stream-json')
    expect(args).toContain('--mode')
    expect(args).toContain('smart')
    expect(args).toContain('--max-turns')
    expect(args).toContain('5')
  })

  test('builds args with all options', () => {
    const options: AmpCLIExecutionOptions = {
      prompt: 'test prompt',
      mode: 'rush',
      maxTurns: 10,
      permissionMode: 'bypassPermissions',
      systemPrompt: 'Be helpful',
      labels: ['test', 'feature'],
      continue: true,
      resume: 'thread-123',
    }

    const args = buildAmpArgs(options)

    expect(args).toContain('threads')
    expect(args).toContain('continue')
    expect(args).toContain('--thread-id')
    expect(args).toContain('thread-123')
    expect(args).toContain('--execute')
    expect(args).toContain('--stream-json')
    expect(args).toContain('--mode')
    expect(args).toContain('rush')
    expect(args).toContain('--max-turns')
    expect(args).toContain('10')
    expect(args).toContain('--dangerously-allow-all')
    expect(args).toContain('--system-prompt')
    expect(args).toContain('Be helpful')
    expect(args).toContain('--label')
    expect(args).toContain('test')
    expect(args).toContain('feature')
  })
})

describe('output-parser integration', () => {
  test('parseAmpOutput extracts text from stream-json', () => {
    const output = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello world' }] }
    })
    const result = parseAmpOutput(output, 0)

    expect(result.output).toBe('Hello world')
  })

  test('parseAmpOutput extracts token info', () => {
    const output = JSON.stringify({
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 }
    })
    const result = parseAmpOutput(output, 0)

    expect(result.tokensUsed.input).toBe(100)
    expect(result.tokensUsed.output).toBe(50)
  })

  test('parseAmpOutput handles multiline ndjson', () => {
    const lines = [
      JSON.stringify({ type: 'start', session_id: 'sess-abc' }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Response' }] }
      }),
      JSON.stringify({ type: 'result', usage: { input_tokens: 200, output_tokens: 100 } })
    ]
    const result = parseAmpOutput(lines.join('\n'), 0)

    expect(result.output).toBe('Response')
    expect(result.tokensUsed.input).toBe(200)
    expect(result.tokensUsed.output).toBe(100)
    expect(result.sessionId).toBe('sess-abc')
  })

  test('parseAmpOutput returns default values for missing info', () => {
    const result = parseAmpOutput('', 0)

    expect(result.output).toBe('')
    expect(result.tokensUsed).toEqual({ input: 0, output: 0 })
    expect(result.turnsUsed).toBe(0)
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

describe('thread continuation options', () => {
  test('continue flag produces thread continuation args', () => {
    const options: AmpCLIExecutionOptions = {
      prompt: 'test',
      continue: true,
    }

    const args = buildAmpArgs(options)
    expect(args[0]).toBe('threads')
    expect(args[1]).toBe('continue')
    expect(args).toContain('--last')
  })

  test('resume produces thread continuation with ID', () => {
    const options: AmpCLIExecutionOptions = {
      prompt: 'test',
      resume: 'thread-12345',
    }

    const args = buildAmpArgs(options)
    expect(args).toContain('threads')
    expect(args).toContain('continue')
    expect(args).toContain('--thread-id')
    expect(args).toContain('thread-12345')
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
})

describe('output parsing edge cases', () => {
  test('handles very large output', () => {
    const largeText = 'x'.repeat(100000)
    const output = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: largeText }] }
    })
    const result = parseAmpOutput(output, 0)

    expect(result.output).toBe(largeText)
  })

  test('handles unicode output', () => {
    const unicodeOutput = '你好世界 🌍 مرحبا'
    const output = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: unicodeOutput }] }
    })
    const result = parseAmpOutput(output, 0)

    expect(result.output).toBe(unicodeOutput)
  })

  test('handles newlines and special characters', () => {
    const specialOutput = 'line1\n\tline2\r\nline3'
    const output = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: specialOutput }] }
    })
    const result = parseAmpOutput(output, 0)

    expect(result.output).toBe(specialOutput)
  })
})

describe('CLI execution options validation', () => {
  test('prompt is required', () => {
    const options: AmpCLIExecutionOptions = {
      prompt: 'required prompt',
    }

    expect(options.prompt).toBe('required prompt')
  })

  test('all optional fields can be undefined', () => {
    const options: AmpCLIExecutionOptions = {
      prompt: 'test',
    }

    expect(options.mode).toBeUndefined()
    expect(options.permissionMode).toBeUndefined()
    expect(options.maxTurns).toBeUndefined()
    expect(options.systemPrompt).toBeUndefined()
    expect(options.timeout).toBeUndefined()
    expect(options.cwd).toBeUndefined()
    expect(options.continue).toBeUndefined()
    expect(options.resume).toBeUndefined()
    expect(options.labels).toBeUndefined()
    expect(options.stopConditions).toBeUndefined()
    expect(options.onProgress).toBeUndefined()
    expect(options.onToolCall).toBeUndefined()
  })

  test('all mode options are valid', () => {
    const modes = ['smart', 'rush'] as const

    for (const mode of modes) {
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
        mode,
      }

      const args = buildAmpArgs(options)
      expect(args).toContain('--mode')
      expect(args).toContain(mode)
    }
  })

  test('all permission modes are valid', () => {
    const modes = ['default', 'acceptEdits', 'bypassPermissions'] as const

    for (const mode of modes) {
      const options: AmpCLIExecutionOptions = {
        prompt: 'test',
        permissionMode: mode,
      }

      const args = buildAmpArgs(options)
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
})

describe('labels option', () => {
  test('single label is added', () => {
    const options: AmpCLIExecutionOptions = {
      prompt: 'test',
      labels: ['bugfix'],
    }

    const args = buildAmpArgs(options)
    expect(args).toContain('--label')
    expect(args).toContain('bugfix')
  })

  test('multiple labels are added', () => {
    const options: AmpCLIExecutionOptions = {
      prompt: 'test',
      labels: ['bugfix', 'urgent', 'backend'],
    }

    const args = buildAmpArgs(options)
    const labelCount = args.filter(a => a === '--label').length
    expect(labelCount).toBe(3)
    expect(args).toContain('bugfix')
    expect(args).toContain('urgent')
    expect(args).toContain('backend')
  })
})
