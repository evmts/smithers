/**
 * Tests for CodexAdapter
 */
import { describe, test, expect } from 'bun:test'
import { CodexAdapter } from './codex.js'
import type { CodexProps } from '../../components/agents/types/codex.js'

describe('CodexAdapter', () => {
  describe('name', () => {
    test('returns "codex"', () => {
      expect(CodexAdapter.name).toBe('codex')
    })
  })

  describe('getAgentLabel', () => {
    test('returns model from options', () => {
      expect(CodexAdapter.getAgentLabel({ model: 'o4' })).toBe('o4')
      expect(CodexAdapter.getAgentLabel({ model: 'o4-mini' })).toBe('o4-mini')
    })

    test('defaults to "o4-mini" when model not specified', () => {
      expect(CodexAdapter.getAgentLabel({})).toBe('o4-mini')
    })
  })

  describe('getLoggerName', () => {
    test('returns "Codex"', () => {
      expect(CodexAdapter.getLoggerName()).toBe('Codex')
    })
  })

  describe('getLoggerContext', () => {
    test('returns model from props', () => {
      const props: CodexProps = { model: 'o4' }
      expect(CodexAdapter.getLoggerContext(props)).toEqual({ model: 'o4' })
    })

    test('defaults model to "o4-mini"', () => {
      const props: CodexProps = {}
      expect(CodexAdapter.getLoggerContext(props)).toEqual({ model: 'o4-mini' })
    })
  })

  describe('extractPrompt', () => {
    test('returns prompt and undefined mcpConfigPath', () => {
      const result = CodexAdapter.extractPrompt('Hello world', {})
      expect(result).toEqual({
        prompt: 'Hello world',
        mcpConfigPath: undefined,
      })
    })

    test('preserves multiline prompts', () => {
      const multiline = 'Line 1\nLine 2\nLine 3'
      const result = CodexAdapter.extractPrompt(multiline, {})
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
      const options = CodexAdapter.buildOptions({}, baseCtx)
      expect(options.prompt).toBe('Test prompt')
    })

    test('includes model when specified', () => {
      const props: CodexProps = { model: 'o4' }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.model).toBe('o4')
    })

    test('includes sandboxMode when specified', () => {
      const props: CodexProps = { sandboxMode: 'docker' }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.sandboxMode).toBe('docker')
    })

    test('includes approvalPolicy when specified', () => {
      const props: CodexProps = { approvalPolicy: 'auto-edit' }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.approvalPolicy).toBe('auto-edit')
    })

    test('includes fullAuto when specified', () => {
      const props: CodexProps = { fullAuto: true }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.fullAuto).toBe(true)
    })

    test('includes bypassSandbox when specified', () => {
      const props: CodexProps = { bypassSandbox: true }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.bypassSandbox).toBe(true)
    })

    test('includes cwd from context', () => {
      const ctx = { ...baseCtx, cwd: '/test/path' }
      const options = CodexAdapter.buildOptions({}, ctx)
      expect(options.cwd).toBe('/test/path')
    })

    test('includes skipGitRepoCheck when specified', () => {
      const props: CodexProps = { skipGitRepoCheck: true }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.skipGitRepoCheck).toBe(true)
    })

    test('includes addDirs when specified', () => {
      const props: CodexProps = { addDirs: ['/path1', '/path2'] }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.addDirs).toEqual(['/path1', '/path2'])
    })

    test('includes images when specified', () => {
      const props: CodexProps = { images: ['image1.png', 'image2.png'] }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.images).toEqual(['image1.png', 'image2.png'])
    })

    test('includes profile when specified', () => {
      const props: CodexProps = { profile: 'custom-profile' }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.profile).toBe('custom-profile')
    })

    test('includes configOverrides when specified', () => {
      const props: CodexProps = { configOverrides: { key: 'value' } }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.configOverrides).toEqual({ key: 'value' })
    })

    test('includes timeout when specified', () => {
      const props: CodexProps = { timeout: 60000 }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.timeout).toBe(60000)
    })

    test('includes stopConditions when specified', () => {
      const props: CodexProps = { stopConditions: { maxTokens: 1000 } }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.stopConditions).toEqual({ maxTokens: 1000 })
    })

    test('includes jsonOutput as json', () => {
      const props: CodexProps = { jsonOutput: true }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.json).toBe(true)
    })

    test('includes schema when specified', () => {
      const props: CodexProps = { schema: '{"type":"object"}' }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.schema).toBe('{"type":"object"}')
    })

    test('includes schemaRetries when specified', () => {
      const props: CodexProps = { schemaRetries: 3 }
      const options = CodexAdapter.buildOptions(props, baseCtx)
      expect(options.schemaRetries).toBe(3)
    })

    test('omits undefined options', () => {
      const options = CodexAdapter.buildOptions({}, baseCtx)
      expect(options).toEqual({ prompt: 'Test prompt' })
    })
  })

  describe('createMessageParser', () => {
    test('returns a MessageParserInterface', () => {
      const parser = CodexAdapter.createMessageParser(100)
      expect(typeof parser.parseChunk).toBe('function')
      expect(typeof parser.flush).toBe('function')
      expect(typeof parser.getLatestEntries).toBe('function')
    })

    test('parser works with basic chunks', () => {
      const parser = CodexAdapter.createMessageParser(100)
      parser.parseChunk('test output')
      parser.flush()
      const entries = parser.getLatestEntries(10)
      expect(Array.isArray(entries)).toBe(true)
    })
  })

  describe('createStreamParser', () => {
    test('returns null (codex does not support streaming)', () => {
      const parser = CodexAdapter.createStreamParser()
      expect(parser).toBeNull()
    })
  })

  describe('supportsTypedStreaming', () => {
    test('always returns false', () => {
      expect(CodexAdapter.supportsTypedStreaming({})).toBe(false)
      expect(CodexAdapter.supportsTypedStreaming({ model: 'o4' })).toBe(false)
    })
  })
})
