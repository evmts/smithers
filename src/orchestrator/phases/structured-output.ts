import { z } from 'zod'
import type { ValidationResult, ProcessedOutput } from '../types/workflow-types.js'
import { XmlParser } from './xml-parser.js'

export class StructuredOutputProcessor {
  private xmlParser: XmlParser

  constructor() {
    this.xmlParser = new XmlParser()
  }

  /**
   * Validate structured output against a schema
   */
  validate(data: any, schema: Record<string, any>): ValidationResult {
    try {
      const zodSchema = this.convertToZodSchema(schema)
      const result = zodSchema.parse(data)

      return {
        valid: true,
        data: result
      }
    } catch (error) {
      const errors = this.extractValidationErrors(error)
      return {
        valid: false,
        errors
      }
    }
  }

  /**
   * Transform XML-parsed data by applying type coercion
   */
  transform(data: any): any {
    if (Array.isArray(data)) {
      return data.map(item => this.transform(item))
    }

    if (data && typeof data === 'object') {
      const transformed: Record<string, any> = {}

      for (const [key, value] of Object.entries(data)) {
        transformed[key] = this.transform(value)
      }

      return transformed
    }

    // Apply type coercion for primitive values
    return this.coerceValue(data)
  }

  /**
   * Process phase output by extracting structured data and validating
   */
  processPhaseOutput(
    rawOutput: string,
    schema?: Record<string, any>
  ): ProcessedOutput {
    try {
      // Extract structured output from XML
      const structuredData = this.xmlParser.extractStructuredOutput(rawOutput)

      // Transform the data with type coercion
      const transformedData = this.transform(structuredData)

      // Validate against schema if provided
      let validationResult: ValidationResult = { valid: true }
      if (schema && Object.keys(transformedData).length > 0) {
        validationResult = this.validate(transformedData, schema)
      }

      const output: ProcessedOutput = {
        valid: validationResult.valid,
        structured: validationResult.valid ? (validationResult.data || transformedData) : transformedData,
        raw: rawOutput,
        metadata: {
          hasStructuredOutput: Object.keys(structuredData).length > 0,
          transformationApplied: true,
          validationApplied: !!schema
        },
        errors: validationResult.errors || []
      }
      return output
    } catch (error) {
      return {
        valid: false,
        structured: {},
        raw: rawOutput,
        metadata: {
          hasStructuredOutput: false,
          transformationApplied: false,
          validationApplied: false
        },
        errors: [`Processing failed: ${error instanceof Error ? error.message : String(error)}`]
      }
    }
  }

  private convertToZodSchema(schema: Record<string, any>): z.ZodSchema {
    const { type, properties, required = [], items, enum: enumValues } = schema

    switch (type) {
      case 'object':
        if (!properties) {
          return z.record(z.string(), z.any())
        }

        const objectSchema: Record<string, z.ZodSchema> = {}
        for (const [key, propSchema] of Object.entries(properties)) {
          let fieldSchema = this.convertToZodSchema(propSchema as any)

          // Make field optional if not in required array
          if (!required.includes(key)) {
            fieldSchema = fieldSchema.optional()
          }

          objectSchema[key] = fieldSchema
        }

        return z.object(objectSchema)

      case 'array':
        if (!items) {
          return z.array(z.any())
        }
        return z.array(this.convertToZodSchema(items))

      case 'string':
        if (enumValues) {
          return z.enum(enumValues as [string, ...string[]])
        }
        return z.string()

      case 'number': {
        let numberSchema = z.number()
        if (schema['minimum'] !== undefined) {
          numberSchema = numberSchema.min(schema['minimum'])
        }
        if (schema['maximum'] !== undefined) {
          numberSchema = numberSchema.max(schema['maximum'])
        }
        return numberSchema
      }

      case 'integer': {
        let intSchema = z.number().int()
        if (schema['minimum'] !== undefined) {
          intSchema = intSchema.min(schema['minimum'])
        }
        if (schema['maximum'] !== undefined) {
          intSchema = intSchema.max(schema['maximum'])
        }
        return intSchema
      }

      case 'boolean':
        return z.boolean()

      case 'null':
        return z.null()

      default:
        return z.any()
    }
  }

  private extractValidationErrors(error: any): string[] {
    if (error instanceof z.ZodError) {
      return error.issues.map(err => {
        const path = err.path.length > 0 ? `at ${err.path.join('.')}: ` : ''
        return `${path}${err.message}`
      })
    }

    return [error instanceof Error ? error.message : String(error)]
  }

  private coerceValue(value: any): any {
    if (typeof value !== 'string') {
      return value
    }

    // Try to parse as number
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10)
    }

    if (/^\d*\.\d+$/.test(value)) {
      return parseFloat(value)
    }

    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false

    // Try to parse as null
    if (value.toLowerCase() === 'null') return null

    // Try to parse as array (comma-separated)
    if (value.includes(',') && !value.includes(' ')) {
      const items = value.split(',').map(item => this.coerceValue(item.trim()))
      // Only return as array if all items were successfully coerced to non-string types
      // or if it looks like a deliberate array
      if (items.some(item => typeof item !== 'string') || value.startsWith('[')) {
        return items
      }
    }

    // Return as string if no coercion applies
    return value
  }
}