import { z } from 'zod'
import type { ParseResult } from './types.js'

function extractBalancedFrom(text: string, startIndex: number): string | null {
  const startChar = text[startIndex]
  if (startChar !== '{' && startChar !== '[') return null

  const stack: string[] = [startChar]
  let inString = false
  let escaped = false

  for (let i = startIndex + 1; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch)
      continue
    }

    if (ch === '}' || ch === ']') {
      const open = stack.pop()
      if (!open) return null
      if ((open === '{' && ch !== '}') || (open === '[' && ch !== ']')) {
        return null
      }
      if (stack.length === 0) {
        return text.slice(startIndex, i + 1)
      }
    }
  }

  return null
}

function extractBalancedJson(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch !== '{' && ch !== '[') continue
    const candidate = extractBalancedFrom(text, i)
    if (candidate) return candidate
  }
  return null
}

export function extractJson(text: string): string | null {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim()
  }

  const balanced = extractBalancedJson(text)
  if (balanced) {
    return balanced.trim()
  }

  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
  }

  return null
}

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
