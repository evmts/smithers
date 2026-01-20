/**
 * Tests for AmpStreamParser - converts Amp CLI stream-json to SmithersStreamPart
 */

import { describe, test, expect } from 'bun:test'
import { AmpStreamParser } from './amp-parser.js'
import type { SmithersStreamPart } from './types.js'

describe('AmpStreamParser', () => {
  describe('basic parsing', () => {
    test('parse returns empty array for empty chunk', () => {
      const parser = new AmpStreamParser()
      const parts = parser.parse('')

      expect(parts).toEqual([])
    })

    test('parse returns empty array for whitespace chunk', () => {
      const parser = new AmpStreamParser()
      const parts = parser.parse('   \n   ')

      expect(parts).toEqual([])
    })

    test('buffers incomplete lines', () => {
      const parser = new AmpStreamParser()
      const incomplete = '{"type":"assistant","message":'

      const parts = parser.parse(incomplete)

      expect(parts).toEqual([])
    })

    test('processes complete line on newline', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello' }] }
      })

      const parts = parser.parse(line + '\n')

      expect(parts.length).toBeGreaterThan(0)
    })
  })

  describe('assistant message handling', () => {
    test('emits text-start, text-delta, text-end for text block', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello world' }] }
      })

      const parts = parser.parse(line + '\n')

      const textStart = parts.find(p => p.type === 'text-start')
      const textDelta = parts.find(p => p.type === 'text-delta')
      const textEnd = parts.find(p => p.type === 'text-end')

      expect(textStart).toBeDefined()
      expect(textDelta).toBeDefined()
      expect(textEnd).toBeDefined()

      if (textDelta?.type === 'text-delta') {
        expect(textDelta.delta).toBe('Hello world')
      }
    })

    test('handles multiple text blocks', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'First' },
            { type: 'text', text: 'Second' }
          ]
        }
      })

      const parts = parser.parse(line + '\n')

      const textDeltas = parts.filter(p => p.type === 'text-delta')
      expect(textDeltas.length).toBe(2)
    })

    test('extracts tool-call from content blocks', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'read_file', input: { path: '/test.txt' } }
          ]
        }
      })

      const parts = parser.parse(line + '\n')

      const toolCall = parts.find(p => p.type === 'tool-call')
      expect(toolCall).toBeDefined()
      if (toolCall?.type === 'tool-call') {
        expect(toolCall.toolName).toBe('read_file')
        expect(JSON.parse(toolCall.input)).toEqual({ path: '/test.txt' })
      }
    })
  })

  describe('tool event handling', () => {
    test('parses tool_use events', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'tool_use',
        tool_name: 'bash',
        tool_input: { command: 'ls -la' }
      })

      const parts = parser.parse(line + '\n')

      const toolCall = parts.find(p => p.type === 'tool-call')
      expect(toolCall).toBeDefined()
      if (toolCall?.type === 'tool-call') {
        expect(toolCall.toolName).toBe('bash')
        expect(JSON.parse(toolCall.input)).toEqual({ command: 'ls -la' })
      }
    })

    test('parses tool events with name variant', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'tool_call',
        name: 'edit_file',
        input: { path: 'a.ts', content: 'code' }
      })

      const parts = parser.parse(line + '\n')

      const toolCall = parts.find(p => p.type === 'tool-call')
      expect(toolCall).toBeDefined()
      if (toolCall?.type === 'tool-call') {
        expect(toolCall.toolName).toBe('edit_file')
      }
    })

    test('includes tool-result when present', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'tool_result',
        tool_name: 'read_file',
        tool_input: {},
        tool_result: 'file contents here'
      })

      const parts = parser.parse(line + '\n')

      const toolResult = parts.find(p => p.type === 'tool-result')
      expect(toolResult).toBeDefined()
      if (toolResult?.type === 'tool-result') {
        expect(toolResult.result).toBe('file contents here')
      }
    })
  })

  describe('result event handling', () => {
    test('emits finish part with usage', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'result',
        usage: { input_tokens: 100, output_tokens: 50 }
      })

      const parts = parser.parse(line + '\n')

      const finish = parts.find(p => p.type === 'finish')
      expect(finish).toBeDefined()
      if (finish?.type === 'finish') {
        expect(finish.usage.inputTokens.total).toBe(100)
        expect(finish.usage.outputTokens.total).toBe(50)
        expect(finish.finishReason).toEqual({ unified: 'stop' })
      }
    })

    test('handles missing usage in result', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'result',
        usage: {}
      })

      const parts = parser.parse(line + '\n')

      const finish = parts.find(p => p.type === 'finish')
      expect(finish).toBeDefined()
      if (finish?.type === 'finish') {
        expect(finish.usage.inputTokens.total).toBe(0)
        expect(finish.usage.outputTokens.total).toBe(0)
      }
    })
  })

  describe('error event handling', () => {
    test('emits error part', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'error',
        error: 'Something went wrong'
      })

      const parts = parser.parse(line + '\n')

      const errorPart = parts.find(p => p.type === 'error')
      expect(errorPart).toBeDefined()
      if (errorPart?.type === 'error') {
        expect(errorPart.error).toBe('Something went wrong')
      }
    })

    test('error can coexist with other fields', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'assistant',
        error: 'Rate limited',
        message: { content: [] }
      })

      const parts = parser.parse(line + '\n')

      const errorPart = parts.find(p => p.type === 'error')
      expect(errorPart).toBeDefined()
    })
  })

  describe('cli-output fallback', () => {
    test('emits cli-output for non-JSON lines', () => {
      const parser = new AmpStreamParser()

      const parts = parser.parse('not valid json\n')

      expect(parts.length).toBe(1)
      expect(parts[0]?.type).toBe('cli-output')
      if (parts[0]?.type === 'cli-output') {
        expect(parts[0].stream).toBe('stdout')
        expect(parts[0].raw).toBe('not valid json')
      }
    })

    test('emits cli-output for unrecognized event types', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'unknown_event',
        data: { something: true }
      })

      const parts = parser.parse(line + '\n')

      expect(parts.length).toBe(1)
      expect(parts[0]?.type).toBe('cli-output')
    })
  })

  describe('buffering behavior', () => {
    test('buffers partial JSON across chunks', () => {
      const parser = new AmpStreamParser()
      const json = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Complete' }] }
      })

      // Send first half
      const parts1 = parser.parse(json.slice(0, 30))
      expect(parts1).toEqual([])

      // Send second half with newline
      const parts2 = parser.parse(json.slice(30) + '\n')
      expect(parts2.length).toBeGreaterThan(0)
    })

    test('handles multiple lines in single chunk', () => {
      const parser = new AmpStreamParser()
      const lines = [
        JSON.stringify({ type: 'result', usage: { input_tokens: 10, output_tokens: 5 } }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Text' }] }
        })
      ].join('\n') + '\n'

      const parts = parser.parse(lines)

      const finish = parts.find(p => p.type === 'finish')
      const textDelta = parts.find(p => p.type === 'text-delta')
      expect(finish).toBeDefined()
      expect(textDelta).toBeDefined()
    })
  })

  describe('flush', () => {
    test('processes remaining buffer', () => {
      const parser = new AmpStreamParser()
      const json = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Buffered' }] }
      })

      // Parse without newline
      parser.parse(json)

      // Flush should process the buffer
      const parts = parser.flush()
      const textDelta = parts.find(p => p.type === 'text-delta')
      expect(textDelta).toBeDefined()
    })

    test('returns cli-output for non-JSON buffer', () => {
      const parser = new AmpStreamParser()
      parser.parse('incomplete text')

      const parts = parser.flush()

      expect(parts.length).toBe(1)
      expect(parts[0]?.type).toBe('cli-output')
    })

    test('returns empty for empty buffer', () => {
      const parser = new AmpStreamParser()

      const parts = parser.flush()

      expect(parts).toEqual([])
    })

    test('clears buffer after flush', () => {
      const parser = new AmpStreamParser()
      parser.parse('some text')
      parser.flush()

      const parts = parser.flush()
      expect(parts).toEqual([])
    })
  })

  describe('UUID generation', () => {
    test('text blocks have unique IDs', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'First' },
            { type: 'text', text: 'Second' }
          ]
        }
      })

      const parts = parser.parse(line + '\n')

      const textStarts = parts.filter(p => p.type === 'text-start') as Array<{ type: 'text-start'; id: string }>
      expect(textStarts.length).toBe(2)
      expect(textStarts[0]?.id).not.toBe(textStarts[1]?.id)
    })

    test('tool calls have unique IDs', () => {
      const parser = new AmpStreamParser()
      const lines = [
        JSON.stringify({ type: 'tool_use', name: 'read', input: {} }),
        JSON.stringify({ type: 'tool_use', name: 'write', input: {} })
      ].join('\n') + '\n'

      const parts = parser.parse(lines)

      const toolCalls = parts.filter(p => p.type === 'tool-call') as Array<{ type: 'tool-call'; toolCallId: string }>
      expect(toolCalls.length).toBe(2)
      expect(toolCalls[0]?.toolCallId).not.toBe(toolCalls[1]?.toolCallId)
    })
  })

  describe('edge cases', () => {
    test('handles empty content array', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'assistant',
        message: { content: [] }
      })

      const parts = parser.parse(line + '\n')

      // Assistant with empty content array returns early with no parts
      expect(parts.length).toBe(0)
    })

    test('handles missing message field', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'assistant'
      })

      const parts = parser.parse(line + '\n')

      expect(parts.length).toBe(1)
      expect(parts[0]?.type).toBe('cli-output')
    })

    test('handles unicode text', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '你好 🌍' }] }
      })

      const parts = parser.parse(line + '\n')

      const textDelta = parts.find(p => p.type === 'text-delta')
      if (textDelta?.type === 'text-delta') {
        expect(textDelta.delta).toBe('你好 🌍')
      }
    })

    test('handles very long text', () => {
      const parser = new AmpStreamParser()
      const longText = 'x'.repeat(100000)
      const line = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: longText }] }
      })

      const parts = parser.parse(line + '\n')

      const textDelta = parts.find(p => p.type === 'text-delta')
      if (textDelta?.type === 'text-delta') {
        expect(textDelta.delta.length).toBe(100000)
      }
    })

    test('handles special characters in text', () => {
      const parser = new AmpStreamParser()
      const specialText = 'Line1\nLine2\t"quoted"\\'
      const line = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: specialText }] }
      })

      const parts = parser.parse(line + '\n')

      const textDelta = parts.find(p => p.type === 'text-delta')
      if (textDelta?.type === 'text-delta') {
        expect(textDelta.delta).toBe(specialText)
      }
    })

    test('handles null/undefined tool input', () => {
      const parser = new AmpStreamParser()
      const line = JSON.stringify({
        type: 'tool_use',
        name: 'test_tool'
        // input missing
      })

      const parts = parser.parse(line + '\n')

      const toolCall = parts.find(p => p.type === 'tool-call')
      expect(toolCall).toBeDefined()
      if (toolCall?.type === 'tool-call') {
        expect(toolCall.toolName).toBe('test_tool')
        expect(toolCall.input).toBe('{}')
      }
    })
  })

  describe('streaming simulation', () => {
    test('simulates realistic streaming scenario', () => {
      const parser = new AmpStreamParser()
      const allParts: SmithersStreamPart[] = []

      // Simulate streaming chunks
      const chunks = [
        '{"type":"start","session_id":"sess-123"}\n',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Let me "}]}}\n',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"help you."}]}}\n',
        '{"type":"tool_use","name":"read_file","input":{"path":"/test.txt"}}\n',
        '{"type":"tool_result","name":"read_file","result":"file content"}\n',
        '{"type":"result","usage":{"input_tokens":50,"output_tokens":25}}\n'
      ]

      for (const chunk of chunks) {
        allParts.push(...parser.parse(chunk))
      }

      // Verify we got expected parts
      const textDeltas = allParts.filter(p => p.type === 'text-delta')
      const toolCalls = allParts.filter(p => p.type === 'tool-call')
      const toolResults = allParts.filter(p => p.type === 'tool-result')
      const finishes = allParts.filter(p => p.type === 'finish')

      expect(textDeltas.length).toBe(2)
      // tool_use and tool_result both emit tool-call since type includes 'tool'
      expect(toolCalls.length).toBe(2)
      expect(toolResults.length).toBe(1)
      expect(finishes.length).toBe(1)
    })
  })
})
