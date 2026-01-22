import { z } from 'zod'

export function zodToJsonSchema(schema: z.ZodType): Record<string, any> {
  if (typeof (schema as any).toJSONSchema === 'function') {
    const jsonSchema = (schema as any).toJSONSchema()
    const { $schema: _$schema, ...rest } = jsonSchema
    return rest
  }
  return convertZodType(schema)
}

export function convertZodType(schema: z.ZodType): Record<string, any> {
  const def = (schema as any)._def || (schema as any).def || {}
  const type = def.type || (schema as any).type

  if (type === 'object') {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape || {}
    const properties: Record<string, any> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convertZodType(value as z.ZodType)
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

  if (type === 'array') {
    const itemType = def.element || def.type
    return {
      type: 'array',
      items: itemType ? convertZodType(itemType) : {},
    }
  }

  if (type === 'string') {
    const result: Record<string, any> = { type: 'string' }
    if ((schema as any)['minLength']) result['minLength'] = (schema as any)['minLength']
    if ((schema as any)['maxLength']) result['maxLength'] = (schema as any)['maxLength']
    if ((schema as any)['format']) result['format'] = (schema as any)['format']
    return result
  }

  if (type === 'number') return { type: 'number' }
  if (type === 'boolean') return { type: 'boolean' }
  if (type === 'null') return { type: 'null' }
  if (type === 'enum') return { enum: def.values || [] }
  if (type === 'literal') return { const: def.value }

  if (type === 'union') {
    const options = def.options || []
    return { oneOf: options.map((opt: z.ZodType) => convertZodType(opt)) }
  }

  if (type === 'optional') return convertZodType(def.innerType || def.wrapped)

  if (type === 'nullable') {
    const inner = convertZodType(def.innerType || def.wrapped)
    return { oneOf: [inner, { type: 'null' }] }
  }

  return {}
}

export function schemaToPromptDescription(schema: z.ZodType): string {
  const jsonSchema = zodToJsonSchema(schema)
  return JSON.stringify(jsonSchema, null, 2)
}
