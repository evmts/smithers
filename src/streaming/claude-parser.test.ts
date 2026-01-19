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

  test('parses reasoning blocks', () => {
    const parser = new ClaudeStreamParser()
    const chunk = [
      JSON.stringify({ type: 'content_block_start', content_block: { id: 'r1', type: 'thinking' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { thinking: 'Let me think...' } }),
      JSON.stringify({ type: 'content_block_stop', indexed_content_block_id: 'r1' }),
    ].join('\n') + '\n'

    const parts = parser.parse(chunk)

    expect(parts).toEqual([
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'Let me think...' },
      { type: 'reasoning-end', id: 'r1' },
    ])
  })

  test('parses reasoning blocks with reasoning type', () => {
    const parser = new ClaudeStreamParser()
    const chunk = [
      JSON.stringify({ type: 'content_block_start', content_block: { id: 'r2', type: 'reasoning' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { reasoning: 'Analyzing...' } }),
      JSON.stringify({ type: 'content_block_stop', indexed_content_block_id: 'r2' }),
    ].join('\n') + '\n'

    const parts = parser.parse(chunk)

    expect(parts).toEqual([
      { type: 'reasoning-start', id: 'r2' },
      { type: 'reasoning-delta', id: 'r2', delta: 'Analyzing...' },
      { type: 'reasoning-end', id: 'r2' },
    ])
  })

  test('parses message_stop with usage', () => {
    const parser = new ClaudeStreamParser()
    const chunk = JSON.stringify({
      type: 'message_stop',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    }) + '\n'

    const parts = parser.parse(chunk)

    expect(parts).toEqual([
      {
        type: 'finish',
        usage: {
          inputTokens: { total: 100 },
          outputTokens: { total: 50 },
        },
        finishReason: { unified: 'end_turn' },
      },
    ])
  })

  test('parses message_start with model metadata', () => {
    const parser = new ClaudeStreamParser()
    const chunk = JSON.stringify({
      type: 'message_start',
      message: { id: 'msg-123', model: 'claude-3-opus' },
    }) + '\n'

    const parts = parser.parse(chunk)

    expect(parts).toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', metadata: { model: 'claude-3-opus', requestId: 'msg-123' } },
    ])
  })

  test('parses error events', () => {
    const parser = new ClaudeStreamParser()
    const chunk = JSON.stringify({
      type: 'error',
      error: { type: 'rate_limit', message: 'Too many requests' },
    }) + '\n'

    const parts = parser.parse(chunk)

    expect(parts).toEqual([
      { type: 'error', error: { type: 'rate_limit', message: 'Too many requests' } },
    ])
  })

  test('flush returns buffered content', () => {
    const parser = new ClaudeStreamParser()
    parser.parse('partial content')
    const parts = parser.flush()

    expect(parts[0]?.type).toBe('text-start')
    expect(parts[1]?.type).toBe('text-delta')
    expect((parts[1] as any)?.delta).toBe('partial content')
  })

  test('flush returns empty for empty buffer', () => {
    const parser = new ClaudeStreamParser()
    const parts = parser.flush()
    expect(parts).toEqual([])
  })

  test('handles partial JSON across chunks', () => {
    const parser = new ClaudeStreamParser()
    const event = { type: 'content_block_delta', delta: { text: 'Hello' } }
    const json = JSON.stringify(event)

    const parts1 = parser.parse(json.slice(0, 20))
    expect(parts1).toEqual([])

    const parts2 = parser.parse(json.slice(20) + '\n')
    expect(parts2).toContainEqual({ type: 'text-delta', id: expect.any(String), delta: 'Hello' })
  })

  test('parses streaming tool_use via content_block', () => {
    const parser = new ClaudeStreamParser()
    const chunk = [
      JSON.stringify({ type: 'content_block_start', content_block: { id: 'tu1', type: 'tool_use', name: 'Bash' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { input: { cmd: 'ls' } } }),
      JSON.stringify({ type: 'content_block_stop', indexed_content_block_id: 'tu1' }),
    ].join('\n') + '\n'

    const parts = parser.parse(chunk)

    expect(parts).toEqual([
      { type: 'tool-input-start', id: 'tu1', toolName: 'Bash' },
      { type: 'tool-input-delta', id: 'tu1', delta: JSON.stringify({ cmd: 'ls' }) },
      { type: 'tool-input-end', id: 'tu1' },
    ])
  })

  test('unknown events emit cli-output', () => {
    const parser = new ClaudeStreamParser()
    const chunk = JSON.stringify({ type: 'unknown_event', data: 'test' }) + '\n'

    const parts = parser.parse(chunk)

    expect(parts).toEqual([
      { type: 'cli-output', stream: 'stdout', raw: JSON.stringify({ type: 'unknown_event', data: 'test' }) },
    ])
  })

  test('text fallback closes previous block before starting new text', () => {
    const parser = new ClaudeStreamParser()
    const chunk = [
      JSON.stringify({ type: 'content_block_start', content_block: { id: 'r1', type: 'thinking' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { thinking: 'hmm' } }),
    ].join('\n') + '\n'

    parser.parse(chunk)
    const parts = parser.parse('plain text\n')

    expect(parts[0]).toEqual({ type: 'reasoning-end', id: 'r1' })
    expect(parts[1]?.type).toBe('text-start')
    expect(parts[2]?.type).toBe('text-delta')
  })
})
