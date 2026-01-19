import { describe, test, expect } from 'bun:test'
import { ClaudeStreamParser } from './claude-parser.js'

describe('ClaudeStreamParser', () => {
  test('parses stream json events into stream parts', () => {
    const parser = new ClaudeStreamParser()
    const chunk = [
      JSON.stringify({ type: 'stream_start', warnings: [] }),
      JSON.stringify({ type: 'response_metadata', metadata: { model: 'claude-test' } }),
      JSON.stringify({ type: 'content_block_start', content_block: { id: 't1', type: 'text' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'Hello' } }),
      JSON.stringify({ type: 'content_block_stop', indexed_content_block_id: 't1' }),
    ].join('\n') + '\n'

    const parts = parser.parse(chunk)

    expect(parts).toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', metadata: { model: 'claude-test' } },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Hello' },
      { type: 'text-end', id: 't1' },
    ])
  })

  test('parses tool use and results', () => {
    const parser = new ClaudeStreamParser()
    const chunk = [
      JSON.stringify({ type: 'tool_use', id: 'tool-1', name: 'Read', input: { path: '/tmp/file' } }),
      JSON.stringify({ type: 'tool_result', tool_use_id: 'tool-1', name: 'Read', content: 'ok' }),
    ].join('\n') + '\n'

    const parts = parser.parse(chunk)

    expect(parts).toEqual([
      { type: 'tool-input-start', id: 'tool-1', toolName: 'Read' },
      { type: 'tool-input-delta', id: 'tool-1', delta: JSON.stringify({ path: '/tmp/file' }) },
      { type: 'tool-input-end', id: 'tool-1' },
      { type: 'tool-call', toolCallId: 'tool-1', toolName: 'Read', input: JSON.stringify({ path: '/tmp/file' }) },
      { type: 'tool-result', toolCallId: 'tool-1', toolName: 'Read', result: 'ok' },
    ])
  })

  test('falls back to text when not json', () => {
    const parser = new ClaudeStreamParser()
    const parts = parser.parse('Hello world\n')

    expect(parts[0]?.type).toBe('text-start')
    expect(parts[1]).toEqual({ type: 'text-delta', id: parts[0]?.id, delta: 'Hello world' })
  })
})
