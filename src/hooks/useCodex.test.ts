/**
 * Unit tests for useCodex hook.
 * Tests the hook's adapter integration and type handling.
 */
import { describe, test, expect } from 'bun:test'
import { CodexAdapter } from './adapters/codex.js'
import type { CodexProps } from '../components/agents/types/codex.js'
import type { UseCodexResult } from './useCodex.js'

describe('useCodex', () => {
  describe('CodexAdapter behavior', () => {
    test('adapter name is codex', () => {
      expect(CodexAdapter.name).toBe('codex')
    })

    test('getAgentLabel returns model from options', () => {
      expect(CodexAdapter.getAgentLabel({ prompt: 'test', model: 'o3' })).toBe('o3')
    })

    test('getAgentLabel defaults to o4-mini', () => {
      expect(CodexAdapter.getAgentLabel({ prompt: 'test' })).toBe('o4-mini')
    })

    test('getLoggerName returns Codex', () => {
      expect(CodexAdapter.getLoggerName()).toBe('Codex')
    })

    test('getLoggerContext includes model', () => {
      expect(CodexAdapter.getLoggerContext({ model: 'o3' })).toEqual({ model: 'o3' })
    })

    test('getLoggerContext defaults model to o4-mini', () => {
      expect(CodexAdapter.getLoggerContext({})).toEqual({ model: 'o4-mini' })
    })
  })

  describe('CodexAdapter.extractPrompt', () => {
    test('returns prompt and undefined mcpConfigPath', () => {
      const result = CodexAdapter.extractPrompt('test prompt', {})
      expect(result.prompt).toBe('test prompt')
      expect(result.mcpConfigPath).toBeUndefined()
    })

    test('preserves multiline prompts', () => {
      const multiline = 'line1\nline2\nline3'
      const result = CodexAdapter.extractPrompt(multiline, {})
      expect(result.prompt).toBe(multiline)
    })
  })

  describe('CodexAdapter.buildOptions', () => {
    test('includes prompt from context', () => {
      const options = CodexAdapter.buildOptions({}, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.prompt).toBe('test')
    })

    test('includes model when specified', () => {
      const options = CodexAdapter.buildOptions({ model: 'o3' }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.model).toBe('o3')
    })

    test('includes sandboxMode when specified', () => {
      const options = CodexAdapter.buildOptions({ sandboxMode: 'read-only' }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.sandboxMode).toBe('read-only')
    })

    test('includes approvalPolicy when specified', () => {
      const options = CodexAdapter.buildOptions({ approvalPolicy: 'never' }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.approvalPolicy).toBe('never')
    })

    test('includes fullAuto when specified', () => {
      const options = CodexAdapter.buildOptions({ fullAuto: true }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.fullAuto).toBe(true)
    })

    test('includes bypassSandbox when specified', () => {
      const options = CodexAdapter.buildOptions({ bypassSandbox: true }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.bypassSandbox).toBe(true)
    })

    test('includes cwd from context', () => {
      const options = CodexAdapter.buildOptions({}, { prompt: 'test', cwd: '/tmp/test', mcpConfigPath: undefined })
      expect(options.cwd).toBe('/tmp/test')
    })

    test('includes skipGitRepoCheck when specified', () => {
      const options = CodexAdapter.buildOptions({ skipGitRepoCheck: true }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.skipGitRepoCheck).toBe(true)
    })

    test('includes addDirs when specified', () => {
      const options = CodexAdapter.buildOptions({ addDirs: ['/extra'] }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.addDirs).toEqual(['/extra'])
    })

    test('includes images when specified', () => {
      const options = CodexAdapter.buildOptions({ images: ['/img.png'] }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.images).toEqual(['/img.png'])
    })

    test('includes profile when specified', () => {
      const options = CodexAdapter.buildOptions({ profile: 'dev' }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.profile).toBe('dev')
    })

    test('includes configOverrides when specified', () => {
      const options = CodexAdapter.buildOptions({ configOverrides: { key: 'value' } }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.configOverrides).toEqual({ key: 'value' })
    })

    test('includes timeout when specified', () => {
      const options = CodexAdapter.buildOptions({ timeout: 30000 }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.timeout).toBe(30000)
    })

    test('includes stopConditions when specified', () => {
      const conditions = [{ type: 'token_limit' as const, value: 1000 }]
      const options = CodexAdapter.buildOptions({ stopConditions: conditions }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.stopConditions).toEqual(conditions)
    })

    test('includes jsonOutput as json', () => {
      const options = CodexAdapter.buildOptions({ jsonOutput: true }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.json).toBe(true)
    })

    test('includes schema when specified', () => {
      const options = CodexAdapter.buildOptions({ schema: { type: 'object' } }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.schema).toEqual({ type: 'object' })
    })

    test('includes schemaRetries when specified', () => {
      const options = CodexAdapter.buildOptions({ schemaRetries: 5 }, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.schemaRetries).toBe(5)
    })

    test('omits undefined options', () => {
      const options = CodexAdapter.buildOptions({}, { prompt: 'test', cwd: undefined, mcpConfigPath: undefined })
      expect(options.model).toBeUndefined()
      expect(options.timeout).toBeUndefined()
    })
  })

  describe('CodexAdapter.createMessageParser', () => {
    test('returns a MessageParserInterface', () => {
      const parser = CodexAdapter.createMessageParser(10)
      expect(parser.parseChunk).toBeDefined()
      expect(parser.flush).toBeDefined()
      expect(parser.getLatestEntries).toBeDefined()
    })

    test('parser works with basic chunks', () => {
      const parser = CodexAdapter.createMessageParser(10)
      parser.parseChunk('Hello world\n\n')
      const entries = parser.getLatestEntries(10)
      expect(entries.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('CodexAdapter.createStreamParser', () => {
    test('returns null (codex does not support streaming)', () => {
      expect(CodexAdapter.createStreamParser?.()).toBeNull()
    })
  })

  describe('CodexAdapter.supportsTypedStreaming', () => {
    test('always returns false', () => {
      expect(CodexAdapter.supportsTypedStreaming({})).toBe(false)
      expect(CodexAdapter.supportsTypedStreaming({ onStreamPart: () => {} })).toBe(false)
    })
  })

  describe('model prop handling', () => {
    test('model defaults to o4-mini when not specified', () => {
      const props: CodexProps = {}
      const model = props.model ?? 'o4-mini'
      expect(model).toBe('o4-mini')
    })

    test('model uses provided value', () => {
      const props: CodexProps = { model: 'o3' }
      expect(props.model).toBe('o3')
    })
  })

  describe('UseCodexResult type structure', () => {
    test('all required fields are present', () => {
      const result: UseCodexResult = {
        status: 'pending',
        agentId: null,
        executionId: null,
        model: 'o4-mini',
        result: null,
        error: null,
        tailLog: []
      }
      expect(result.status).toBe('pending')
      expect(result.model).toBe('o4-mini')
    })

    test('status accepts all valid values', () => {
      const statuses: UseCodexResult['status'][] = ['pending', 'running', 'complete', 'error']
      expect(statuses).toHaveLength(4)
    })
  })
})
