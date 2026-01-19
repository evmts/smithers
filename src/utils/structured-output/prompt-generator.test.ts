/**
 * Tests for prompt-generator.ts - Structured output prompt generation
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { generateStructuredOutputPrompt, generateRetryPrompt } from './prompt-generator.js'

describe('generateStructuredOutputPrompt - basic', () => {
  test('generates prompt with schema description', () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    })

    const prompt = generateStructuredOutputPrompt(schema)

    expect(prompt).toContain('IMPORTANT')
    expect(prompt).toContain('JSON')
  })

  test('includes schema in prompt', () => {
    const schema = z.object({
      status: z.enum(['active', 'inactive']),
    })

    const prompt = generateStructuredOutputPrompt(schema)

    expect(prompt).toContain('object')
  })

  test('includes rules section', () => {
    const schema = z.string()

    const prompt = generateStructuredOutputPrompt(schema)

    expect(prompt).toContain('Rules')
  })
})

describe('generateRetryPrompt - basic', () => {
  test('includes original output', () => {
    const output = '{"invalid": true}'
    const error = 'Missing required field'

    const prompt = generateRetryPrompt(output, error)

    expect(prompt).toContain('{"invalid": true}')
  })

  test('includes error message', () => {
    const output = '{}'
    const error = 'Missing field: name'

    const prompt = generateRetryPrompt(output, error)

    expect(prompt).toContain('Missing field: name')
  })

  test('truncates long output', () => {
    const output = 'x'.repeat(2000)
    const error = 'Error'

    const prompt = generateRetryPrompt(output, error)

    expect(prompt).toContain('truncated')
    expect(prompt.length).toBeLessThan(2500)
  })
})

// ============================================================================
// generateStructuredOutputPrompt - edge cases
// ============================================================================

describe('generateStructuredOutputPrompt - edge cases', () => {
  test('handles empty object schema', () => {
    const schema = z.object({})
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('object')
  })

  test('handles deeply nested schema', () => {
    const schema = z.object({
      level1: z.object({
        level2: z.object({
          level3: z.object({
            value: z.string()
          })
        })
      })
    })
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('object')
    expect(prompt.length).toBeGreaterThan(100)
  })

  test('handles array schema', () => {
    const schema = z.array(z.string())
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('array')
    expect(prompt).toContain('string')
  })

  test('handles union schema', () => {
    const schema = z.union([z.string(), z.number()])
    const prompt = generateStructuredOutputPrompt(schema)
    
    // Should contain info about both types
    expect(prompt.length).toBeGreaterThan(50)
  })

  test('handles enum schema', () => {
    const schema = z.enum(['red', 'green', 'blue'])
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('JSON')
  })

  test('handles optional fields in schema', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.number().optional()
    })
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('required')
  })

  test('handles nullable fields in schema', () => {
    const schema = z.object({
      value: z.string().nullable()
    })
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('value')
  })

  test('handles schema with constraints (min, max, etc)', () => {
    const schema = z.object({
      name: z.string().min(1).max(100),
      age: z.number().min(0).max(150)
    })
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('name')
    expect(prompt).toContain('age')
  })

  test('includes proper markdown formatting', () => {
    const schema = z.object({ id: z.number() })
    const prompt = generateStructuredOutputPrompt(schema)
    
    // Should have code block markers
    expect(prompt).toContain('```')
  })

  test('includes code block for schema', () => {
    const schema = z.object({ value: z.boolean() })
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('```json')
    expect(prompt).toContain('```')
  })

  test('handles array of objects schema', () => {
    const schema = z.array(z.object({
      id: z.number(),
      name: z.string()
    }))
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('array')
  })

  test('handles record schema', () => {
    const schema = z.record(z.string())
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('JSON')
  })

  test('handles tuple schema', () => {
    const schema = z.tuple([z.string(), z.number()])
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('JSON')
  })

  test('handles intersection schema', () => {
    const schema = z.intersection(
      z.object({ a: z.string() }),
      z.object({ b: z.number() })
    )
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('JSON')
  })
})

// ============================================================================
// generateRetryPrompt - edge cases
// ============================================================================

describe('generateRetryPrompt - edge cases', () => {
  test('handles empty original output', () => {
    const prompt = generateRetryPrompt('', 'Some error')
    
    expect(prompt).toContain('previous response')
    expect(prompt).toContain('Some error')
    expect(prompt).toContain('corrected response')
  })

  test('handles empty error message', () => {
    const prompt = generateRetryPrompt('{"test": 1}', '')
    
    expect(prompt).toContain('{"test": 1}')
    expect(prompt).toContain('Validation error')
  })

  test('handles output exactly at 1000 characters', () => {
    const output = 'x'.repeat(1000)
    const prompt = generateRetryPrompt(output, 'error')
    
    // Should NOT be truncated at exactly 1000
    expect(prompt).not.toContain('truncated')
  })

  test('handles output at 999 characters (no truncation)', () => {
    const output = 'x'.repeat(999)
    const prompt = generateRetryPrompt(output, 'error')
    
    expect(prompt).not.toContain('truncated')
  })

  test('handles output at 1001 characters (truncation)', () => {
    const output = 'x'.repeat(1001)
    const prompt = generateRetryPrompt(output, 'error')
    
    expect(prompt).toContain('truncated')
  })

  test('handles output with special characters', () => {
    const output = '{"value": "hello\\nworld", "path": "C:\\\\Users"}'
    const prompt = generateRetryPrompt(output, 'error')
    
    expect(prompt).toContain('hello\\nworld')
  })

  test('handles output with code blocks', () => {
    const output = '```json\n{"test": 1}\n```'
    const prompt = generateRetryPrompt(output, 'error')
    
    expect(prompt).toContain('{"test": 1}')
  })

  test('handles error with newlines', () => {
    const error = `First error
Second error
Third error`
    const prompt = generateRetryPrompt('{}', error)
    
    expect(prompt).toContain('First error')
    expect(prompt).toContain('Second error')
    expect(prompt).toContain('Third error')
  })

  test('handles error with special markdown characters', () => {
    const error = 'Error: `field` is **required** and _must_ be > 0'
    const prompt = generateRetryPrompt('{}', error)
    
    expect(prompt).toContain('`field`')
    expect(prompt).toContain('**required**')
  })

  test('handles multiline original output', () => {
    const output = `{
  "name": "test",
  "items": [1, 2, 3]
}`
    const prompt = generateRetryPrompt(output, 'error')
    
    expect(prompt).toContain('"name": "test"')
    expect(prompt).toContain('"items"')
  })

  test('handles output with unicode characters', () => {
    const output = '{"message": "Hello 日本語 🎉"}'
    const prompt = generateRetryPrompt(output, 'error')
    
    expect(prompt).toContain('日本語')
    expect(prompt).toContain('🎉')
  })

  test('preserves backticks in output properly', () => {
    const output = '{"code": "`const x = 1`"}'
    const prompt = generateRetryPrompt(output, 'error')
    
    expect(prompt).toContain('`const x = 1`')
  })

  test('handles very long error message', () => {
    const error = 'Error: '.repeat(100)
    const prompt = generateRetryPrompt('{}', error)
    
    expect(prompt).toContain('Error:')
    // Should still include the error, even if long
  })

  test('formats retry prompt with clear sections', () => {
    const prompt = generateRetryPrompt('{"a":1}', 'missing field b')
    
    expect(prompt).toContain('previous')
    expect(prompt).toContain('Validation error')
    expect(prompt).toContain('corrected')
  })
})

// ============================================================================
// Integration tests
// ============================================================================

describe('prompt generation integration', () => {
  test('generated prompt is suitable for LLM input', () => {
    const schema = z.object({
      answer: z.string(),
      confidence: z.number().min(0).max(1)
    })
    const prompt = generateStructuredOutputPrompt(schema)
    
    // Should be reasonably sized
    expect(prompt.length).toBeLessThan(5000)
    // Should be valid text
    expect(typeof prompt).toBe('string')
    // Should contain actionable instructions
    expect(prompt).toContain('IMPORTANT')
    expect(prompt).toContain('Rules')
  })

  test('retry prompt provides clear guidance', () => {
    const original = '{"answer": 123}'
    const error = 'answer: Expected string, received number'
    const prompt = generateRetryPrompt(original, error)
    
    // Should reference the original
    expect(prompt).toContain('123')
    // Should explain the error
    expect(prompt).toContain('Expected string')
    // Should request correction
    expect(prompt).toContain('corrected')
  })
})
