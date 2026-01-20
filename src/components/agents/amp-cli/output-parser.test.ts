/**
 * Tests for output parser - Amp CLI stream-json output parsing
 */

import { describe, test, expect } from 'bun:test'
import {
  parseAmpOutput,
  extractTextFromStreamEvent,
  extractToolCallFromStreamEvent,
  AmpMessageParser
} from './output-parser.js'

describe('parseAmpOutput', () => {
  describe('assistant message parsing', () => {
    test('extracts text from assistant message content', () => {
      const output = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello, world!' }
          ]
        }
      })

      const result = parseAmpOutput(output, 0)

      expect(result.output).toBe('Hello, world!')
    })

    test('extracts multiple text blocks', () => {
      const output = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'First ' },
            { type: 'text', text: 'Second' }
          ]
        }
      })

      const result = parseAmpOutput(output, 0)

      expect(result.output).toBe('First \nSecond')
    })

    test('ignores non-text content blocks', () => {
      const output = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tool1', name: 'read_file' },
            { type: 'text', text: 'Only this' }
          ]
        }
      })

      const result = parseAmpOutput(output, 0)

      expect(result.output).toBe('Only this')
    })
  })

  describe('token usage extraction', () => {
    test('extracts token usage from result event', () => {
      const output = JSON.stringify({
        type: 'result',
        usage: { input_tokens: 100, output_tokens: 50 }
      })

      const result = parseAmpOutput(output, 0)

      expect(result.tokensUsed.input).toBe(100)
      expect(result.tokensUsed.output).toBe(50)
    })

    test('defaults to 0 tokens when missing', () => {
      const output = JSON.stringify({ type: 'assistant', message: { content: [] } })

      const result = parseAmpOutput(output, 0)

      expect(result.tokensUsed.input).toBe(0)
      expect(result.tokensUsed.output).toBe(0)
    })

    test('handles partial usage data', () => {
      const output = JSON.stringify({
        type: 'result',
        usage: { input_tokens: 100 }
        // output_tokens missing
      })

      const result = parseAmpOutput(output, 0)

      expect(result.tokensUsed.input).toBe(100)
      expect(result.tokensUsed.output).toBe(0)
    })
  })

  describe('session ID extraction', () => {
    test('extracts session_id from event', () => {
      const output = JSON.stringify({
        type: 'start',
        session_id: 'session-abc123'
      })

      const result = parseAmpOutput(output, 0)

      expect(result.sessionId).toBe('session-abc123')
    })

    test('sessionId is undefined when not present', () => {
      const output = JSON.stringify({ type: 'assistant', message: { content: [] } })

      const result = parseAmpOutput(output, 0)

      expect(result.sessionId).toBeUndefined()
    })
  })

  describe('stop reason handling', () => {
    test('returns completed for exit code 0', () => {
      const output = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Done' }] }
      })

      const result = parseAmpOutput(output, 0)

      expect(result.stopReason).toBe('completed')
    })

    test('returns error for non-zero exit code', () => {
      const output = JSON.stringify({ type: 'error', error: 'Something failed' })

      const result = parseAmpOutput(output, 1)

      expect(result.stopReason).toBe('error')
    })
  })

  describe('multiline NDJSON parsing', () => {
    test('parses multiple JSON lines', () => {
      const lines = [
        JSON.stringify({ type: 'start', session_id: 'sess-1' }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello' }] }
        }),
        JSON.stringify({ type: 'result', usage: { input_tokens: 50, output_tokens: 25 } })
      ]
      const output = lines.join('\n')

      const result = parseAmpOutput(output, 0)

      expect(result.output).toBe('Hello')
      expect(result.tokensUsed.input).toBe(50)
      expect(result.tokensUsed.output).toBe(25)
      expect(result.sessionId).toBe('sess-1')
    })

    test('handles empty lines', () => {
      const output = '\n\n' + JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Content' }] }
      }) + '\n\n'

      const result = parseAmpOutput(output, 0)

      expect(result.output).toBe('Content')
    })
  })

  describe('non-JSON handling', () => {
    test('appends non-JSON lines as text', () => {
      const output = 'Raw text output\nMore raw text'

      const result = parseAmpOutput(output, 0)

      expect(result.output).toContain('Raw text output')
      expect(result.output).toContain('More raw text')
    })

    test('handles mixed JSON and non-JSON', () => {
      const lines = [
        'Some prefix text',
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'JSON content' }] }
        }),
        'Some suffix text'
      ]
      const output = lines.join('\n')

      const result = parseAmpOutput(output, 0)

      expect(result.output).toContain('Some prefix text')
      expect(result.output).toContain('JSON content')
      expect(result.output).toContain('Some suffix text')
    })
  })

  describe('edge cases', () => {
    test('handles empty string', () => {
      const result = parseAmpOutput('', 0)

      expect(result.output).toBe('')
      expect(result.tokensUsed).toEqual({ input: 0, output: 0 })
      expect(result.turnsUsed).toBe(0)
    })

    test('handles unicode content', () => {
      const output = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '你好世界 🌍' }] }
      })

      const result = parseAmpOutput(output, 0)

      expect(result.output).toBe('你好世界 🌍')
    })

    test('handles JSON with special characters', () => {
      const output = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Line1\n"quoted"\ttab' }] }
      })

      const result = parseAmpOutput(output, 0)

      expect(result.output).toBe('Line1\n"quoted"\ttab')
    })
  })
})

describe('extractTextFromStreamEvent', () => {
  test('extracts text from valid assistant event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'World' }
        ]
      }
    })

    const result = extractTextFromStreamEvent(line)

    expect(result).toBe('Hello World')
  })

  test('returns null for non-assistant events', () => {
    const line = JSON.stringify({ type: 'result', usage: {} })

    const result = extractTextFromStreamEvent(line)

    expect(result).toBeNull()
  })

  test('returns null for invalid JSON', () => {
    const line = 'not valid json {'

    const result = extractTextFromStreamEvent(line)

    expect(result).toBeNull()
  })

  test('returns empty string for assistant with no text', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use' }] }
    })

    const result = extractTextFromStreamEvent(line)

    expect(result).toBe('')
  })
})

describe('extractToolCallFromStreamEvent', () => {
  test('extracts tool call with name and input', () => {
    const line = JSON.stringify({
      type: 'tool_use',
      name: 'read_file',
      input: { path: '/test.txt' }
    })

    const result = extractToolCallFromStreamEvent(line)

    expect(result).not.toBeNull()
    expect(result!.toolName).toBe('read_file')
    expect(result!.input).toEqual({ path: '/test.txt' })
  })

  test('extracts tool_name variant', () => {
    const line = JSON.stringify({
      type: 'tool_call',
      tool_name: 'write_file',
      arguments: { content: 'hello' }
    })

    const result = extractToolCallFromStreamEvent(line)

    expect(result).not.toBeNull()
    expect(result!.toolName).toBe('write_file')
    expect(result!.input).toEqual({ content: 'hello' })
  })

  test('extracts toolName camelCase variant', () => {
    const line = JSON.stringify({
      type: 'toolUse',
      toolName: 'bash',
      args: { command: 'ls' }
    })

    const result = extractToolCallFromStreamEvent(line)

    expect(result).not.toBeNull()
    expect(result!.toolName).toBe('bash')
    expect(result!.input).toEqual({ command: 'ls' })
  })

  test('extracts nested tool.name', () => {
    const line = JSON.stringify({
      type: 'tool_event',
      tool: { name: 'edit', input: { file: 'a.ts' } }
    })

    const result = extractToolCallFromStreamEvent(line)

    expect(result).not.toBeNull()
    expect(result!.toolName).toBe('edit')
    expect(result!.input).toEqual({ file: 'a.ts' })
  })

  test('extracts data.input variant', () => {
    const line = JSON.stringify({
      type: 'tool',
      name: 'glob',
      data: { input: { pattern: '*.ts' } }
    })

    const result = extractToolCallFromStreamEvent(line)

    expect(result).not.toBeNull()
    expect(result!.toolName).toBe('glob')
    expect(result!.input).toEqual({ pattern: '*.ts' })
  })

  test('returns unknown for tool without name', () => {
    const line = JSON.stringify({
      type: 'tool_use',
      input: { data: 'value' }
    })

    const result = extractToolCallFromStreamEvent(line)

    expect(result).not.toBeNull()
    expect(result!.toolName).toBe('unknown')
  })

  test('returns null for non-tool events', () => {
    const line = JSON.stringify({ type: 'assistant', message: {} })

    const result = extractToolCallFromStreamEvent(line)

    expect(result).toBeNull()
  })

  test('returns null for tool_result events', () => {
    const line = JSON.stringify({ type: 'tool_result', result: 'success' })

    const result = extractToolCallFromStreamEvent(line)

    expect(result).toBeNull()
  })

  test('returns null for invalid JSON', () => {
    const result = extractToolCallFromStreamEvent('invalid json')

    expect(result).toBeNull()
  })
})

describe('AmpMessageParser', () => {
  describe('chunk parsing', () => {
    test('processes complete lines', () => {
      const parser = new AmpMessageParser()
      parser.parseChunk(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello' }] }
      }) + '\n')

      const entries = parser.getLatestEntries(10)

      expect(entries.length).toBe(1)
      expect(entries[0]?.type).toBe('message')
      expect(entries[0]?.content).toBe('Hello')
    })

    test('buffers partial lines', () => {
      const parser = new AmpMessageParser()
      const json = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello' }] }
      })

      // Send partial JSON
      parser.parseChunk(json.slice(0, 20))
      expect(parser.getLatestEntries(10).length).toBe(0)

      // Complete the line
      parser.parseChunk(json.slice(20) + '\n')
      expect(parser.getLatestEntries(10).length).toBe(1)
    })

    test('processes multiple lines in one chunk', () => {
      const parser = new AmpMessageParser()
      const lines = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'First' }] }
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Second' }] }
        })
      ].join('\n') + '\n'

      parser.parseChunk(lines)
      const entries = parser.getLatestEntries(10)

      // Messages get concatenated into one entry
      expect(entries.some(e => e.content.includes('First'))).toBe(true)
      expect(entries.some(e => e.content.includes('Second'))).toBe(true)
    })
  })

  describe('tool call handling', () => {
    test('creates tool-call entries', () => {
      const parser = new AmpMessageParser()
      parser.parseChunk(JSON.stringify({
        type: 'tool_use',
        name: 'read_file',
        input: { path: '/test.txt' }
      }) + '\n')

      const entries = parser.getLatestEntries(10)

      expect(entries.length).toBe(1)
      expect(entries[0]?.type).toBe('tool-call')
      expect(entries[0]?.toolName).toBe('read_file')
    })

    test('calls onToolCall callback', () => {
      const calls: Array<{ tool: string; input: unknown }> = []
      const parser = new AmpMessageParser(100, (tool, input) => {
        calls.push({ tool, input })
      })

      parser.parseChunk(JSON.stringify({
        type: 'tool_call',
        name: 'bash',
        input: { command: 'ls' }
      }) + '\n')

      expect(calls.length).toBe(1)
      expect(calls[0]?.tool).toBe('bash')
    })

    test('setOnToolCall updates callback', () => {
      const calls: string[] = []
      const parser = new AmpMessageParser()

      parser.setOnToolCall((tool) => calls.push(tool))
      parser.parseChunk(JSON.stringify({
        type: 'tool_use',
        name: 'edit'
      }) + '\n')

      expect(calls).toContain('edit')
    })
  })

  describe('message concatenation', () => {
    test('appends text to current message entry', () => {
      const parser = new AmpMessageParser()
      parser.parseChunk(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello ' }] }
      }) + '\n')
      parser.parseChunk(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'World' }] }
      }) + '\n')

      const entries = parser.getLatestEntries(10)
      const messageEntries = entries.filter(e => e.type === 'message')

      // Should concatenate into a single message
      expect(messageEntries.length).toBe(1)
      expect(messageEntries[0]?.content).toContain('Hello')
      expect(messageEntries[0]?.content).toContain('World')
    })

    test('tool call breaks message concatenation', () => {
      const parser = new AmpMessageParser()
      parser.parseChunk(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Before' }] }
      }) + '\n')
      parser.parseChunk(JSON.stringify({
        type: 'tool_use',
        name: 'read_file'
      }) + '\n')
      parser.parseChunk(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'After' }] }
      }) + '\n')

      const entries = parser.getLatestEntries(10)
      const messageEntries = entries.filter(e => e.type === 'message')

      expect(messageEntries.length).toBe(2)
    })
  })

  describe('max entries limit', () => {
    test('respects maxEntries limit', () => {
      const parser = new AmpMessageParser(3)

      for (let i = 0; i < 5; i++) {
        parser.parseChunk(JSON.stringify({
          type: 'tool_use',
          name: `tool${i}`
        }) + '\n')
      }

      const entries = parser.getLatestEntries(10)
      expect(entries.length).toBe(3)
    })
  })

  describe('flush', () => {
    test('processes remaining buffer', () => {
      const parser = new AmpMessageParser()
      parser.parseChunk(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Buffered' }] }
      })) // No newline

      expect(parser.getLatestEntries(10).length).toBe(0)

      parser.flush()

      const entries = parser.getLatestEntries(10)
      expect(entries.length).toBe(1)
      expect(entries[0]?.content).toContain('Buffered')
    })

    test('handles empty buffer', () => {
      const parser = new AmpMessageParser()
      parser.flush()

      expect(parser.getLatestEntries(10).length).toBe(0)
    })
  })

  describe('reset', () => {
    test('clears all state', () => {
      const parser = new AmpMessageParser()
      parser.parseChunk(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Data' }] }
      }) + '\n')

      expect(parser.getLatestEntries(10).length).toBe(1)

      parser.reset()

      expect(parser.getLatestEntries(10).length).toBe(0)
    })
  })

  describe('getLatestEntries', () => {
    test('returns last N entries', () => {
      const parser = new AmpMessageParser()
      for (let i = 0; i < 5; i++) {
        parser.parseChunk(JSON.stringify({
          type: 'tool_use',
          name: `tool${i}`
        }) + '\n')
      }

      const last2 = parser.getLatestEntries(2)
      expect(last2.length).toBe(2)
      expect(last2[0]?.toolName).toBe('tool3')
      expect(last2[1]?.toolName).toBe('tool4')
    })

    test('returns all when N exceeds count', () => {
      const parser = new AmpMessageParser()
      parser.parseChunk(JSON.stringify({
        type: 'tool_use',
        name: 'only'
      }) + '\n')

      const entries = parser.getLatestEntries(100)
      expect(entries.length).toBe(1)
    })
  })
})
