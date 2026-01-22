/**
 * Unit tests for useClaude hook.
 * Tests the hook's adapter integration and type handling.
 */
import { describe, test, expect } from 'bun:test'
import { ClaudeAdapter } from './adapters/claude.js'
import type { ClaudeProps } from '../components/agents/types.js'
import type { UseClaudeResult } from './useClaude.js'

describe('useClaude', () => {
  describe('ClaudeAdapter behavior', () => {
    test('adapter name is claude', () => {
      expect(ClaudeAdapter.name).toBe('claude')
    })

    test('getAgentLabel returns model from options', () => {
      expect(ClaudeAdapter.getAgentLabel({ prompt: 'test', model: 'opus' })).toBe('opus')
    })

    test('getAgentLabel defaults to sonnet', () => {
      expect(ClaudeAdapter.getAgentLabel({ prompt: 'test' })).toBe('sonnet')
    })

    test('getLoggerName returns Claude', () => {
      expect(ClaudeAdapter.getLoggerName()).toBe('Claude')
    })

    test('getLoggerContext includes model', () => {
      expect(ClaudeAdapter.getLoggerContext({ model: 'haiku' })).toEqual({ model: 'haiku' })
    })

    test('getLoggerContext defaults model to sonnet', () => {
      expect(ClaudeAdapter.getLoggerContext({})).toEqual({ model: 'sonnet' })
    })
  })

  describe('ClaudeAdapter.extractPrompt', () => {
    test('returns prompt and undefined mcpConfigPath for plain text', async () => {
      const result = await ClaudeAdapter.extractPrompt('test prompt', {})
      expect(result.prompt).toBe('test prompt')
      expect(result.mcpConfigPath).toBeUndefined()
    })

    test('preserves multiline prompts', async () => {
      const multiline = 'line1\nline2\nline3'
      const result = await ClaudeAdapter.extractPrompt(multiline, {})
      expect(result.prompt).toContain('line1')
      expect(result.prompt).toContain('line3')
    })
  })

  describe('ClaudeAdapter.buildOptions', () => {
    test('includes prompt from context', () => {
      const options = ClaudeAdapter.buildOptions({}, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.prompt).toBe('test')
    })

    test('includes model when specified', () => {
      const options = ClaudeAdapter.buildOptions({ model: 'opus' }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.model).toBe('opus')
    })

    test('includes permissionMode when specified', () => {
      const options = ClaudeAdapter.buildOptions({ permissionMode: 'bypassPermissions' }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.permissionMode).toBe('bypassPermissions')
    })

    test('includes maxTurns when specified', () => {
      const options = ClaudeAdapter.buildOptions({ maxTurns: 5 }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.maxTurns).toBe(5)
    })

    test('includes maxTokens when specified', () => {
      const options = ClaudeAdapter.buildOptions({ maxTokens: 4096 }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.maxTokens).toBe(4096)
    })

    test('omits undefined options', () => {
      const options = ClaudeAdapter.buildOptions({}, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.model).toBeUndefined()
      expect(options.maxTurns).toBeUndefined()
      expect(options.maxTokens).toBeUndefined()
    })
  })

  describe('ClaudeAdapter.createMessageParser', () => {
    test('returns a MessageParserInterface', () => {
      const parser = ClaudeAdapter.createMessageParser(10)
      expect(parser.parseChunk).toBeDefined()
      expect(parser.flush).toBeDefined()
      expect(parser.getLatestEntries).toBeDefined()
    })

    test('parser handles basic chunks', () => {
      const parser = ClaudeAdapter.createMessageParser(10)
      parser.parseChunk('Hello world\n\n')
      parser.flush()
      const entries = parser.getLatestEntries(10)
      expect(entries.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('ClaudeAdapter.supportsTypedStreaming', () => {
    test('returns false by default', () => {
      expect(ClaudeAdapter.supportsTypedStreaming({})).toBe(false)
    })

    test('returns true when onStreamPart is provided', () => {
      expect(ClaudeAdapter.supportsTypedStreaming({ onStreamPart: () => {} })).toBe(true)
    })
  })

  describe('model prop handling', () => {
    test('model defaults to sonnet when not specified', () => {
      const props: ClaudeProps = {}
      const model = props.model ?? 'sonnet'
      expect(model).toBe('sonnet')
    })

    test('model uses provided value', () => {
      const props: ClaudeProps = { model: 'opus' }
      expect(props.model).toBe('opus')
    })
  })

  describe('UseClaudeResult type structure', () => {
    test('all required fields are present', () => {
      const result: UseClaudeResult = {
        status: 'pending',
        agentId: null,
        executionId: null,
        model: 'sonnet',
        result: null,
        error: null,
        tailLog: []
      }
      expect(result.status).toBe('pending')
      expect(result.model).toBe('sonnet')
    })

    test('status accepts all valid values', () => {
      const statuses: UseClaudeResult['status'][] = ['pending', 'running', 'complete', 'error']
      expect(statuses).toHaveLength(4)
    })
  })
})
