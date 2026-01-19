// Amp CLI output parser
// Parses stream-json output from amp CLI

import type { AgentResult, StopReason } from '../types/execution.js'

interface AmpStreamEvent {
  type: string
  message?: {
    role?: string
    content?: Array<{
      type: string
      text?: string
    }>
  }
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  session_id?: string
  error?: string
}

/**
 * Parse amp CLI stream-json output into AgentResult
 */
export function parseAmpOutput(output: string, exitCode: number): AgentResult {
  const lines = output.trim().split('\n').filter(Boolean)
  
  let textContent = ''
  let tokensInput = 0
  let tokensOutput = 0
  let sessionId: string | undefined

  for (const line of lines) {
    try {
      const event: AmpStreamEvent = JSON.parse(line)

      // Extract text from assistant messages
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            textContent += block.text + '\n'
          }
        }
      }

      // Extract token usage from result events
      if (event.type === 'result' && event.usage) {
        tokensInput = event.usage.input_tokens ?? tokensInput
        tokensOutput = event.usage.output_tokens ?? tokensOutput
      }

      // Extract session/thread ID
      if (event.session_id) {
        sessionId = event.session_id
      }
    } catch {
      // Non-JSON line, could be raw output - append if not empty
      if (line.trim()) {
        textContent += line + '\n'
      }
    }
  }

  const stopReason: StopReason = exitCode === 0 ? 'completed' : 'error'

  const result: AgentResult = {
    output: textContent.trim(),
    tokensUsed: {
      input: tokensInput,
      output: tokensOutput,
    },
    turnsUsed: 0, // Amp doesn't expose turn count in stream-json
    stopReason,
    durationMs: 0, // Set by caller
  }

  if (sessionId) {
    result.sessionId = sessionId
  }

  return result
}

/**
 * Extract text blocks from stream-json for progress display
 */
export function extractTextFromStreamEvent(line: string): string | null {
  try {
    const event: AmpStreamEvent = JSON.parse(line)
    if (event.type === 'assistant' && event.message?.content) {
      const texts: string[] = []
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          texts.push(block.text)
        }
      }
      return texts.join('')
    }
  } catch {
    // Not valid JSON
  }
  return null
}
