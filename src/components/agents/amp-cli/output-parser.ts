// Amp CLI output parser
// Parses stream-json output from amp CLI

import type { AgentResult, StopReason } from '../types/execution.js'
import type { TailLogEntry } from '../claude-cli/message-parser.js'
import { safeStringify } from '../../../debug/index.js'

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
  name?: string
  tool_name?: string
  toolName?: string
  input?: unknown
  arguments?: unknown
  args?: unknown
  tool?: {
    name?: string
    input?: unknown
  }
  data?: {
    input?: unknown
    args?: unknown
  }
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

export function extractToolCallFromStreamEvent(line: string): { toolName: string; input?: unknown } | null {
  try {
    const event: AmpStreamEvent = JSON.parse(line)
    const type = typeof event.type === 'string' ? event.type.toLowerCase() : ''
    if (!type.includes('tool') || type.includes('result')) {
      return null
    }

    const toolName = event.name
      ?? event.tool_name
      ?? event.toolName
      ?? event.tool?.name
      ?? 'unknown'

    const input = event.input
      ?? event.arguments
      ?? event.args
      ?? event.tool?.input
      ?? event.data?.input
      ?? event.data?.args

    return { toolName, input }
  } catch {
    return null
  }
}

export class AmpMessageParser {
  private buffer = ''
  private entries: TailLogEntry[] = []
  private currentIndex = 0
  private maxEntries: number
  private currentMessageIndex: number | null = null
  private onToolCall?: (toolName: string, input: unknown) => void

  constructor(maxEntries: number = 100, onToolCall?: (toolName: string, input: unknown) => void) {
    this.maxEntries = maxEntries
    this.onToolCall = onToolCall
  }

  setOnToolCall(onToolCall?: (toolName: string, input: unknown) => void): void {
    this.onToolCall = onToolCall
  }

  parseChunk(chunk: string): void {
    this.buffer += chunk
    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex)
      this.buffer = this.buffer.slice(newlineIndex + 1)
      this.processLine(line)
      newlineIndex = this.buffer.indexOf('\n')
    }
  }

  private processLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    const toolCall = extractToolCallFromStreamEvent(line)
    if (toolCall) {
      this.onToolCall?.(toolCall.toolName, toolCall.input)
      const content = toolCall.input !== undefined ? safeStringify(toolCall.input) : ''
      this.addEntry({
        type: 'tool-call',
        content,
        toolName: toolCall.toolName,
      })
      this.currentMessageIndex = null
      return
    }

    const text = extractTextFromStreamEvent(line)
    if (text) {
      this.appendMessage(text)
      return
    }

    this.appendMessage(line)
  }

  private appendMessage(text: string): void {
    if (!text.trim()) return
    if (
      this.currentMessageIndex === null ||
      !this.entries[this.currentMessageIndex] ||
      this.entries[this.currentMessageIndex]?.type !== 'message'
    ) {
      this.addEntry({ type: 'message', content: text })
      this.currentMessageIndex = this.entries.length - 1
      return
    }

    this.entries[this.currentMessageIndex].content += text
  }

  private addEntry(entry: Omit<TailLogEntry, 'index'>): void {
    this.entries.push({
      ...entry,
      index: this.currentIndex++,
    })

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }

    if (entry.type !== 'message') {
      this.currentMessageIndex = null
    }
  }

  flush(): void {
    if (this.buffer.trim()) {
      this.processLine(this.buffer)
    }
    this.buffer = ''
  }

  reset(): void {
    this.buffer = ''
    this.entries = []
    this.currentIndex = 0
    this.currentMessageIndex = null
  }

  getLatestEntries(n: number): TailLogEntry[] {
    return this.entries.slice(-n)
  }
}
