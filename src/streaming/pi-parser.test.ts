/**
 * Tests for PiStreamParser - pi JSON event stream parsing
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { PiStreamParser } from './pi-parser.js'
import type { SmithersStreamPart } from './types.js'

describe('PiStreamParser', () => {
  let parser: PiStreamParser

  beforeEach(() => {
    parser = new PiStreamParser()
  })

  describe('basic parsing', () => {
    test('parses single JSON line', () => {
      const parts = parser.parse('{"type":"agent_start"}\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('stream-start')
    })

    test('handles multiple lines in one chunk', () => {
      const parts = parser.parse('{"type":"agent_start"}\n{"type":"agent_end","messages":[]}\n')
      
      expect(parts).toHaveLength(2)
      expect(parts[0].type).toBe('stream-start')
      expect(parts[1].type).toBe('finish')
    })

    test('buffers incomplete lines', () => {
      const parts1 = parser.parse('{"type":"agent')
      expect(parts1).toHaveLength(0)
      
      const parts2 = parser.parse('_start"}\n')
      expect(parts2).toHaveLength(1)
      expect(parts2[0].type).toBe('stream-start')
    })

    test('handles empty lines', () => {
      const parts = parser.parse('\n\n{"type":"agent_start"}\n\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('stream-start')
    })

    test('emits cli-output for non-JSON lines', () => {
      const parts = parser.parse('Some debug output\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('cli-output')
      expect((parts[0] as any).raw).toBe('Some debug output')
    })
  })

  describe('event mapping', () => {
    test('agent_start -> stream-start', () => {
      const parts = parser.parse('{"type":"agent_start"}\n')
      
      expect(parts[0]).toEqual({ type: 'stream-start', warnings: [] })
    })

    test('turn_start/turn_end ignored', () => {
      const parts1 = parser.parse('{"type":"turn_start"}\n')
      const parts2 = parser.parse('{"type":"turn_end"}\n')
      
      expect(parts1).toHaveLength(0)
      expect(parts2).toHaveLength(0)
    })

    test('agent_end -> finish with usage', () => {
      const parts = parser.parse(JSON.stringify({
        type: 'agent_end',
        messages: [
          { usage: { input: 100, output: 50 } },
          { usage: { input: 200, output: 150 } },
        ]
      }) + '\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('finish')
      const finish = parts[0] as Extract<SmithersStreamPart, { type: 'finish' }>
      expect(finish.usage.inputTokens.total).toBe(300)
      expect(finish.usage.outputTokens.total).toBe(200)
    })

    test('agent_end with no messages', () => {
      const parts = parser.parse('{"type":"agent_end"}\n')
      
      expect(parts).toHaveLength(1)
      const finish = parts[0] as Extract<SmithersStreamPart, { type: 'finish' }>
      expect(finish.usage.inputTokens.total).toBe(0)
      expect(finish.usage.outputTokens.total).toBe(0)
    })
  })

  describe('text blocks', () => {
    test('text_delta starts block on first delta', () => {
      const parts = parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello', contentIndex: 0 }
      }) + '\n')
      
      expect(parts).toHaveLength(2)
      expect(parts[0].type).toBe('text-start')
      expect((parts[0] as any).id).toBe('pi-text-0')
      expect(parts[1].type).toBe('text-delta')
      expect((parts[1] as any).delta).toBe('Hello')
    })

    test('subsequent text_delta does not restart block', () => {
      parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello', contentIndex: 0 }
      }) + '\n')
      
      const parts = parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: ' world', contentIndex: 0 }
      }) + '\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('text-delta')
      expect((parts[0] as any).delta).toBe(' world')
    })

    test('different contentIndex creates new block', () => {
      parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'First', contentIndex: 0 }
      }) + '\n')
      
      const parts = parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Second', contentIndex: 1 }
      }) + '\n')
      
      expect(parts).toHaveLength(2)
      expect(parts[0].type).toBe('text-start')
      expect((parts[0] as any).id).toBe('pi-text-1')
    })
  })

  describe('thinking/reasoning blocks', () => {
    test('thinking_delta starts reasoning block', () => {
      const parts = parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', delta: 'Let me think...', contentIndex: 0 }
      }) + '\n')
      
      expect(parts).toHaveLength(2)
      expect(parts[0].type).toBe('reasoning-start')
      expect((parts[0] as any).id).toBe('pi-reasoning-0')
      expect(parts[1].type).toBe('reasoning-delta')
    })

    test('subsequent thinking_delta does not restart block', () => {
      parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', delta: 'First', contentIndex: 0 }
      }) + '\n')
      
      const parts = parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', delta: 'Second', contentIndex: 0 }
      }) + '\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('reasoning-delta')
    })
  })

  describe('tool execution', () => {
    test('tool_execution_start emits tool-input-start', () => {
      const parts = parser.parse(JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'call_123',
        toolName: 'Read'
      }) + '\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('tool-input-start')
      expect((parts[0] as any).id).toBe('call_123')
      expect((parts[0] as any).toolName).toBe('Read')
    })

    test('tool_execution_end emits tool-input-end and tool-result', () => {
      // Start first to register tool name
      parser.parse(JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'call_123',
        toolName: 'Read'
      }) + '\n')
      
      const parts = parser.parse(JSON.stringify({
        type: 'tool_execution_end',
        toolCallId: 'call_123',
        result: { content: 'file contents' }
      }) + '\n')
      
      expect(parts).toHaveLength(2)
      expect(parts[0].type).toBe('tool-input-end')
      expect(parts[1].type).toBe('tool-result')
      expect((parts[1] as any).toolName).toBe('Read')
      expect((parts[1] as any).result).toEqual({ content: 'file contents' })
    })

    test('tool_execution_end without start uses unknown tool name', () => {
      const parts = parser.parse(JSON.stringify({
        type: 'tool_execution_end',
        toolCallId: 'call_orphan',
        result: 'done'
      }) + '\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('tool-result')
      expect((parts[0] as any).toolName).toBe('unknown')
    })

    test('tool error emits error part', () => {
      parser.parse(JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'call_err',
        toolName: 'Bash'
      }) + '\n')
      
      const parts = parser.parse(JSON.stringify({
        type: 'tool_execution_end',
        toolCallId: 'call_err',
        result: 'Command failed',
        isError: true
      }) + '\n')
      
      expect(parts).toHaveLength(2)
      expect(parts[0].type).toBe('tool-input-end')
      expect(parts[1].type).toBe('error')
      expect((parts[1] as any).error.type).toBe('tool_execution_error')
      expect((parts[1] as any).error.toolName).toBe('Bash')
    })

    test('missing toolCallId in start is ignored', () => {
      const parts = parser.parse(JSON.stringify({
        type: 'tool_execution_start',
        toolName: 'Read'
      }) + '\n')
      
      expect(parts).toHaveLength(0)
    })

    test('missing toolCallId in end is ignored', () => {
      const parts = parser.parse(JSON.stringify({
        type: 'tool_execution_end',
        result: 'done'
      }) + '\n')
      
      expect(parts).toHaveLength(0)
    })
  })

  describe('message boundaries', () => {
    test('message_start closes open blocks', () => {
      // Open a text block
      parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello', contentIndex: 0 }
      }) + '\n')
      
      const parts = parser.parse('{"type":"message_start"}\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('text-end')
      expect((parts[0] as any).id).toBe('pi-text-0')
    })

    test('message_end closes open blocks', () => {
      // Open text and reasoning blocks
      parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello', contentIndex: 0 }
      }) + '\n')
      parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', delta: 'Hmm', contentIndex: 1 }
      }) + '\n')
      
      const parts = parser.parse('{"type":"message_end"}\n')
      
      expect(parts.filter(p => p.type === 'text-end')).toHaveLength(1)
      expect(parts.filter(p => p.type === 'reasoning-end')).toHaveLength(1)
    })

    test('message_start closes tool inputs', () => {
      parser.parse(JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'call_123',
        toolName: 'Read'
      }) + '\n')
      
      const parts = parser.parse('{"type":"message_start"}\n')
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('tool-input-end')
    })
  })

  describe('flush', () => {
    test('flush parses remaining buffer', () => {
      parser.parse('{"type":"agent_start"}')
      
      const parts = parser.flush()
      
      expect(parts.some(p => p.type === 'stream-start')).toBe(true)
    })

    test('flush closes open text blocks', () => {
      parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello', contentIndex: 0 }
      }) + '\n')
      
      const parts = parser.flush()
      
      expect(parts.some(p => p.type === 'text-end')).toBe(true)
    })

    test('flush closes open reasoning blocks', () => {
      parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', delta: 'Thinking', contentIndex: 0 }
      }) + '\n')
      
      const parts = parser.flush()
      
      expect(parts.some(p => p.type === 'reasoning-end')).toBe(true)
    })

    test('flush closes open tool inputs', () => {
      parser.parse(JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'call_123',
        toolName: 'Read'
      }) + '\n')
      
      const parts = parser.flush()
      
      expect(parts.some(p => p.type === 'tool-input-end')).toBe(true)
    })

    test('flush emits cli-output for unparseable buffer', () => {
      parser.parse('partial garbage')
      
      const parts = parser.flush()
      
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('cli-output')
    })

    test('flush clears state', () => {
      parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello', contentIndex: 0 }
      }) + '\n')
      
      parser.flush()
      const parts = parser.flush()
      
      // Second flush should return nothing
      expect(parts).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    test('handles missing assistantMessageEvent', () => {
      const parts = parser.parse('{"type":"message_update"}\n')
      
      expect(parts).toHaveLength(0)
    })

    test('handles undefined delta', () => {
      const parts = parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0 }
      }) + '\n')
      
      // No delta = no output
      expect(parts).toHaveLength(0)
    })

    test('handles contentIndex defaulting to 0', () => {
      const parts = parser.parse(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'test' }
      }) + '\n')
      
      expect((parts[0] as any).id).toBe('pi-text-0')
    })

    test('unknown event types return empty', () => {
      const parts = parser.parse('{"type":"unknown_event","data":"foo"}\n')
      
      expect(parts).toHaveLength(0)
    })

    test('handles null result in tool_execution_end', () => {
      parser.parse(JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'call_123',
        toolName: 'Read'
      }) + '\n')
      
      const parts = parser.parse(JSON.stringify({
        type: 'tool_execution_end',
        toolCallId: 'call_123'
      }) + '\n')
      
      expect(parts[1].type).toBe('tool-result')
      expect((parts[1] as any).result).toBeNull()
    })
  })
})
