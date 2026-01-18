/**
 * Tests for zod-converter - Zod to JSON Schema conversion
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { zodToJsonSchema, convertZodType, schemaToPromptDescription } from './zod-converter.js'

describe('zodToJsonSchema', () => {
  test('converts simple string schema', () => {
    const schema = z.string()
    const result = zodToJsonSchema(schema)

    expect(result.type).toBe('string')
  })

  test('converts simple number schema', () => {
    const schema = z.number()
    const result = zodToJsonSchema(schema)

    expect(result.type).toBe('number')
  })

  test('converts simple boolean schema', () => {
    const schema = z.boolean()
    const result = zodToJsonSchema(schema)

    expect(result.type).toBe('boolean')
  })

  test('removes $schema from output', () => {
    const schema = z.object({ name: z.string() })
    const result = zodToJsonSchema(schema)

    expect(result.$schema).toBeUndefined()
  })
})

describe('convertZodType', () => {
  describe('primitive types', () => {
    test('converts string type', () => {
      const schema = z.string()
      const result = convertZodType(schema)

      expect(result.type).toBe('string')
    })

    test('converts number type', () => {
      const schema = z.number()
      const result = convertZodType(schema)

      expect(result.type).toBe('number')
    })

    test('converts boolean type', () => {
      const schema = z.boolean()
      const result = convertZodType(schema)

      expect(result.type).toBe('boolean')
    })

    test('converts null type', () => {
      const schema = z.null()
      const result = convertZodType(schema)

      expect(result.type).toBe('null')
    })
  })

  describe('object types', () => {
    test('converts simple object', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      })
      const result = convertZodType(schema)

      expect(result.type).toBe('object')
      expect(result.properties).toBeDefined()
      expect(result.properties.name.type).toBe('string')
      expect(result.properties.age.type).toBe('number')
    })

    test('includes required fields', () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional()
      })
      const result = convertZodType(schema)

      expect(result.required).toContain('required')
      // Optional fields should not be in required
      if (result.required) {
        expect(result.required).not.toContain('optional')
      }
    })

    test('converts nested objects', () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string()
          })
        })
      })
      const result = convertZodType(schema)

      expect(result.type).toBe('object')
      expect(result.properties.user.type).toBe('object')
      expect(result.properties.user.properties.profile.type).toBe('object')
    })
  })

  describe('array types', () => {
    test('converts array of strings', () => {
      const schema = z.array(z.string())
      const result = convertZodType(schema)

      expect(result.type).toBe('array')
      expect(result.items.type).toBe('string')
    })

    test('converts array of objects', () => {
      const schema = z.array(z.object({ id: z.number() }))
      const result = convertZodType(schema)

      expect(result.type).toBe('array')
      expect(result.items.type).toBe('object')
      expect(result.items.properties.id.type).toBe('number')
    })

    test('converts array of numbers', () => {
      const schema = z.array(z.number())
      const result = convertZodType(schema)

      expect(result.type).toBe('array')
      expect(result.items.type).toBe('number')
    })
  })

  describe('optional and nullable', () => {
    test('converts optional type', () => {
      const schema = z.string().optional()
      const result = convertZodType(schema)

      // Should unwrap to the inner type
      expect(result.type).toBe('string')
    })

    test('converts nullable type to oneOf', () => {
      const schema = z.string().nullable()
      const result = convertZodType(schema)

      expect(result.oneOf).toBeDefined()
      const types = result.oneOf.map((s: any) => s.type)
      expect(types).toContain('string')
      expect(types).toContain('null')
    })
  })

  describe('enum types', () => {
    test('converts enum schema via zodToJsonSchema', () => {
      // Use the main function which uses Zod's built-in toJSONSchema
      const schema = z.enum(['a', 'b', 'c'])
      const result = zodToJsonSchema(schema)

      // Zod 4's toJSONSchema() returns enum values
      expect(result.enum || result.anyOf).toBeDefined()
    })
  })

  describe('literal types', () => {
    test('converts string literal via zodToJsonSchema', () => {
      const schema = z.literal('fixed')
      const result = zodToJsonSchema(schema)

      // Zod 4's toJSONSchema() handles literals
      expect(result.const === 'fixed' || result.type === 'string').toBe(true)
    })

    test('converts number literal via zodToJsonSchema', () => {
      const schema = z.literal(42)
      const result = zodToJsonSchema(schema)

      expect(result.const === 42 || result.type === 'number').toBe(true)
    })

    test('converts boolean literal via zodToJsonSchema', () => {
      const schema = z.literal(true)
      const result = zodToJsonSchema(schema)

      expect(result.const === true || result.type === 'boolean').toBe(true)
    })
  })

  describe('union types', () => {
    test('converts union to oneOf', () => {
      const schema = z.union([z.string(), z.number()])
      const result = convertZodType(schema)

      expect(result.oneOf).toBeDefined()
      expect(result.oneOf).toHaveLength(2)
      const types = result.oneOf.map((s: any) => s.type)
      expect(types).toContain('string')
      expect(types).toContain('number')
    })

    test('converts union of objects', () => {
      const schema = z.union([
        z.object({ type: z.literal('a'), value: z.string() }),
        z.object({ type: z.literal('b'), count: z.number() })
      ])
      const result = convertZodType(schema)

      expect(result.oneOf).toBeDefined()
      expect(result.oneOf).toHaveLength(2)
    })
  })

  describe('fallback behavior', () => {
    test('returns empty object for unknown types', () => {
      // Create a schema type that doesn't match known patterns
      const unknownSchema = { _def: { type: 'unknown_type' } } as any
      const result = convertZodType(unknownSchema)

      expect(result).toEqual({})
    })
  })
})

describe('schemaToPromptDescription', () => {
  test('returns formatted JSON string', () => {
    const schema = z.object({
      name: z.string(),
      value: z.number()
    })
    const result = schemaToPromptDescription(schema)

    // Should be valid JSON
    expect(() => JSON.parse(result)).not.toThrow()

    // Should be formatted with indentation
    expect(result).toContain('\n')
    expect(result).toContain('  ')
  })

  test('includes type information', () => {
    const schema = z.object({
      items: z.array(z.string())
    })
    const result = schemaToPromptDescription(schema)
    const parsed = JSON.parse(result)

    expect(parsed.type).toBe('object')
    expect(parsed.properties.items.type).toBe('array')
  })

  test('handles complex nested schema', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        tags: z.array(z.string()),
        settings: z.object({
          theme: z.enum(['light', 'dark'])
        }).optional()
      })
    })
    const result = schemaToPromptDescription(schema)

    // Should not throw
    expect(() => JSON.parse(result)).not.toThrow()

    const parsed = JSON.parse(result)
    expect(parsed.properties.user.properties.name.type).toBe('string')
  })
})
