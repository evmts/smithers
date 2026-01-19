/**
 * Unit tests for Amp.tsx - Amp component interface and rendering tests.
 * Tests the component's props, rendering, lifecycle, and CLI integration.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { AmpProps } from './agents/types/amp.js'
import type { AgentResult } from './Claude.js'
import { buildAmpArgs, modeMap } from './agents/amp-cli/arg-builder.js'
import { parseAmpOutput } from './agents/amp-cli/output-parser.js'

// ============================================================================
// Props Interface Tests (no reconciler needed)
// ============================================================================

describe('AmpProps interface', () => {
  test('mode is optional string', () => {
    const props: AmpProps = {}
    expect(props.mode).toBeUndefined()
  })

  test('mode can be set to smart', () => {
    const props: AmpProps = { mode: 'smart' }
    expect(props.mode).toBe('smart')
  })

  test('mode can be set to rush', () => {
    const props: AmpProps = { mode: 'rush' }
    expect(props.mode).toBe('rush')
  })

  test('maxTurns is optional number', () => {
    const props: AmpProps = { maxTurns: 5 }
    expect(props.maxTurns).toBe(5)
  })

  test('systemPrompt is optional string', () => {
    const props: AmpProps = { systemPrompt: 'You are a helpful assistant' }
    expect(props.systemPrompt).toBe('You are a helpful assistant')
  })

  test('onFinished is optional callback', () => {
    const callback = mock(() => {})
    const props: AmpProps = { onFinished: callback }

    props.onFinished?.({ output: 'result', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, stopReason: 'completed', durationMs: 0 } as AgentResult)
    expect(callback).toHaveBeenCalled()
  })

  test('onError is optional callback', () => {
    const callback = mock(() => {})
    const props: AmpProps = { onError: callback }

    const error = new Error('test')
    props.onError?.(error)
    expect(callback).toHaveBeenCalledWith(error)
  })

  test('validate is optional async function', async () => {
    const validate = mock(async () => true)
    const props: AmpProps = { validate }

    const result = await props.validate?.({ output: 'test' } as AgentResult)
    expect(result).toBe(true)
    expect(validate).toHaveBeenCalled()
  })

  test('allows arbitrary additional props', () => {
    const props: AmpProps = {
      customProp: 'value',
      numberProp: 42,
      boolProp: true,
    }

    expect(props.customProp).toBe('value')
    expect(props.numberProp).toBe(42)
  })

  test('children is optional', () => {
    const props: AmpProps = {}
    expect(props.children).toBeUndefined()
  })

  test('permissionMode accepts valid values', () => {
    const defaultMode: AmpProps = { permissionMode: 'default' }
    const acceptEdits: AmpProps = { permissionMode: 'acceptEdits' }
    const bypass: AmpProps = { permissionMode: 'bypassPermissions' }
    expect(defaultMode.permissionMode).toBe('default')
    expect(acceptEdits.permissionMode).toBe('acceptEdits')
    expect(bypass.permissionMode).toBe('bypassPermissions')
  })

  test('timeout is optional number', () => {
    const props: AmpProps = { timeout: 30000 }
    expect(props.timeout).toBe(30000)
  })

  test('maxRetries is optional number', () => {
    const props: AmpProps = { maxRetries: 5 }
    expect(props.maxRetries).toBe(5)
  })

  test('retryOnValidationFailure is optional boolean', () => {
    const props: AmpProps = { retryOnValidationFailure: true }
    expect(props.retryOnValidationFailure).toBe(true)
  })

  test('reportingEnabled is optional boolean', () => {
    const props: AmpProps = { reportingEnabled: false }
    expect(props.reportingEnabled).toBe(false)
  })

  test('continueThread is optional boolean', () => {
    const props: AmpProps = { continueThread: true }
    expect(props.continueThread).toBe(true)
  })

  test('resumeThread is optional string', () => {
    const props: AmpProps = { resumeThread: 'T-abc123' }
    expect(props.resumeThread).toBe('T-abc123')
  })

  test('labels is optional string array', () => {
    const props: AmpProps = { labels: ['migration', 'database'] }
    expect(props.labels).toEqual(['migration', 'database'])
  })

  test('tailLogCount is optional number', () => {
    const props: AmpProps = { tailLogCount: 20 }
    expect(props.tailLogCount).toBe(20)
  })

  test('tailLogLines is optional number', () => {
    const props: AmpProps = { tailLogLines: 15 }
    expect(props.tailLogLines).toBe(15)
  })

  test('cwd is optional string', () => {
    const props: AmpProps = { cwd: '/tmp/workspace' }
    expect(props.cwd).toBe('/tmp/workspace')
  })

  test('onProgress is optional callback', () => {
    const callback = mock(() => {})
    const props: AmpProps = { onProgress: callback }
    props.onProgress?.('Progress message')
    expect(callback).toHaveBeenCalledWith('Progress message')
  })

  test('onToolCall is optional callback', () => {
    const callback = mock(() => {})
    const props: AmpProps = { onToolCall: callback }
    props.onToolCall?.('Read', { path: '/file.txt' })
    expect(callback).toHaveBeenCalledWith('Read', { path: '/file.txt' })
  })
})

// ============================================================================
// Arg Builder Tests
// ============================================================================

describe('buildAmpArgs', () => {
  test('builds basic execute command', () => {
    const args = buildAmpArgs({ prompt: 'Hello' })
    expect(args).toContain('--execute')
    expect(args).toContain('--stream-json')
  })

  test('includes mode flag', () => {
    const smartArgs = buildAmpArgs({ prompt: 'test', mode: 'smart' })
    expect(smartArgs).toContain('--mode')
    expect(smartArgs).toContain('smart')

    const rushArgs = buildAmpArgs({ prompt: 'test', mode: 'rush' })
    expect(rushArgs).toContain('--mode')
    expect(rushArgs).toContain('rush')
  })

  test('includes dangerously-allow-all for bypassPermissions', () => {
    const args = buildAmpArgs({ prompt: 'test', permissionMode: 'bypassPermissions' })
    expect(args).toContain('--dangerously-allow-all')
  })

  test('includes labels', () => {
    const args = buildAmpArgs({ prompt: 'test', labels: ['label1', 'label2'] })
    expect(args.filter(a => a === '--label').length).toBe(2)
    expect(args).toContain('label1')
    expect(args).toContain('label2')
  })

  test('continues thread', () => {
    const args = buildAmpArgs({ prompt: 'test', continue: true })
    expect(args).toContain('threads')
    expect(args).toContain('continue')
    expect(args).toContain('--last')
  })

  test('resumes specific thread', () => {
    const args = buildAmpArgs({ prompt: 'test', resume: 'T-abc123' })
    expect(args).toContain('threads')
    expect(args).toContain('continue')
    expect(args).toContain('--thread-id')
    expect(args).toContain('T-abc123')
  })

  test('includes maxTurns', () => {
    const args = buildAmpArgs({ prompt: 'test', maxTurns: 7 })
    expect(args).toContain('--max-turns')
    expect(args).toContain('7')
  })

  test('includes systemPrompt', () => {
    const args = buildAmpArgs({ prompt: 'test', systemPrompt: 'Be terse' })
    expect(args).toContain('--system-prompt')
    expect(args).toContain('Be terse')
  })
})

// ============================================================================
// Mode Map Tests
// ============================================================================

describe('modeMap', () => {
  test('smart maps to smart', () => {
    expect(modeMap['smart']).toBe('smart')
  })

  test('rush maps to rush', () => {
    expect(modeMap['rush']).toBe('rush')
  })
})

// ============================================================================
// Output Parser Tests
// ============================================================================

describe('parseAmpOutput', () => {
  test('parses stream-json output', () => {
    const output = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}'
    const result = parseAmpOutput(output, 0)
    expect(result.output).toContain('Hello')
  })

  test('extracts text from assistant messages', () => {
    const lines = [
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Line 1"}]}}',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Line 2"}]}}',
    ].join('\n')
    const result = parseAmpOutput(lines, 0)
    expect(result.output).toContain('Line 1')
    expect(result.output).toContain('Line 2')
  })

  test('handles empty output', () => {
    const result = parseAmpOutput('', 0)
    expect(result.output).toBe('')
    expect(result.stopReason).toBe('completed')
  })

  test('sets error stop reason on non-zero exit code', () => {
    const result = parseAmpOutput('', 1)
    expect(result.stopReason).toBe('error')
  })

  test('extracts token usage from result events', () => {
    const output = '{"type":"result","usage":{"input_tokens":100,"output_tokens":50}}'
    const result = parseAmpOutput(output, 0)
    expect(result.tokensUsed.input).toBe(100)
    expect(result.tokensUsed.output).toBe(50)
  })
})
