/**
 * Tests for AmpAdapter
 */
import { describe, test, expect } from 'bun:test'
import { AmpAdapter } from './amp.js'
import type { AmpProps } from '../../components/agents/types/amp.js'

describe('AmpAdapter', () => {
  describe('name', () => {
    test('returns "amp"', () => {
      expect(AmpAdapter.name).toBe('amp')
    })
  })

  describe('getAgentLabel', () => {
    test('returns mode from options', () => {
      expect(AmpAdapter.getAgentLabel({ mode: 'fast' })).toBe('amp-fast')
      expect(AmpAdapter.getAgentLabel({ mode: 'smart' })).toBe('amp-smart')
      expect(AmpAdapter.getAgentLabel({ mode: 'auto' })).toBe('amp-auto')
    })

    test('defaults to "smart" when mode not specified', () => {
      expect(AmpAdapter.getAgentLabel({})).toBe('amp-smart')
    })
  })

  describe('getLoggerName', () => {
    test('returns "Amp"', () => {
      expect(AmpAdapter.getLoggerName()).toBe('Amp')
    })
  })

  describe('getLoggerContext', () => {
    test('returns mode from props', () => {
      const props: AmpProps = { mode: 'fast' }
      expect(AmpAdapter.getLoggerContext(props)).toEqual({ mode: 'fast' })
    })

    test('defaults mode to "smart"', () => {
      const props: AmpProps = {}
      expect(AmpAdapter.getLoggerContext(props)).toEqual({ mode: 'smart' })
    })
  })

  describe('extractPrompt', () => {
    test('returns prompt and undefined mcpConfigPath', () => {
      const result = AmpAdapter.extractPrompt('Hello world', {})
      expect(result).toEqual({
        prompt: 'Hello world',
        mcpConfigPath: undefined,
      })
    })

    test('preserves multiline prompts', () => {
      const multiline = 'Line 1\nLine 2\nLine 3'
      const result = AmpAdapter.extractPrompt(multiline, {})
      expect(result.prompt).toBe(multiline)
    })
  })

  describe('buildOptions', () => {
    const baseCtx = {
      prompt: 'Test prompt',
      cwd: undefined,
      mcpConfigPath: undefined,
    }

    test('includes prompt from context', () => {
      const options = AmpAdapter.buildOptions({}, baseCtx)
      expect(options.prompt).toBe('Test prompt')
    })

    test('includes mode when specified', () => {
      const props: AmpProps = { mode: 'fast' }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.mode).toBe('fast')
    })

    test('includes permissionMode when specified', () => {
      const props: AmpProps = { permissionMode: 'auto-approve' }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.permissionMode).toBe('auto-approve')
    })

    test('includes maxTurns when specified', () => {
      const props: AmpProps = { maxTurns: 10 }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.maxTurns).toBe(10)
    })

    test('includes systemPrompt when specified', () => {
      const props: AmpProps = { systemPrompt: 'Custom system prompt' }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.systemPrompt).toBe('Custom system prompt')
    })

    test('includes cwd from context', () => {
      const ctx = { ...baseCtx, cwd: '/test/path' }
      const options = AmpAdapter.buildOptions({}, ctx)
      expect(options.cwd).toBe('/test/path')
    })

    test('includes timeout when specified', () => {
      const props: AmpProps = { timeout: 60000 }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.timeout).toBe(60000)
    })

    test('includes stopConditions when specified', () => {
      const props: AmpProps = { stopConditions: { maxTokens: 1000 } }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.stopConditions).toEqual({ maxTokens: 1000 })
    })

    test('includes continueThread as continue', () => {
      const props: AmpProps = { continueThread: 'thread-123' }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.continue).toBe('thread-123')
    })

    test('includes resumeThread as resume', () => {
      const props: AmpProps = { resumeThread: 'thread-456' }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.resume).toBe('thread-456')
    })

    test('includes labels when specified', () => {
      const props: AmpProps = { labels: ['test', 'dev'] }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.labels).toEqual(['test', 'dev'])
    })

    test('includes onToolCall when specified', () => {
      const onToolCall = () => {}
      const props: AmpProps = { onToolCall }
      const options = AmpAdapter.buildOptions(props, baseCtx)
      expect(options.onToolCall).toBe(onToolCall)
    })

    test('omits undefined options', () => {
      const options = AmpAdapter.buildOptions({}, baseCtx)
      expect(options).toEqual({ prompt: 'Test prompt' })
    })
  })

  describe('createMessageParser', () => {
    test('returns a MessageParserInterface', () => {
      const parser = AmpAdapter.createMessageParser(100)
      expect(typeof parser.parseChunk).toBe('function')
      expect(typeof parser.flush).toBe('function')
      expect(typeof parser.getLatestEntries).toBe('function')
    })

    test('parser works with basic chunks', () => {
      const parser = AmpAdapter.createMessageParser(100)
      parser.parseChunk('test output')
      parser.flush()
      const entries = parser.getLatestEntries(10)
      expect(Array.isArray(entries)).toBe(true)
    })
  })

  describe('createStreamParser', () => {
    test('returns an AmpStreamParser', () => {
      const parser = AmpAdapter.createStreamParser()
      expect(parser).not.toBeNull()
      expect(typeof parser?.parse).toBe('function')
      expect(typeof parser?.flush).toBe('function')
    })
  })

  describe('supportsTypedStreaming', () => {
    test('returns false by default', () => {
      const props: AmpProps = {}
      expect(AmpAdapter.supportsTypedStreaming(props)).toBe(false)
    })

    test('returns true when onStreamPart is defined', () => {
      const props: AmpProps = { onStreamPart: () => {} }
      expect(AmpAdapter.supportsTypedStreaming(props)).toBe(true)
    })

    test('returns true when experimentalTypedStreaming is true', () => {
      const props = { experimentalTypedStreaming: true } as unknown as AmpProps
      expect(AmpAdapter.supportsTypedStreaming(props)).toBe(true)
    })
  })
})
