/**
 * Tests for validator - JSON extraction and schema validation
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { extractJson, parseStructuredOutput } from './validator.js'

describe('extractJson', () => {
  describe('JSON in code blocks', () => {
    test('extracts JSON from ```json code block', () => {
      const text = `Here is the result:
\`\`\`json
{"key": "value"}
\`\`\`
Done.`
      const result = extractJson(text)

      expect(result).toBe('{"key": "value"}')
    })

    test('extracts JSON from ``` code block without language', () => {
      const text = `Output:
\`\`\`
{"name": "test", "count": 42}
\`\`\`
End.`
      const result = extractJson(text)

      expect(result).toBe('{"name": "test", "count": 42}')
    })

    test('handles multiline JSON in code block', () => {
      const text = `\`\`\`json
{
  "items": [
    {"id": 1},
    {"id": 2}
  ]
}
\`\`\``
      const result = extractJson(text)

      expect(result).toContain('"items"')
      expect(result).toContain('"id": 1')
    })

    test('extracts array from code block', () => {
      const text = `\`\`\`json
[1, 2, 3]
\`\`\``
      const result = extractJson(text)

      expect(result).toBe('[1, 2, 3]')
    })
  })

  describe('raw JSON in text', () => {
    test('extracts JSON object from plain text', () => {
      const text = 'The result is {"status": "ok"} and we continue.'
      const result = extractJson(text)

      expect(result).toBe('{"status": "ok"}')
    })

    test('extracts JSON array from plain text', () => {
      const text = 'Here are the items: ["a", "b", "c"] in the list.'
      const result = extractJson(text)

      expect(result).toBe('["a", "b", "c"]')
    })

    test('extracts nested JSON object', () => {
      const text = 'Data: {"outer": {"inner": "value"}}'
      const result = extractJson(text)

      expect(result).toBe('{"outer": {"inner": "value"}}')
    })
  })

  describe('JSON-only content', () => {
    test('returns trimmed content starting with {', () => {
      const text = '  {"pure": "json"}  '
      const result = extractJson(text)

      expect(result).toBe('{"pure": "json"}')
    })

    test('returns trimmed content starting with [', () => {
      const text = '\n[1, 2, 3]\n'
      const result = extractJson(text)

      expect(result).toBe('[1, 2, 3]')
    })
  })

  describe('no JSON found', () => {
    test('returns null when no JSON present', () => {
      const text = 'This is just plain text without any JSON.'
      const result = extractJson(text)

      expect(result).toBeNull()
    })

    test('returns null for empty string', () => {
      const result = extractJson('')

      expect(result).toBeNull()
    })

    test('returns null for whitespace only', () => {
      const result = extractJson('   \n\t  ')

      expect(result).toBeNull()
    })
  })

  describe('edge cases', () => {
    test('handles JSON with special characters', () => {
      const text = '{"message": "hello\\nworld", "path": "C:\\\\Users"}'
      const result = extractJson(text)

      expect(result).toBe('{"message": "hello\\nworld", "path": "C:\\\\Users"}')
    })

    test('extracts first JSON when multiple present', () => {
      const text = '{"first": 1} and {"second": 2}'
      const result = extractJson(text)

      // Should get the first match
      expect(result).toContain('first')
    })

    test('prefers code block over inline JSON', () => {
      const text = `Inline: {"inline": true}
\`\`\`json
{"codeblock": true}
\`\`\``
      const result = extractJson(text)

      expect(result).toBe('{"codeblock": true}')
    })
  })
})

describe('parseStructuredOutput', () => {
  const simpleSchema = z.object({
    name: z.string(),
    age: z.number()
  })

  describe('successful parsing', () => {
    test('parses valid JSON matching schema', () => {
      const output = '{"name": "Alice", "age": 30}'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'Alice', age: 30 })
    })

    test('parses JSON from code block', () => {
      const output = `Here is the data:
\`\`\`json
{"name": "Bob", "age": 25}
\`\`\``
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'Bob', age: 25 })
    })

    test('includes rawOutput on success', () => {
      const output = '{"name": "Test", "age": 1}'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.rawOutput).toBe(output)
    })
  })

  describe('no JSON found', () => {
    test('returns error when no JSON in output', () => {
      const output = 'This has no JSON content at all.'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.success).toBe(false)
      expect(result.error).toContain('No valid JSON found')
    })

    test('includes rawOutput on error', () => {
      const output = 'No JSON here'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.rawOutput).toBe(output)
    })
  })

  describe('invalid JSON syntax', () => {
    test('returns error for malformed JSON', () => {
      const output = '{name: "missing quotes"}'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid JSON syntax')
    })

    test('returns error for unclosed brace', () => {
      const output = '{"name": "test"'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid JSON syntax')
    })

    test('returns error for trailing comma', () => {
      const output = '{"name": "test",}'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid JSON syntax')
    })
  })

  describe('schema validation failures', () => {
    test('returns error for missing required field', () => {
      const output = '{"name": "Alice"}'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Schema validation failed')
    })

    test('returns error for wrong type', () => {
      const output = '{"name": "Alice", "age": "thirty"}'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Schema validation failed')
    })

    test('includes field path in error message', () => {
      const output = '{"name": 123, "age": 30}'
      const result = parseStructuredOutput(output, simpleSchema)

      expect(result.success).toBe(false)
      expect(result.error).toContain('name')
    })

    test('handles nested schema errors', () => {
      const nestedSchema = z.object({
        user: z.object({
          email: z.string().email()
        })
      })
      const output = '{"user": {"email": "invalid"}}'
      const result = parseStructuredOutput(output, nestedSchema)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Schema validation failed')
    })
  })

  describe('complex schemas', () => {
    test('validates array schema', () => {
      const arraySchema = z.array(z.number())
      const output = '[1, 2, 3, 4, 5]'
      const result = parseStructuredOutput(output, arraySchema)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([1, 2, 3, 4, 5])
    })

    test('validates optional fields', () => {
      const optionalSchema = z.object({
        required: z.string(),
        optional: z.string().optional()
      })
      const output = '{"required": "value"}'
      const result = parseStructuredOutput(output, optionalSchema)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ required: 'value' })
    })

    test('validates union types', () => {
      const unionSchema = z.object({
        value: z.union([z.string(), z.number()])
      })

      const stringResult = parseStructuredOutput('{"value": "text"}', unionSchema)
      const numberResult = parseStructuredOutput('{"value": 42}', unionSchema)

      expect(stringResult.success).toBe(true)
      expect(numberResult.success).toBe(true)
    })

    test('validates enum values', () => {
      const enumSchema = z.object({
        status: z.enum(['active', 'inactive', 'pending'])
      })

      const validResult = parseStructuredOutput('{"status": "active"}', enumSchema)
      const invalidResult = parseStructuredOutput('{"status": "unknown"}', enumSchema)

      expect(validResult.success).toBe(true)
      expect(invalidResult.success).toBe(false)
    })
  })
})
