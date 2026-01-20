import { describe, test, expect } from 'bun:test'
import type { AgentResult } from '../components/agents/types.js'
import { extractJsonMiddleware } from './extract-json.js'

function makeResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    output: 'ok',
    structured: undefined,
    tokensUsed: { input: 10, output: 5 },
    turnsUsed: 1,
    stopReason: 'completed',
    durationMs: 100,
    ...overrides,
  }
}

describe('extractJsonMiddleware', () => {
  test('extracts JSON from markdown code block', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'Here is the result:\n```json\n{"key":"value"}\n```' })
    )

    expect(result?.structured).toEqual({ key: 'value' })
  })

  test('extracts JSON from code block without language tag', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'Result:\n```\n{"foo":"bar"}\n```' })
    )

    expect(result?.structured).toEqual({ foo: 'bar' })
  })

  test('extracts inline JSON object', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'The result is {"status":"ok","count":42}.' })
    )

    expect(result?.structured).toEqual({ status: 'ok', count: 42 })
  })

  test('extracts inline JSON array', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'Items: [1, 2, 3]' })
    )

    expect(result?.structured).toEqual([1, 2, 3])
  })

  test('handles nested JSON objects', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: '{"outer":{"inner":{"deep":"value"}}}' })
    )

    expect(result?.structured).toEqual({ outer: { inner: { deep: 'value' } } })
  })

  test('handles JSON with nested arrays', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: '{"items":[{"name":"a"},{"name":"b"}]}' })
    )

    expect(result?.structured).toEqual({ items: [{ name: 'a' }, { name: 'b' }] })
  })

  test('handles invalid JSON gracefully', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'Here is:\n```json\n{invalid}\n```' })
    )

    expect(result?.structured).toBeUndefined()
  })

  test('handles output with no JSON', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'Just plain text without any JSON.' })
    )

    expect(result?.structured).toBeUndefined()
    expect(result?.output).toBe('Just plain text without any JSON.')
  })

  test('does not override existing structured data', () => {
    const middleware = extractJsonMiddleware()
    const existingStructured = { already: 'set' }
    const result = middleware.transformResult?.(
      makeResult({
        output: '{"new":"data"}',
        structured: existingStructured,
      })
    )

    expect(result?.structured).toEqual(existingStructured)
  })

  test('updates output with extracted JSON text', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'Result:\n```json\n{"key":"value"}\n```\nDone.' })
    )

    expect(result?.output).toBe('{"key":"value"}')
  })

  test('applies custom transform function', () => {
    const middleware = extractJsonMiddleware({
      transform: (text) => text.replace(/foo/g, 'bar'),
    })
    const result = middleware.transformResult?.(
      makeResult({ output: '{"name":"foo"}' })
    )

    expect(result?.structured).toEqual({ name: 'bar' })
    expect(result?.output).toBe('{"name":"bar"}')
  })

  test('extracts first valid JSON when multiple present', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'First {"a":1} and second {"b":2}' })
    )

    expect(result?.structured).toEqual({ a: 1 })
  })

  test('handles JSON with escaped quotes', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: '{"message":"He said \\"hello\\""}' })
    )

    expect(result?.structured).toEqual({ message: 'He said "hello"' })
  })

  test('handles JSON with unicode characters', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: '{"emoji":"\\u2764"}' })
    )

    expect(result?.structured).toEqual({ emoji: '\u2764' })
  })

  test('handles multiline JSON', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({
        output: `{
  "name": "test",
  "items": [
    1,
    2,
    3
  ]
}`,
      })
    )

    expect(result?.structured).toEqual({ name: 'test', items: [1, 2, 3] })
  })

  test('handles empty JSON object', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: '{}' })
    )

    expect(result?.structured).toEqual({})
  })

  test('handles empty JSON array', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: '[]' })
    )

    expect(result?.structured).toEqual([])
  })

  test('handles JSON with null values', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: '{"value":null}' })
    )

    expect(result?.structured).toEqual({ value: null })
  })

  test('handles JSON with boolean values', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: '{"active":true,"deleted":false}' })
    )

    expect(result?.structured).toEqual({ active: true, deleted: false })
  })

  test('preserves other result properties', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({
        output: '{"key":"value"}',
        tokensUsed: { input: 100, output: 50 },
        turnsUsed: 3,
        stopReason: 'completed',
        durationMs: 500,
      })
    )

    expect(result?.tokensUsed).toEqual({ input: 100, output: 50 })
    expect(result?.turnsUsed).toBe(3)
    expect(result?.stopReason).toBe('completed')
    expect(result?.durationMs).toBe(500)
  })

  test('has correct middleware name', () => {
    const middleware = extractJsonMiddleware()
    expect(middleware.name).toBe('extractJson')
  })
})
