import { describe, it, expect } from 'bun:test'
import { parseProps } from '../src/cli/props.js'

/**
 * Props Parsing Unit Tests
 *
 * Tests the parseProps function used to parse --props CLI arguments:
 * - Valid JSON object parsing
 * - Invalid JSON handling
 * - Non-object value rejection
 * - Edge cases (null, arrays, primitives)
 */
describe('parseProps', () => {
  describe('undefined input', () => {
    it('returns undefined when no value provided', () => {
      const result = parseProps(undefined)
      expect(result).toBeUndefined()
    })
  })

  describe('valid JSON objects', () => {
    it('parses empty object', () => {
      const result = parseProps('{}')
      expect(result).toEqual({})
    })

    it('parses object with string value', () => {
      const result = parseProps('{"name": "test"}')
      expect(result).toEqual({ name: 'test' })
    })

    it('parses object with number value', () => {
      const result = parseProps('{"count": 42}')
      expect(result).toEqual({ count: 42 })
    })

    it('parses object with boolean values', () => {
      const result = parseProps('{"enabled": true, "disabled": false}')
      expect(result).toEqual({ enabled: true, disabled: false })
    })

    it('parses object with null value', () => {
      const result = parseProps('{"value": null}')
      expect(result).toEqual({ value: null })
    })

    it('parses object with array value', () => {
      const result = parseProps('{"items": [1, 2, 3]}')
      expect(result).toEqual({ items: [1, 2, 3] })
    })

    it('parses object with nested object', () => {
      const result = parseProps('{"user": {"name": "Alice", "age": 30}}')
      expect(result).toEqual({ user: { name: 'Alice', age: 30 } })
    })

    it('parses object with multiple properties', () => {
      const result = parseProps('{"a": 1, "b": "two", "c": true, "d": null}')
      expect(result).toEqual({ a: 1, b: 'two', c: true, d: null })
    })

    it('parses object with deeply nested structure', () => {
      const json = '{"level1": {"level2": {"level3": {"value": "deep"}}}}'
      const result = parseProps(json)
      expect(result).toEqual({ level1: { level2: { level3: { value: 'deep' } } } })
    })

    it('parses object with array of objects', () => {
      const json = '{"users": [{"name": "Alice"}, {"name": "Bob"}]}'
      const result = parseProps(json)
      expect(result).toEqual({ users: [{ name: 'Alice' }, { name: 'Bob' }] })
    })

    it('parses object with special characters in string values', () => {
      const result = parseProps('{"message": "Hello\\nWorld", "path": "/foo/bar"}')
      expect(result).toEqual({ message: 'Hello\nWorld', path: '/foo/bar' })
    })

    it('parses object with unicode characters', () => {
      const result = parseProps('{"emoji": "🚀", "chinese": "你好"}')
      expect(result).toEqual({ emoji: '🚀', chinese: '你好' })
    })

    it('parses object with empty string value', () => {
      const result = parseProps('{"empty": ""}')
      expect(result).toEqual({ empty: '' })
    })

    it('parses object with numeric string keys', () => {
      const result = parseProps('{"123": "numeric key"}')
      expect(result).toEqual({ '123': 'numeric key' })
    })
  })

  describe('invalid JSON syntax', () => {
    it('throws for malformed JSON - missing closing brace', () => {
      expect(() => parseProps('{"name": "test"')).toThrow('Invalid --props value')
    })

    it('throws for malformed JSON - missing quotes', () => {
      expect(() => parseProps('{name: "test"}')).toThrow('Invalid --props value')
    })

    it('throws for malformed JSON - trailing comma', () => {
      expect(() => parseProps('{"name": "test",}')).toThrow('Invalid --props value')
    })

    it('throws for malformed JSON - single quotes', () => {
      expect(() => parseProps("{'name': 'test'}")).toThrow('Invalid --props value')
    })

    it('throws for completely invalid JSON', () => {
      expect(() => parseProps('not json at all')).toThrow('Invalid --props value')
    })

    it('throws for empty string', () => {
      expect(() => parseProps('')).toThrow('Invalid --props value')
    })

    it('throws for whitespace only', () => {
      expect(() => parseProps('   ')).toThrow('Invalid --props value')
    })
  })

  describe('non-object values', () => {
    it('throws for null', () => {
      expect(() => parseProps('null')).toThrow('Props must be a JSON object')
    })

    it('throws for array', () => {
      expect(() => parseProps('[1, 2, 3]')).toThrow('Props must be a JSON object')
    })

    it('throws for empty array', () => {
      expect(() => parseProps('[]')).toThrow('Props must be a JSON object')
    })

    it('throws for string', () => {
      expect(() => parseProps('"hello"')).toThrow('Props must be a JSON object')
    })

    it('throws for number', () => {
      expect(() => parseProps('42')).toThrow('Props must be a JSON object')
    })

    it('throws for boolean true', () => {
      expect(() => parseProps('true')).toThrow('Props must be a JSON object')
    })

    it('throws for boolean false', () => {
      expect(() => parseProps('false')).toThrow('Props must be a JSON object')
    })

    it('throws for array of objects', () => {
      expect(() => parseProps('[{"name": "test"}]')).toThrow('Props must be a JSON object')
    })
  })

  describe('edge cases', () => {
    it('handles whitespace around valid JSON', () => {
      const result = parseProps('  {"name": "test"}  ')
      expect(result).toEqual({ name: 'test' })
    })

    it('handles newlines in JSON', () => {
      const json = `{
        "name": "test",
        "value": 123
      }`
      const result = parseProps(json)
      expect(result).toEqual({ name: 'test', value: 123 })
    })

    it('handles tabs in JSON', () => {
      const result = parseProps('{\t"name":\t"test"\t}')
      expect(result).toEqual({ name: 'test' })
    })

    it('handles large numbers', () => {
      const result = parseProps('{"bigNumber": 9007199254740991}')
      expect(result).toEqual({ bigNumber: 9007199254740991 })
    })

    it('handles negative numbers', () => {
      const result = parseProps('{"negative": -42}')
      expect(result).toEqual({ negative: -42 })
    })

    it('handles floating point numbers', () => {
      const result = parseProps('{"pi": 3.14159}')
      expect(result).toEqual({ pi: 3.14159 })
    })

    it('handles scientific notation', () => {
      const result = parseProps('{"sci": 1.23e10}')
      expect(result).toEqual({ sci: 1.23e10 })
    })

    it('preserves key order (in modern JS engines)', () => {
      const result = parseProps('{"z": 1, "a": 2, "m": 3}')
      const keys = Object.keys(result!)
      expect(keys).toEqual(['z', 'a', 'm'])
    })

    it('handles escaped quotes in strings', () => {
      const result = parseProps('{"quote": "He said \\"hello\\""}')
      expect(result).toEqual({ quote: 'He said "hello"' })
    })

    it('handles escaped backslashes', () => {
      const result = parseProps('{"path": "C:\\\\Users\\\\test"}')
      expect(result).toEqual({ path: 'C:\\Users\\test' })
    })
  })

  describe('error message quality', () => {
    it('includes helpful context in error message', () => {
      try {
        parseProps('not valid')
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect((error as Error).message).toContain('Invalid --props value')
      }
    })

    it('includes original error message for syntax errors', () => {
      try {
        parseProps('{invalid}')
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('Invalid --props value')
        // Should mention something about the parse error
        expect(message.length).toBeGreaterThan(20)
      }
    })
  })
})
