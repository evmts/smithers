import { z } from 'zod'

export interface StructuredOutputConfig<T extends z.ZodType> {
  schema: T
  maxRetries?: number
  errorPrefix?: string
}

export interface ParseResult<T> {
  success: boolean
  data?: T
  error?: string
  rawOutput: string
}
