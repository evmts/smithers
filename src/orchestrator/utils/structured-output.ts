// Structured Output Utilities
// Converts Zod schemas to JSON schema and handles validation with retry

import { z } from 'zod'

// ============================================================================
// Types
// ============================================================================

export interface StructuredOutputConfig<T extends z.ZodType> {
  /** The Zod schema to validate against */
  schema: T
  /** Maximum retry attempts on validation failure */
  maxRetries?: number
  /** Custom error message prefix */
  errorPrefix?: string
}

export interface ParseResult<T> {
  success: boolean
  data?: T
  error?: string
  rawOutput: string
}

// ============================================================================
// Zod to JSON Schema Conversion
// ============================================================================

/**
 * Convert a Zod schema to a JSON schema representation for prompts.
 * Uses Zod 4's built-in toJSONSchema() method.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, any> {
  // Zod 4 has a built-in toJSONSchema method
  if (typeof (schema as any).toJSONSchema === 'function') {
    const jsonSchema = (schema as any).toJSONSchema()
    // Remove $schema to keep it cleaner for prompts
    const { $schema, ...rest } = jsonSchema
    return rest
  }

  // Fallback for older Zod versions or edge cases
  return convertZodType(schema)
}

function convertZodType(schema: z.ZodType): Record<string, any> {
  // Zod 4 uses schema._def.type or schema.type directly
  const def = (schema as any)._def || (schema as any).def || {}
  const type = def.type || (schema as any).type

  // Handle object type
  if (type === 'object') {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape || {}
    const properties: Record<string, any> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convertZodType(value as z.ZodType)

      // Check if field is optional (Zod 4 uses isOptional method)
      const isOptional = typeof (value as any).isOptional === 'function'
        ? (value as any).isOptional()
        : (value as any)._def?.type === 'optional'

      if (!isOptional) {
        required.push(key)
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }

  // Handle array type
  if (type === 'array') {
    const itemType = def.element || def.type
    return {
      type: 'array',
      items: itemType ? convertZodType(itemType) : {},
    }
  }

  // Handle string type
  if (type === 'string') {
    const result: Record<string, any> = { type: 'string' }
    if ((schema as any).minLength) result.minLength = (schema as any).minLength
    if ((schema as any).maxLength) result.maxLength = (schema as any).maxLength
    if ((schema as any).format) result.format = (schema as any).format
    return result
  }

  // Handle number type
  if (type === 'number') {
    return { type: 'number' }
  }

  // Handle boolean type
  if (type === 'boolean') {
    return { type: 'boolean' }
  }

  // Handle null type
  if (type === 'null') {
    return { type: 'null' }
  }

  // Handle enum type
  if (type === 'enum') {
    return { enum: def.values || [] }
  }

  // Handle literal type
  if (type === 'literal') {
    return { const: def.value }
  }

  // Handle union type
  if (type === 'union') {
    const options = def.options || []
    return {
      oneOf: options.map((opt: z.ZodType) => convertZodType(opt)),
    }
  }

  // Handle optional type
  if (type === 'optional') {
    return convertZodType(def.innerType || def.wrapped)
  }

  // Handle nullable type
  if (type === 'nullable') {
    const inner = convertZodType(def.innerType || def.wrapped)
    return { oneOf: [inner, { type: 'null' }] }
  }

  // Default fallback
  return {}
}

/**
 * Generate a human-readable schema description for prompts
 */
export function schemaToPromptDescription(schema: z.ZodType): string {
  const jsonSchema = zodToJsonSchema(schema)
  return JSON.stringify(jsonSchema, null, 2)
}

// ============================================================================
// Output Parsing and Validation
// ============================================================================

/**
 * Extract JSON from text that may contain markdown code blocks or other content
 */
export function extractJson(text: string): string | null {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to find raw JSON (object or array)
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) {
    return jsonMatch[1].trim()
  }

  // If the entire text looks like JSON, return it
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
  }

  return null
}

/**
 * Parse and validate output against a Zod schema
 */
export function parseStructuredOutput<T extends z.ZodType>(
  output: string,
  schema: T
): ParseResult<z.infer<T>> {
  // Extract JSON from the output
  const jsonStr = extractJson(output)

  if (!jsonStr) {
    return {
      success: false,
      error: 'No valid JSON found in output. The response should contain a JSON object or array.',
      rawOutput: output,
    }
  }

  // Try to parse as JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    return {
      success: false,
      error: `Invalid JSON syntax: ${e instanceof Error ? e.message : String(e)}`,
      rawOutput: output,
    }
  }

  // Validate against the schema
  const result = schema.safeParse(parsed)

  if (!result.success) {
    // Zod 4 uses 'issues' instead of 'errors'
    const issues = result.error?.issues || result.error?.errors || []
    const errorMessages = issues
      .map((issue: any) => `- ${(issue.path || []).join('.')}: ${issue.message}`)
      .join('\n')

    return {
      success: false,
      error: `Schema validation failed:\n${errorMessages || 'Unknown validation error'}`,
      rawOutput: output,
    }
  }

  return {
    success: true,
    data: result.data,
    rawOutput: output,
  }
}

// ============================================================================
// Prompt Generation
// ============================================================================

/**
 * Generate system prompt additions for structured output
 */
export function generateStructuredOutputPrompt(schema: z.ZodType): string {
  const jsonSchema = schemaToPromptDescription(schema)

  return `
IMPORTANT: Your response MUST be valid JSON that conforms to this schema:

\`\`\`json
${jsonSchema}
\`\`\`

Rules:
1. Output ONLY the JSON object/array, no other text
2. Do not wrap in markdown code blocks
3. Ensure all required fields are present
4. Use the exact field names and types specified
`
}

/**
 * Generate a retry prompt when validation fails
 */
export function generateRetryPrompt(
  originalOutput: string,
  validationError: string
): string {
  return `Your previous response did not match the required schema.

Previous output:
\`\`\`
${originalOutput.slice(0, 1000)}${originalOutput.length > 1000 ? '...(truncated)' : ''}
\`\`\`

Validation error:
${validationError}

Please provide a corrected response that matches the schema exactly. Output ONLY valid JSON.`
}
