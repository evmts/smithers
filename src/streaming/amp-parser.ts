// Amp CLI stream parser -> Smithers stream parts.

import { randomUUID } from 'node:crypto'
import type { SmithersStreamPart } from './types.js'
import type { JSONValue } from './v3-compat.js'

interface AmpContentBlock {
  type?: string
  text?: string
  name?: string
  input?: unknown
  result?: unknown
}

interface AmpMessage {
  role?: string
  content?: AmpContentBlock[]
}

interface AmpUsage {
  input_tokens?: number
  output_tokens?: number
}

interface AmpStreamEvent {
  type?: string
  message?: AmpMessage
  usage?: AmpUsage
  session_id?: string
  tool_name?: string
  tool_input?: unknown
  tool_result?: unknown
  name?: string
  input?: unknown
  result?: unknown
  error?: string
}

export class AmpStreamParser {
  private buffer = ''

  parse(chunk: string): SmithersStreamPart[] {
    this.buffer += chunk
    const parts: SmithersStreamPart[] = []

    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parsed = this.parseJsonLine(trimmed)
      if (parsed) {
        parts.push(...parsed)
      } else {
        parts.push({ type: 'cli-output', stream: 'stdout', raw: line })
      }
    }

    return parts
  }

  flush(): SmithersStreamPart[] {
    if (!this.buffer.trim()) {
      this.buffer = ''
      return []
    }
    const parts = this.parseJsonLine(this.buffer) ?? [
      { type: 'cli-output', stream: 'stdout', raw: this.buffer },
    ]
    this.buffer = ''
    return parts
  }

  private parseJsonLine(line: string): SmithersStreamPart[] | null {
    try {
      const event = JSON.parse(line) as AmpStreamEvent
      return this.mapEvent(event)
    } catch {
      return null
    }
  }

  private mapEvent(event: AmpStreamEvent): SmithersStreamPart[] {
    const parts: SmithersStreamPart[] = []

    if (event.error) {
      parts.push({ type: 'error', error: event.error })
    }

    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          parts.push(...this.emitTextBlock(block.text))
        } else if (block.type && block.type.includes('tool')) {
          const toolName = block.name ?? 'unknown'
          const input = block.input ?? {}
          const toolCallId = randomUUID()
          parts.push(
            { type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) }
          )
        }
      }
      return parts
    }

    if (event.type && event.type.includes('tool')) {
      const toolName = event.tool_name ?? event.name ?? 'unknown'
      const input = event.tool_input ?? event.input ?? {}
      const result = event.tool_result ?? event.result
      const toolCallId = randomUUID()
      parts.push({ type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) })
      if (result !== undefined) {
        parts.push({ type: 'tool-result', toolCallId, toolName, result: result as JSONValue })
      }
      return parts
    }

    if (event.type === 'result' && event.usage) {
      parts.push({
        type: 'finish',
        usage: {
          inputTokens: { total: event.usage.input_tokens ?? 0 },
          outputTokens: { total: event.usage.output_tokens ?? 0 },
        },
        finishReason: { unified: 'stop' },
      })
      return parts
    }

    return parts.length > 0 ? parts : [{ type: 'cli-output', stream: 'stdout', raw: JSON.stringify(event) }]
  }

  private emitTextBlock(text: string): SmithersStreamPart[] {
    const id = randomUUID()
    return [
      { type: 'text-start', id },
      { type: 'text-delta', id, delta: text },
      { type: 'text-end', id },
    ]
  }
}
