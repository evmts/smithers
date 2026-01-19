// Claude CLI Output Parser
// Parses CLI output to extract result information

import type { ClaudeOutputFormat } from '../types.js'

/**
 * Parsed output structure from Claude CLI
 */
export interface ParsedOutput {
  output: string
  structured?: unknown
  tokensUsed: { input: number; output: number }
  turnsUsed: number
}

interface StreamEvent {
  type?: string
  delta?: { text?: string }
  usage?: { input_tokens?: number; output_tokens?: number }
  turns?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toStreamEvent(value: unknown): StreamEvent | null {
  if (!isRecord(value)) return null

  const event: StreamEvent = {}

  if (typeof value['type'] === 'string') {
    event.type = value['type']
  }

  if (typeof value['turns'] === 'number') {
    event.turns = value['turns']
  }

  const delta = value['delta']
  if (isRecord(delta)) {
    const text = typeof delta['text'] === 'string' ? delta['text'] : undefined
    if (text !== undefined) {
      event.delta = { text }
    }
  }

  const usage = value['usage']
  if (isRecord(usage)) {
    const inputTokens = typeof usage['input_tokens'] === 'number'
      ? usage['input_tokens']
      : undefined
    const outputTokens = typeof usage['output_tokens'] === 'number'
      ? usage['output_tokens']
      : undefined
    if (inputTokens !== undefined || outputTokens !== undefined) {
      event.usage = {}
      if (inputTokens !== undefined) event.usage.input_tokens = inputTokens
      if (outputTokens !== undefined) event.usage.output_tokens = outputTokens
    }
  }

  if (!event.type && !event.delta && !event.usage && event.turns === undefined) {
    return null
  }

  return event
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
      const parsed: unknown = JSON.parse(stdout)
      result.structured = parsed
      result.output = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)

      // Extract token usage if present
      if (isRecord(parsed)) {
        const usage = parsed['usage']
        if (isRecord(usage)) {
          result.tokensUsed = {
            input: typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : 0,
            output: typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : 0,
          }
        }

        // Extract turn count if present
        if (typeof parsed['turns'] === 'number') {
          result.turnsUsed = parsed['turns']
        }
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
    let event: StreamEvent | null
    try {
      event = toStreamEvent(JSON.parse(line))
    } catch {
      continue
    }
    if (!event) continue
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
