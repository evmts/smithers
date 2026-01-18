// Structured Output Types
// Type definitions for structured output parsing and validation

import { z } from 'zod'

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
