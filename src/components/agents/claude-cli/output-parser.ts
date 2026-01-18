// Claude CLI Output Parser
// Parses CLI output to extract result information

import type { ClaudeOutputFormat } from '../types.js'

/**
 * Parsed output structure from Claude CLI
 */
export interface ParsedOutput {
  output: string
  structured?: any
  tokensUsed: { input: number; output: number }
  turnsUsed: number
}

/**
 * Parse Claude CLI output to extract result information
 */
export function parseClaudeOutput(
  stdout: string,
  outputFormat: ClaudeOutputFormat = 'text'
): ParsedOutput {
  const result: ParsedOutput = {
    output: stdout,
    tokensUsed: { input: 0, output: 0 },
    turnsUsed: 1,
  }

  // Try to parse JSON output
  if (outputFormat === 'json' || outputFormat === 'stream-json') {
    try {
      const parsed = JSON.parse(stdout)
      result.structured = parsed
      result.output = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)

      // Extract token usage if present
      if (parsed.usage) {
        result.tokensUsed = {
          input: parsed.usage.input_tokens ?? 0,
          output: parsed.usage.output_tokens ?? 0,
        }
      }

      // Extract turn count if present
      if (parsed.turns !== undefined) {
        result.turnsUsed = parsed.turns
      }
    } catch {
      // Not valid JSON, use as-is
    }
  }

  // Try to extract token usage from text output
  const tokenMatch = stdout.match(/tokens?:\s*(\d+)\s*input,?\s*(\d+)\s*output/i)
  if (tokenMatch && tokenMatch[1] && tokenMatch[2]) {
    result.tokensUsed = {
      input: parseInt(tokenMatch[1], 10),
      output: parseInt(tokenMatch[2], 10),
    }
  }

  // Try to extract turn count from text output
  const turnMatch = stdout.match(/turns?:\s*(\d+)/i)
  if (turnMatch && turnMatch[1]) {
    result.turnsUsed = parseInt(turnMatch[1], 10)
  }

  return result
}
