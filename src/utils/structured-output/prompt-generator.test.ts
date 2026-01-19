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
// Missing Test TODOs
// ============================================================================

describe('generateStructuredOutputPrompt - edge cases', () => {
  test.todo('handles empty object schema')
  test.todo('handles deeply nested schema')
  test.todo('handles array schema')
  test.todo('handles union schema')
  test.todo('handles enum schema')
  test.todo('handles optional fields in schema')
  test.todo('handles nullable fields in schema')
  test.todo('handles schema with descriptions')
  test.todo('handles schema with examples')
  test.todo('handles very large schema (100+ properties)')
  test.todo('handles schema with constraints (min, max, etc)')
  test.todo('includes proper markdown formatting')
  test.todo('includes code block for schema')
})

describe('generateRetryPrompt - edge cases', () => {
  test.todo('handles empty original output')
  test.todo('handles empty error message')
  test.todo('handles output exactly at 1000 characters')
  test.todo('handles output at 999 characters (no truncation)')
  test.todo('handles output at 1001 characters (truncation)')
  test.todo('handles output with special characters')
  test.todo('handles output with code blocks')
  test.todo('handles error with newlines')
  test.todo('handles error with special markdown characters')
  test.todo('handles multiline original output')
  test.todo('handles output with unicode characters')
  test.todo('preserves backticks in output properly')
})
