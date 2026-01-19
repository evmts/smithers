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
      return result
    } catch {
      // Not valid JSON, fall through to stream parsing for stream-json.
    }
  }

  if (outputFormat === 'stream-json') {
    const streamResult = parseStreamJson(stdout)
    if (streamResult) {
      result.output = streamResult.output
      result.tokensUsed = streamResult.tokensUsed
      result.turnsUsed = streamResult.turnsUsed
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

function parseStreamJson(stdout: string): ParsedOutput | null {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) {
    return null
  }

  let output = ''
  let tokensUsed = { input: 0, output: 0 }
  let turnsUsed = 1
  let parsedAny = false

  for (const line of lines) {
    let event: any
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    parsedAny = true

    if (event.type === 'content_block_delta' && event.delta?.text !== undefined) {
      output += String(event.delta.text)
    }

    if (event.type === 'message_stop' && event.usage) {
      tokensUsed = {
        input: event.usage.input_tokens ?? 0,
        output: event.usage.output_tokens ?? 0,
      }
    }

    if (event.turns !== undefined) {
      turnsUsed = event.turns
    }
  }

  if (!parsedAny) {
    return null
  }

  return {
    output: output || stdout,
    tokensUsed,
    turnsUsed,
  }
}
