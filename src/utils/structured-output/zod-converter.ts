// Zod to JSON Schema Conversion
// Converts Zod schemas to JSON schema representation for prompts

import { z } from 'zod'

/**
 * Convert a Zod schema to a JSON schema representation for prompts.
 * Uses Zod 4's built-in toJSONSchema() method.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, any> {
  // Zod 4 has a built-in toJSONSchema method
  if (typeof (schema as any).toJSONSchema === 'function') {
    const jsonSchema = (schema as any).toJSONSchema()
    // Remove $schema to keep it cleaner for prompts
    const { $schema: _$schema, ...rest } = jsonSchema
    return rest
  }

  // Fallback for older Zod versions or edge cases
  return convertZodType(schema)
}

export function convertZodType(schema: z.ZodType): Record<string, any> {
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
