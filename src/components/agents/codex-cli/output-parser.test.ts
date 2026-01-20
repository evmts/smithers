/**
 * Tests for output parser - Codex CLI output parsing
 */

import { describe, test, expect } from 'bun:test'
import { parseCodexOutput } from './output-parser.js'

describe('parseCodexOutput', () => {
  describe('non-json output', () => {
    test('returns output as-is for plain text', () => {
      const result = parseCodexOutput('Hello, world!', false)

      expect(result.output).toBe('Hello, world!')
      expect(result.structured).toBeUndefined()
    })

    test('defaults to zero tokens and turns', () => {
      const result = parseCodexOutput('Some output', false)

      expect(result.tokensUsed.input).toBe(0)
      expect(result.tokensUsed.output).toBe(0)
      expect(result.turnsUsed).toBe(0)
    })

    test('handles empty string', () => {
      const result = parseCodexOutput('', false)

      expect(result.output).toBe('')
      expect(result.tokensUsed).toEqual({ input: 0, output: 0 })
      expect(result.turnsUsed).toBe(0)
    })

    test('handles multiline output', () => {
      const stdout = `First line
Second line
Third line`
      const result = parseCodexOutput(stdout, false)

      expect(result.output).toBe(stdout)
    })
  })

  describe('json output', () => {
    test('parses JSONL with message events', () => {
      const lines = [
        JSON.stringify({ type: 'message', content: 'Hello world' }),
        JSON.stringify({ type: 'done' }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.output).toBe('Hello world')
    })

    test('extracts usage from usage event', () => {
      const lines = [
        JSON.stringify({ type: 'message', content: 'Response' }),
        JSON.stringify({ type: 'usage', input_tokens: 100, output_tokens: 50 }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.tokensUsed.input).toBe(100)
      expect(result.tokensUsed.output).toBe(50)
    })

    test('extracts usage from nested usage object', () => {
      const lines = [
        JSON.stringify({ type: 'message', content: 'Response' }),
        JSON.stringify({ usage: { input_tokens: 200, output_tokens: 100 } }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.tokensUsed.input).toBe(200)
      expect(result.tokensUsed.output).toBe(100)
    })

    test('extracts structured output from output event', () => {
      const lines = [
        JSON.stringify({ type: 'output', data: { key: 'value', items: [1, 2, 3] } }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.structured).toEqual({ key: 'value', items: [1, 2, 3] })
    })

    test('handles invalid JSON lines gracefully', () => {
      const lines = [
        'not valid json',
        JSON.stringify({ type: 'message', content: 'Valid message' }),
        'another invalid line {',
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.output).toBe('Valid message')
    })

    test('handles empty lines', () => {
      const lines = [
        '',
        JSON.stringify({ type: 'message', content: 'Message' }),
        '',
        '   ',
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.output).toBe('Message')
    })

    test('uses last message content', () => {
      const lines = [
        JSON.stringify({ type: 'message', content: 'First' }),
        JSON.stringify({ type: 'message', content: 'Second' }),
        JSON.stringify({ type: 'message', content: 'Last' }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.output).toBe('Last')
    })

    test('preserves original output when no message events', () => {
      const lines = [
        JSON.stringify({ type: 'status', status: 'running' }),
        JSON.stringify({ type: 'done' }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.output).toBe(lines)
    })
  })

  describe('edge cases', () => {
    test('handles undefined isJson parameter', () => {
      const result = parseCodexOutput('plain text')

      expect(result.output).toBe('plain text')
      expect(result.structured).toBeUndefined()
    })

    test('handles JSON with special characters in strings', () => {
      const lines = [
        JSON.stringify({ type: 'message', content: 'Hello\n"World"\t\\Path' }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.output).toBe('Hello\n"World"\t\\Path')
    })

    test('handles JSON with unicode', () => {
      const lines = [
        JSON.stringify({ type: 'message', content: '你好世界 🌍' }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.output).toBe('你好世界 🌍')
    })

    test('handles deeply nested structured output', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      }
      const lines = [
        JSON.stringify({ type: 'output', data }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.structured).toEqual(data)
    })

    test('handles array structured output', () => {
      const data = [1, 2, 3, { key: 'value' }]
      const lines = [
        JSON.stringify({ type: 'output', data }),
      ].join('\n')
      const result = parseCodexOutput(lines, true)

      expect(result.structured).toEqual(data)
    })
  })
})
