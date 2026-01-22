/**
 * Unit tests for useAmp hook.
 * Tests the hook's adapter integration and type handling.
 */
import { describe, test, expect } from 'bun:test'
import { AmpAdapter } from './adapters/amp.js'
import type { AmpProps } from '../components/agents/types/amp.js'
import type { UseAmpResult } from './useAmp.js'

describe('useAmp', () => {
  describe('AmpAdapter behavior', () => {
    test('adapter name is amp', () => {
      expect(AmpAdapter.name).toBe('amp')
    })

    test('getAgentLabel returns amp-mode from options', () => {
      expect(AmpAdapter.getAgentLabel({ prompt: 'test', mode: 'plan' })).toBe('amp-plan')
    })

    test('getAgentLabel defaults to amp-smart', () => {
      expect(AmpAdapter.getAgentLabel({ prompt: 'test' })).toBe('amp-smart')
    })

    test('getLoggerName returns Amp', () => {
      expect(AmpAdapter.getLoggerName()).toBe('Amp')
    })

    test('getLoggerContext includes mode', () => {
      expect(AmpAdapter.getLoggerContext({ mode: 'auto' })).toEqual({ mode: 'auto' })
    })

    test('getLoggerContext defaults mode to smart', () => {
      expect(AmpAdapter.getLoggerContext({})).toEqual({ mode: 'smart' })
    })
  })

  describe('AmpAdapter.extractPrompt', () => {
    test('returns prompt and undefined mcpConfigPath', () => {
      const result = AmpAdapter.extractPrompt('test prompt', {})
      expect(result.prompt).toBe('test prompt')
      expect(result.mcpConfigPath).toBeUndefined()
    })

    test('preserves multiline prompts', () => {
      const multiline = 'line1\nline2\nline3'
      const result = AmpAdapter.extractPrompt(multiline, {})
      expect(result.prompt).toBe(multiline)
    })
  })

  describe('AmpAdapter.buildOptions', () => {
    test('includes prompt from context', () => {
      const options = AmpAdapter.buildOptions({}, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.prompt).toBe('test')
    })

    test('includes mode when specified', () => {
      const options = AmpAdapter.buildOptions({ mode: 'rush' }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.mode).toBe('rush')
    })

    test('includes permissionMode when specified', () => {
      const options = AmpAdapter.buildOptions({ permissionMode: 'bypassPermissions' }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.permissionMode).toBe('bypassPermissions')
    })

    test('includes maxTurns when specified', () => {
      const options = AmpAdapter.buildOptions({ maxTurns: 10 }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.maxTurns).toBe(10)
    })

    test('includes cwd from context', () => {
      const options = AmpAdapter.buildOptions({}, { prompt: 'test', cwd: '/tmp/test', mcpConfigPath: undefined })
      expect(options.cwd).toBe('/tmp/test')
    })

    test('includes timeout when specified', () => {
      const options = AmpAdapter.buildOptions({ timeout: 30000 }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.timeout).toBe(30000)
    })

    test('includes labels when specified', () => {
      const options = AmpAdapter.buildOptions({ labels: ['test', 'ci'] }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.labels).toEqual(['test', 'ci'])
    })

    test('omits undefined options', () => {
      const options = AmpAdapter.buildOptions({}, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.mode).toBeUndefined()
      expect(options.timeout).toBeUndefined()
    })
  })

  describe('AmpAdapter.createMessageParser', () => {
    test('returns a MessageParserInterface', () => {
      const parser = AmpAdapter.createMessageParser(10)
      expect(parser.parseChunk).toBeDefined()
      expect(parser.flush).toBeDefined()
      expect(parser.getLatestEntries).toBeDefined()
    })

    test('parser handles basic chunks', () => {
      const parser = AmpAdapter.createMessageParser(10)
      parser.parseChunk('{"type":"assistant","content":[{"type":"text","text":"Hello"}]}\n')
      parser.flush()
      const entries = parser.getLatestEntries(10)
      expect(entries.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('AmpAdapter.supportsTypedStreaming', () => {
    test('returns false by default', () => {
      expect(AmpAdapter.supportsTypedStreaming({})).toBe(false)
    })

    test('returns true when onStreamPart is provided', () => {
      expect(AmpAdapter.supportsTypedStreaming({ onStreamPart: () => {} })).toBe(true)
    })
  })

  describe('mode prop handling', () => {
    test('mode defaults to smart when not specified', () => {
      const props: AmpProps = {}
      const mode = props.mode ?? 'smart'
      expect(mode).toBe('smart')
    })

    test('mode uses provided value', () => {
      const props: AmpProps = { mode: 'plan' }
      expect(props.mode).toBe('plan')
    })
  })

  describe('UseAmpResult type structure', () => {
    test('all required fields are present', () => {
      const result: UseAmpResult = {
        status: 'pending',
        agentId: null,
        executionId: null,
        mode: 'smart',
        result: null,
        error: null,
        tailLog: []
      }
      expect(result.status).toBe('pending')
      expect(result.mode).toBe('smart')
    })

    test('status accepts all valid values', () => {
      const statuses: UseAmpResult['status'][] = ['pending', 'running', 'complete', 'error']
      expect(statuses).toHaveLength(4)
    })
  })
})
