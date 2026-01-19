/**
 * Tests for utils module - shared utilities
 */

import { describe, test, expect } from 'bun:test'
import { uuid, now, parseJson } from './utils.js'

describe('utils', () => {
  describe('uuid', () => {
    test('returns valid UUID v4 format', () => {
      const id = uuid()
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      expect(id).toMatch(uuidRegex)
    })

    test('returns unique values on each call', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(uuid())
      }
      expect(ids.size).toBe(100)
    })

    test('returns string type', () => {
      expect(typeof uuid()).toBe('string')
    })

    test('returns 36 character string', () => {
      expect(uuid().length).toBe(36)
    })

    test('returns correct UUID structure with hyphens', () => {
      const id = uuid()
      const parts = id.split('-')
      expect(parts).toHaveLength(5)
      expect(parts[0].length).toBe(8)
      expect(parts[1].length).toBe(4)
      expect(parts[2].length).toBe(4)
      expect(parts[3].length).toBe(4)
      expect(parts[4].length).toBe(12)
    })
  })

  describe('now', () => {
    test('returns ISO8601 formatted string', () => {
      const timestamp = now()
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      expect(timestamp).toMatch(isoRegex)
    })

    test('returns current timestamp', () => {
      const before = Date.now()
      const timestamp = now()
      const after = Date.now()
      const parsed = new Date(timestamp).getTime()
      expect(parsed).toBeGreaterThanOrEqual(before)
      expect(parsed).toBeLessThanOrEqual(after)
    })

    test('returns string type', () => {
      expect(typeof now()).toBe('string')
    })

    test('returns parseable date string', () => {
      const timestamp = now()
      const date = new Date(timestamp)
      expect(date.toString()).not.toBe('Invalid Date')
      expect(date.getTime()).not.toBeNaN()
    })

    test('includes timezone information', () => {
      const timestamp = now()
      expect(timestamp.endsWith('Z')).toBe(true)
    })
  })

  describe('parseJson', () => {
    test('parses valid JSON string', () => {
      const result = parseJson('"hello"', 'default')
      expect(result).toBe('hello')
    })

    test('parses JSON object', () => {
      const result = parseJson('{"a":1,"b":2}', {})
      expect(result).toEqual({ a: 1, b: 2 })
    })

    test('parses JSON array', () => {
      const result = parseJson('[1,2,3]', [])
      expect(result).toEqual([1, 2, 3])
    })

    test('parses JSON number', () => {
      const result = parseJson('42', 0)
      expect(result).toBe(42)
    })

    test('parses JSON boolean', () => {
      expect(parseJson('true', false)).toBe(true)
      expect(parseJson('false', true)).toBe(false)
    })

    test('parses JSON null', () => {
      const result = parseJson<null | string>('null', 'default')
      expect(result).toBe(null)
    })

    test('returns defaultValue for null input', () => {
      const result = parseJson(null, 'default')
      expect(result).toBe('default')
    })

    test('returns defaultValue for undefined input', () => {
      const result = parseJson(undefined, 'default')
      expect(result).toBe('default')
    })

    test('returns defaultValue for empty string', () => {
      const result = parseJson('', 'default')
      expect(result).toBe('default')
    })

    test('returns defaultValue for invalid JSON', () => {
      const result = parseJson('not valid json', 'default')
      expect(result).toBe('default')
    })

    test('returns defaultValue for malformed JSON', () => {
      const result = parseJson('{a:1}', 'default')
      expect(result).toBe('default')
    })

    test('handles nested objects', () => {
      const result = parseJson('{"a":{"b":{"c":1}}}', {})
      expect(result).toEqual({ a: { b: { c: 1 } } })
    })

    test('handles deeply nested structures', () => {
      const deep = { l1: { l2: { l3: { l4: { l5: 'deep' } } } } }
      const result = parseJson(JSON.stringify(deep), {})
      expect(result).toEqual(deep)
    })

    test('handles unicode in JSON', () => {
      const result = parseJson('{"emoji":"🚀","chinese":"中文"}', {})
      expect(result).toEqual({ emoji: '🚀', chinese: '中文' })
    })

    test('handles special characters in JSON', () => {
      const result = parseJson('{"tab":"\\t","newline":"\\n","quote":"\\""}', {})
      expect(result).toEqual({ tab: '\t', newline: '\n', quote: '"' })
    })

    test('handles escaped characters in JSON', () => {
      const result = parseJson('{"path":"C:\\\\Users\\\\test"}', {})
      expect(result).toEqual({ path: 'C:\\Users\\test' })
    })

    test('handles very large JSON strings', () => {
      const large = { data: 'x'.repeat(10000) }
      const result = parseJson(JSON.stringify(large), {})
      expect(result).toEqual(large)
    })

    test('handles very large JSON arrays', () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => i)
      const input = JSON.stringify(largeArray)
      const result = parseJson(input, [])
      expect(result).toEqual(largeArray)
    })

    test('does not throw for invalid JSON', () => {
      expect(() => parseJson('invalid', 'default')).not.toThrow()
    })

    test('catches and handles parse errors', () => {
      const result = parseJson('{"unclosed": "brace"', {})
      expect(result).toEqual({})
    })

    test('preserves type of default value on failure', () => {
      const objDefault = { fallback: true }
      const arrDefault = [1, 2, 3]
      const numDefault = 42
      
      expect(parseJson('invalid', objDefault)).toBe(objDefault)
      expect(parseJson('invalid', arrDefault)).toBe(arrDefault)
      expect(parseJson('invalid', numDefault)).toBe(numDefault)
    })
  })
})
