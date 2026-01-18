// Output Parsing and Validation
// Parse and validate LLM output against Zod schemas

import { z } from 'zod'
import type { ParseResult } from './types'

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
    // Zod 4 uses 'issues'
    const issues = result.error?.issues || []
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
