import { BaseStreamParser } from './base-parser.js'
import type { SmithersStreamPart } from './types.js'
import type { JSONValue } from './v3-compat.js'

interface PiEvent {
  type: string
  messages?: Array<{ usage?: { input: number; output: number } }>
  assistantMessageEvent?: { type: string; delta?: string; contentIndex?: number }
  toolCallId?: string
  toolName?: string
  args?: unknown
  result?: unknown
  isError?: boolean
}

export class PiStreamParser extends BaseStreamParser {
  private activeTextBlocks = new Set<number>()
  private activeReasoningBlocks = new Set<number>()
  // toolCallId -> toolName (tool_execution_end may omit toolName)
  private activeToolInputs = new Map<string, string>()

  protected handleNonJsonLine(line: string): SmithersStreamPart[] {
    return [{ type: 'cli-output', stream: 'stdout', raw: line }]
  }

  protected mapEvent(event: Record<string, unknown>): SmithersStreamPart[] {
    const e = event as unknown as PiEvent
    switch (e.type) {
      case 'agent_start':
        return [{ type: 'stream-start', warnings: [] }]

      case 'turn_start':
      case 'turn_end':
        return []

      case 'message_start':
      case 'message_end':
        return this.closeOpenBlocks()

      case 'message_update':
        return this.mapMessageUpdate(e)

      case 'tool_execution_start':
        if (!e.toolCallId || !e.toolName) return []
        this.activeToolInputs.set(e.toolCallId, e.toolName)
        return [{ type: 'tool-input-start', id: e.toolCallId, toolName: e.toolName }]

      case 'tool_execution_end':
        return this.handleToolExecutionEnd(e)

      case 'agent_end': {
        let input = 0, output = 0
        for (const m of e.messages ?? []) {
          input += m.usage?.input ?? 0
          output += m.usage?.output ?? 0
        }
        return [{
          type: 'finish',
          usage: { inputTokens: { total: input }, outputTokens: { total: output } },
          finishReason: { unified: 'stop' },
        }]
      }

      default:
        return []
    }
  }

  private handleToolExecutionEnd(e: PiEvent): SmithersStreamPart[] {
    if (!e.toolCallId) return []

    const parts: SmithersStreamPart[] = []
    const toolName = this.activeToolInputs.get(e.toolCallId) ?? e.toolName ?? 'unknown'

    if (this.activeToolInputs.has(e.toolCallId)) {
      parts.push({ type: 'tool-input-end', id: e.toolCallId })
      this.activeToolInputs.delete(e.toolCallId)
    }

    if (e.isError) {
      parts.push({
        type: 'error',
        error: {
          type: 'tool_execution_error',
          toolCallId: e.toolCallId,
          toolName,
          result: e.result ?? null,
        },
      })
      return parts
    }

    parts.push({
      type: 'tool-result',
      toolCallId: e.toolCallId,
      toolName,
      result: (e.result ?? null) as JSONValue,
    })
    return parts
  }

  private mapMessageUpdate(e: PiEvent): SmithersStreamPart[] {
    const ae = e.assistantMessageEvent
    if (!ae) return []
    
    const parts: SmithersStreamPart[] = []
    const contentIndex = ae.contentIndex ?? 0

    if (ae.type === 'text_delta' && ae.delta !== undefined) {
      const blockId = `pi-text-${contentIndex}`
      if (!this.activeTextBlocks.has(contentIndex)) {
        parts.push({ type: 'text-start', id: blockId })
        this.activeTextBlocks.add(contentIndex)
      }
      parts.push({ type: 'text-delta', id: blockId, delta: ae.delta })
    }

    if (ae.type === 'thinking_delta' && ae.delta !== undefined) {
      const blockId = `pi-reasoning-${contentIndex}`
      if (!this.activeReasoningBlocks.has(contentIndex)) {
        parts.push({ type: 'reasoning-start', id: blockId })
        this.activeReasoningBlocks.add(contentIndex)
      }
      parts.push({ type: 'reasoning-delta', id: blockId, delta: ae.delta })
    }

    return parts
  }

  private closeOpenBlocks(): SmithersStreamPart[] {
    const parts: SmithersStreamPart[] = []
    for (const contentIndex of this.activeTextBlocks) {
      parts.push({ type: 'text-end', id: `pi-text-${contentIndex}` })
    }
    for (const contentIndex of this.activeReasoningBlocks) {
      parts.push({ type: 'reasoning-end', id: `pi-reasoning-${contentIndex}` })
    }
    for (const toolCallId of this.activeToolInputs.keys()) {
      parts.push({ type: 'tool-input-end', id: toolCallId })
    }
    this.activeTextBlocks.clear()
    this.activeReasoningBlocks.clear()
    this.activeToolInputs.clear()
    return parts
  }

  override flush(): SmithersStreamPart[] {
    const parts = super.flush()
    parts.push(...this.closeOpenBlocks())
    return parts
  }
}
