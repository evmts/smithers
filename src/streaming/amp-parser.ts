import { randomUUID } from 'node:crypto'
import { BaseStreamParser } from './base-parser.js'
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

export class AmpStreamParser extends BaseStreamParser {
  protected handleNonJsonLine(line: string): SmithersStreamPart[] {
    return [{ type: 'cli-output', stream: 'stdout', raw: line }]
  }

  protected mapEvent(event: Record<string, unknown>): SmithersStreamPart[] {
    const ampEvent = event as AmpStreamEvent
    const parts: SmithersStreamPart[] = []

    if (ampEvent.error) {
      parts.push({ type: 'error', error: ampEvent.error })
    }

    if (ampEvent.type === 'assistant' && ampEvent.message?.content) {
      for (const block of ampEvent.message.content) {
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

    if (ampEvent.type && ampEvent.type.includes('tool')) {
      const toolName = ampEvent.tool_name ?? ampEvent.name ?? 'unknown'
      const input = ampEvent.tool_input ?? ampEvent.input ?? {}
      const result = ampEvent.tool_result ?? ampEvent.result
      const toolCallId = randomUUID()
      parts.push({ type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) })
      if (result !== undefined) {
        parts.push({ type: 'tool-result', toolCallId, toolName, result: result as JSONValue })
      }
      return parts
    }

    if (ampEvent.type === 'result' && ampEvent.usage) {
      parts.push({
        type: 'finish',
        usage: {
          inputTokens: { total: ampEvent.usage.input_tokens ?? 0 },
          outputTokens: { total: ampEvent.usage.output_tokens ?? 0 },
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
