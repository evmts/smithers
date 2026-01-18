import { test, expect, describe } from 'bun:test'
import { z } from 'zod'
import {
  zodToJsonSchema,
  schemaToPromptDescription,
  extractJson,
  parseStructuredOutput,
  generateStructuredOutputPrompt,
  generateRetryPrompt,
} from './structured-output'

describe('zodToJsonSchema', () => {
  test('converts simple object schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    })

    const result = zodToJsonSchema(schema)

    expect(result.type).toBe('object')
    expect(result.properties.name.type).toBe('string')
    expect(result.properties.age.type).toBe('number')
    expect(result.required).toContain('name')
    expect(result.required).toContain('age')
  })

  test('handles optional fields', () => {
    const schema = z.object({
      name: z.string(),
      nickname: z.string().optional(),
    })

    const result = zodToJsonSchema(schema)

    expect(result.required).toContain('name')
    expect(result.required).not.toContain('nickname')
  })

  test('converts array schema', () => {
    const schema = z.array(z.string())

    const result = zodToJsonSchema(schema)

    expect(result.type).toBe('array')
    expect(result.items.type).toBe('string')
  })

  test('converts enum schema', () => {
    const schema = z.enum(['red', 'green', 'blue'])

    const result = zodToJsonSchema(schema)

    expect(result.enum).toEqual(['red', 'green', 'blue'])
  })

  test('converts boolean schema', () => {
    const schema = z.boolean()

    const result = zodToJsonSchema(schema)

    expect(result.type).toBe('boolean')
  })

  test('converts nested object schema', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        email: z.string(),
      }),
      active: z.boolean(),
    })

    const result = zodToJsonSchema(schema)

    expect(result.type).toBe('object')
    expect(result.properties.user.type).toBe('object')
    expect(result.properties.user.properties.name.type).toBe('string')
    expect(result.properties.active.type).toBe('boolean')
  })

  test('handles string constraints', () => {
    const schema = z.string().min(1).max(100).email()

    const result = zodToJsonSchema(schema)

    expect(result.type).toBe('string')
    expect(result.minLength).toBe(1)
    expect(result.maxLength).toBe(100)
    expect(result.format).toBe('email')
  })

  test('handles number constraints', () => {
    const schema = z.number().int()

    const result = zodToJsonSchema(schema)

    // Zod 4 uses 'integer' type for .int()
    expect(result.type).toBe('integer')
  })

  test('handles nullable types', () => {
    const schema = z.string().nullable()

    const result = zodToJsonSchema(schema)

    // Zod 4 uses anyOf for nullable types
    expect(result.anyOf).toBeDefined()
    expect(result.anyOf).toHaveLength(2)
  })

  test('handles union types', () => {
    const schema = z.union([z.string(), z.number()])

    const result = zodToJsonSchema(schema)

    // Zod 4 uses anyOf for unions
    expect(result.anyOf).toBeDefined()
    expect(result.anyOf).toHaveLength(2)
  })
})

describe('extractJson', () => {
  test('extracts JSON from code block', () => {
    const text = `Here is the response:

\`\`\`json
{"name": "John", "age": 30}
\`\`\`

That's the data.`

    const result = extractJson(text)

    expect(result).toBe('{"name": "John", "age": 30}')
  })

  test('extracts JSON without code block markers', () => {
    const text = `Some text before {"key": "value"} some text after`

    const result = extractJson(text)

    expect(result).toBe('{"key": "value"}')
  })

  test('extracts array JSON', () => {
    const text = `The list: [1, 2, 3]`

    const result = extractJson(text)

    expect(result).toBe('[1, 2, 3]')
  })

  test('handles raw JSON input', () => {
    const text = '{"name": "test"}'

    const result = extractJson(text)

    expect(result).toBe('{"name": "test"}')
  })

  test('returns null for non-JSON text', () => {
    const text = 'This is just plain text without any JSON'

    const result = extractJson(text)

    expect(result).toBeNull()
  })

  test('extracts JSON from markdown code block', () => {
    const text = `\`\`\`
{"data": true}
\`\`\``

    const result = extractJson(text)

    expect(result).toBe('{"data": true}')
  })
})

describe('parseStructuredOutput', () => {
  test('successfully parses valid output', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    })

    const output = '{"name": "John", "age": 30}'
    const result = parseStructuredOutput(output, schema)

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ name: 'John', age: 30 })
  })

  test('fails for missing required field', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    })

    const output = '{"name": "John"}'
    const result = parseStructuredOutput(output, schema)

    expect(result.success).toBe(false)
    expect(result.error).toContain('age')
  })

  test('fails for invalid JSON', () => {
    const schema = z.object({
      name: z.string(),
    })

    const output = 'not valid json'
    const result = parseStructuredOutput(output, schema)

    expect(result.success).toBe(false)
    expect(result.error).toContain('No valid JSON found')
  })

  test('fails for wrong type', () => {
    const schema = z.object({
      count: z.number(),
    })

    const output = '{"count": "not a number"}'
    const result = parseStructuredOutput(output, schema)

    expect(result.success).toBe(false)
    expect(result.error).toContain('count')
  })

  test('extracts JSON from mixed text', () => {
    const schema = z.object({
      result: z.string(),
    })

    const output = `Here is my response:
\`\`\`json
{"result": "success"}
\`\`\`
Done!`

    const result = parseStructuredOutput(output, schema)

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ result: 'success' })
  })
})

describe('generateStructuredOutputPrompt', () => {
  test('generates prompt with schema description', () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    })

    const prompt = generateStructuredOutputPrompt(schema)

    expect(prompt).toContain('IMPORTANT')
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('schema')
    expect(prompt).toContain('"type": "object"')
    expect(prompt).toContain('"name"')
    expect(prompt).toContain('"count"')
  })
})

describe('generateRetryPrompt', () => {
  test('includes original output and error', () => {
    const originalOutput = '{"invalid": true}'
    const error = 'Missing required field: name'

    const prompt = generateRetryPrompt(originalOutput, error)

    expect(prompt).toContain('previous response')
    expect(prompt).toContain('{"invalid": true}')
    expect(prompt).toContain('Missing required field: name')
    expect(prompt).toContain('corrected response')
  })

  test('truncates long output', () => {
    const originalOutput = 'x'.repeat(2000)
    const error = 'Some error'

    const prompt = generateRetryPrompt(originalOutput, error)

    expect(prompt).toContain('...(truncated)')
    expect(prompt.length).toBeLessThan(2500)
  })
})

describe('schemaToPromptDescription', () => {
  test('returns formatted JSON schema', () => {
    const schema = z.object({
      id: z.number(),
      name: z.string(),
    })

    const description = schemaToPromptDescription(schema)

    expect(description).toContain('"type": "object"')
    expect(description).toContain('"id"')
    expect(description).toContain('"name"')
  })
})
