import { describe, test, expect, beforeEach } from 'bun:test'
import { StructuredOutputProcessor } from './structured-output.js'

describe('StructuredOutputProcessor', () => {
  let processor: StructuredOutputProcessor

  beforeEach(() => {
    processor = new StructuredOutputProcessor()
  })

  test('should validate structured output against schema', () => {
    const schema = {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['continue', 'stop', 'retry'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['decision']
    }

    const validOutput = {
      decision: 'continue',
      confidence: 0.8
    }

    const result = processor.validate(validOutput, schema)
    expect(result.valid).toBe(true)
    expect(result.data).toEqual(validOutput)
  })

  test('should reject invalid structured output', () => {
    const schema = {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['continue', 'stop', 'retry'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['decision']
    }

    const invalidOutput = {
      decision: 'invalid_choice',
      confidence: 1.5
    }

    const result = processor.validate(invalidOutput, schema)
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  test('should transform XML to JSON structure', () => {
    const structuredData = {
      decision: 'continue',
      metadata: {
        confidence: '0.95',
        timestamp: '2024-01-01T00:00:00Z'
      },
      issues: ['issue1', 'issue2']
    }

    const transformed = processor.transform(structuredData)

    expect(transformed.decision).toBe('continue')
    expect(transformed.metadata.confidence).toBe(0.95) // Should convert string to number
    expect(transformed.metadata.timestamp).toBe('2024-01-01T00:00:00Z')
    expect(transformed.issues).toEqual(['issue1', 'issue2'])
  })

  test('should apply type coercion', () => {
    const data = {
      count: '42',
      active: 'true',
      score: '3.14',
      name: 'test'
    }

    const transformed = processor.transform(data)

    expect(transformed.count).toBe(42)
    expect(transformed.active).toBe(true)
    expect(transformed.score).toBe(3.14)
    expect(transformed.name).toBe('test')
  })

  test('should handle nested structures', () => {
    const data = {
      outer: {
        inner: {
          value: '123',
          flag: 'false'
        },
        list: ['1', '2', '3']
      }
    }

    const transformed = processor.transform(data)

    expect(transformed.outer.inner.value).toBe(123)
    expect(transformed.outer.inner.flag).toBe(false)
    expect(transformed.outer.list).toEqual([1, 2, 3])
  })

  test('should extract and validate phase output', () => {
    const rawOutput = `
      Analysis complete.

      <structured>
        <decision>continue</decision>
        <next_phase>testing</next_phase>
        <confidence>0.9</confidence>
        <issues_found>2</issues_found>
      </structured>

      Found some minor issues to address.
    `

    const schema = {
      type: 'object',
      properties: {
        decision: { type: 'string' },
        next_phase: { type: 'string' },
        confidence: { type: 'number' },
        issues_found: { type: 'number' }
      }
    }

    const result = processor.processPhaseOutput(rawOutput, schema)

    expect(result.valid).toBe(true)
    expect(result.structured.decision).toBe('continue')
    expect(result.structured.next_phase).toBe('testing')
    expect(result.structured.confidence).toBe(0.9)
    expect(result.structured.issues_found).toBe(2)
    expect(result.raw).toContain('Analysis complete')
  })

  test('should handle missing structured output', () => {
    const rawOutput = 'Just a plain response without XML.'

    const result = processor.processPhaseOutput(rawOutput, {})

    expect(result.valid).toBe(true)
    expect(result.structured).toEqual({})
    expect(result.raw).toBe(rawOutput)
  })

  test('should provide detailed validation errors', () => {
    const data = {
      decision: 'invalid',
      confidence: 'not_a_number'
    }

    const schema = {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['continue', 'stop'] },
        confidence: { type: 'number' }
      }
    }

    const result = processor.validate(data, schema)

    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.some(e => e.includes('decision'))).toBe(true)
    expect(result.errors!.some(e => e.includes('confidence'))).toBe(true)
  })
})