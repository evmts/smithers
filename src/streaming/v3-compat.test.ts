import { describe, test, expect } from 'bun:test'
import type {
  JSONValue,
  Warning,
  FinishReason,
  TokenUsage,
  ResponseMetadata,
  LanguageModelV3StreamPart,
} from './v3-compat.js'

describe('v3-compat types', () => {
  describe('JSONValue', () => {
    test('accepts null', () => {
      const val: JSONValue = null
      expect(val).toBeNull()
    })

    test('accepts boolean', () => {
      const val: JSONValue = true
      expect(val).toBe(true)
    })

    test('accepts number', () => {
      const val: JSONValue = 42
      expect(val).toBe(42)
    })

    test('accepts string', () => {
      const val: JSONValue = 'hello'
      expect(val).toBe('hello')
    })

    test('accepts array of JSONValue', () => {
      const val: JSONValue = [1, 'two', null, true]
      expect(val).toEqual([1, 'two', null, true])
    })

    test('accepts nested objects', () => {
      const val: JSONValue = { a: 1, b: { c: [1, 2, 3] } }
      expect(val).toEqual({ a: 1, b: { c: [1, 2, 3] } })
    })
  })

  describe('Warning', () => {
    test('has type and message', () => {
      const warning: Warning = { type: 'deprecation', message: 'API deprecated' }
      expect(warning.type).toBe('deprecation')
      expect(warning.message).toBe('API deprecated')
    })
  })

  describe('FinishReason', () => {
    test('accepts unified stop reason', () => {
      const reason: FinishReason = { unified: 'stop' }
      expect(reason).toEqual({ unified: 'stop' })
    })

    test('accepts unified length reason', () => {
      const reason: FinishReason = { unified: 'length' }
      expect(reason).toEqual({ unified: 'length' })
    })

    test('accepts unified tool-calls reason', () => {
      const reason: FinishReason = { unified: 'tool-calls' }
      expect(reason).toEqual({ unified: 'tool-calls' })
    })

    test('accepts unified content-filter reason', () => {
      const reason: FinishReason = { unified: 'content-filter' }
      expect(reason).toEqual({ unified: 'content-filter' })
    })

    test('accepts unified error reason', () => {
      const reason: FinishReason = { unified: 'error' }
      expect(reason).toEqual({ unified: 'error' })
    })

    test('accepts unified unknown reason', () => {
      const reason: FinishReason = { unified: 'unknown' }
      expect(reason).toEqual({ unified: 'unknown' })
    })

    test('accepts provider-specific reason', () => {
      const reason: FinishReason = { provider: 'anthropic', reason: 'end_turn' }
      expect(reason).toEqual({ provider: 'anthropic', reason: 'end_turn' })
    })
  })

  describe('TokenUsage', () => {
    test('accepts minimal usage', () => {
      const usage: TokenUsage = {
        inputTokens: { total: 100 },
        outputTokens: { total: 50 },
      }
      expect(usage.inputTokens.total).toBe(100)
      expect(usage.outputTokens.total).toBe(50)
    })

    test('accepts usage with cache info', () => {
      const usage: TokenUsage = {
        inputTokens: { total: 100, cacheCreation: 20, cacheRead: 80 },
        outputTokens: { total: 50 },
      }
      expect(usage.inputTokens.cacheCreation).toBe(20)
      expect(usage.inputTokens.cacheRead).toBe(80)
    })
  })

  describe('ResponseMetadata', () => {
    test('accepts empty metadata', () => {
      const meta: ResponseMetadata = {}
      expect(meta).toEqual({})
    })

    test('accepts full metadata', () => {
      const meta: ResponseMetadata = {
        requestId: 'req-123',
        responseId: 'resp-456',
        model: 'claude-3-opus',
        providerMetadata: { custom: 'value' },
      }
      expect(meta.requestId).toBe('req-123')
      expect(meta.model).toBe('claude-3-opus')
    })
  })

  describe('LanguageModelV3StreamPart', () => {
    test('text-start', () => {
      const part: LanguageModelV3StreamPart = { type: 'text-start', id: 't1' }
      expect(part.type).toBe('text-start')
    })

    test('text-delta', () => {
      const part: LanguageModelV3StreamPart = { type: 'text-delta', id: 't1', delta: 'Hello' }
      expect(part.type).toBe('text-delta')
      if (part.type === 'text-delta') {
        expect(part.delta).toBe('Hello')
      }
    })

    test('text-end', () => {
      const part: LanguageModelV3StreamPart = { type: 'text-end', id: 't1' }
      expect(part.type).toBe('text-end')
    })

    test('reasoning-start', () => {
      const part: LanguageModelV3StreamPart = { type: 'reasoning-start', id: 'r1' }
      expect(part.type).toBe('reasoning-start')
    })

    test('reasoning-delta', () => {
      const part: LanguageModelV3StreamPart = { type: 'reasoning-delta', id: 'r1', delta: 'thinking...' }
      expect(part.type).toBe('reasoning-delta')
    })

    test('reasoning-end', () => {
      const part: LanguageModelV3StreamPart = { type: 'reasoning-end', id: 'r1' }
      expect(part.type).toBe('reasoning-end')
    })

    test('tool-input-start', () => {
      const part: LanguageModelV3StreamPart = { type: 'tool-input-start', id: 'tool1', toolName: 'Read' }
      expect(part.type).toBe('tool-input-start')
      if (part.type === 'tool-input-start') {
        expect(part.toolName).toBe('Read')
      }
    })

    test('tool-input-delta', () => {
      const part: LanguageModelV3StreamPart = { type: 'tool-input-delta', id: 'tool1', delta: '{"path":' }
      expect(part.type).toBe('tool-input-delta')
    })

    test('tool-input-end', () => {
      const part: LanguageModelV3StreamPart = { type: 'tool-input-end', id: 'tool1' }
      expect(part.type).toBe('tool-input-end')
    })

    test('tool-call', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'Read',
        input: '{"path":"/tmp"}',
      }
      expect(part.type).toBe('tool-call')
      if (part.type === 'tool-call') {
        expect(part.toolCallId).toBe('call-1')
        expect(part.toolName).toBe('Read')
      }
    })

    test('tool-result', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'Read',
        result: { content: 'file contents' },
      }
      expect(part.type).toBe('tool-result')
      if (part.type === 'tool-result') {
        expect(part.result).toEqual({ content: 'file contents' })
      }
    })

    test('stream-start', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'stream-start',
        warnings: [{ type: 'deprecation', message: 'test' }],
      }
      expect(part.type).toBe('stream-start')
      if (part.type === 'stream-start') {
        expect(part.warnings).toHaveLength(1)
      }
    })

    test('response-metadata', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'response-metadata',
        metadata: { model: 'claude-3' },
      }
      expect(part.type).toBe('response-metadata')
    })

    test('finish', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'finish',
        usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
        finishReason: { unified: 'stop' },
      }
      expect(part.type).toBe('finish')
      if (part.type === 'finish') {
        expect(part.usage.inputTokens.total).toBe(10)
      }
    })

    test('file with string data', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'file',
        mediaType: 'image/png',
        data: 'base64encodeddata',
      }
      expect(part.type).toBe('file')
      if (part.type === 'file') {
        expect(part.mediaType).toBe('image/png')
      }
    })

    test('file with Uint8Array data', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'file',
        mediaType: 'image/jpeg',
        data: new Uint8Array([1, 2, 3]),
      }
      expect(part.type).toBe('file')
      if (part.type === 'file') {
        expect(part.data).toBeInstanceOf(Uint8Array)
      }
    })

    test('source with url', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'source',
        sourceType: 'url',
        id: 'src-1',
        title: 'Reference',
        url: 'https://example.com',
      }
      expect(part.type).toBe('source')
      if (part.type === 'source') {
        expect(part.sourceType).toBe('url')
        expect(part.url).toBe('https://example.com')
      }
    })

    test('source with document', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'source',
        sourceType: 'document',
        id: 'src-2',
        title: 'Doc',
        content: 'Document content here',
      }
      expect(part.type).toBe('source')
      if (part.type === 'source') {
        expect(part.sourceType).toBe('document')
        expect(part.content).toBe('Document content here')
      }
    })

    test('error', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'error',
        error: new Error('Something went wrong'),
      }
      expect(part.type).toBe('error')
      if (part.type === 'error') {
        expect(part.error).toBeInstanceOf(Error)
      }
    })

    test('error with unknown type', () => {
      const part: LanguageModelV3StreamPart = {
        type: 'error',
        error: { code: 'UNKNOWN', message: 'Unknown error' },
      }
      expect(part.type).toBe('error')
    })
  })

  describe('type narrowing', () => {
    test('discriminated union narrows correctly', () => {
      const parts: LanguageModelV3StreamPart[] = [
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Hello ' },
        { type: 'text-delta', id: 't1', delta: 'World' },
        { type: 'text-end', id: 't1' },
        { type: 'finish', usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } }, finishReason: { unified: 'stop' } },
      ]

      let textContent = ''
      for (const part of parts) {
        if (part.type === 'text-delta') {
          textContent += part.delta
        }
      }

      expect(textContent).toBe('Hello World')
    })

    test('filter by type', () => {
      const parts: LanguageModelV3StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'test' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'Read', input: '{}' },
        { type: 'finish', usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, finishReason: { unified: 'stop' } },
      ]

      const toolCalls = parts.filter((p): p is Extract<LanguageModelV3StreamPart, { type: 'tool-call' }> => 
        p.type === 'tool-call'
      )

      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0].toolName).toBe('Read')
    })
  })
})
