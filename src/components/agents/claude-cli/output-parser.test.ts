/**
 * Tests for output parser - token/turn extraction from CLI output
 */

import { describe, test, expect } from 'bun:test'
import { parseClaudeOutput } from './output-parser.js'

describe('parseClaudeOutput', () => {
  describe('text output format', () => {
    test('returns output as-is for plain text', () => {
      const result = parseClaudeOutput('Hello, world!', 'text')

      expect(result.output).toBe('Hello, world!')
      expect(result.structured).toBeUndefined()
    })

    test('extracts token usage from text pattern', () => {
      const stdout = 'Some output\ntokens: 100 input, 50 output\nMore output'
      const result = parseClaudeOutput(stdout, 'text')

      expect(result.tokensUsed.input).toBe(100)
      expect(result.tokensUsed.output).toBe(50)
    })

    test('extracts token usage with comma', () => {
      const stdout = 'Response\nToken: 200 input, 150 output'
      const result = parseClaudeOutput(stdout, 'text')

      expect(result.tokensUsed.input).toBe(200)
      expect(result.tokensUsed.output).toBe(150)
    })

    test('extracts turn count from text pattern', () => {
      const stdout = 'Output\nturns: 5\nMore'
      const result = parseClaudeOutput(stdout, 'text')

      expect(result.turnsUsed).toBe(5)
    })

    test('extracts turn count with singular form', () => {
      const stdout = 'Output\nturn: 1'
      const result = parseClaudeOutput(stdout, 'text')

      expect(result.turnsUsed).toBe(1)
    })

    test('handles case-insensitive patterns', () => {
      const stdout = 'TOKENS: 50 INPUT, 25 OUTPUT\nTURNS: 3'
      const result = parseClaudeOutput(stdout, 'text')

      expect(result.tokensUsed.input).toBe(50)
      expect(result.tokensUsed.output).toBe(25)
      expect(result.turnsUsed).toBe(3)
    })

    test('defaults to 0 tokens and 1 turn when not found', () => {
      const result = parseClaudeOutput('No usage info here', 'text')

      expect(result.tokensUsed.input).toBe(0)
      expect(result.tokensUsed.output).toBe(0)
      expect(result.turnsUsed).toBe(1)
    })
  })

  describe('json output format', () => {
    test('parses valid JSON output', () => {
      const json = JSON.stringify({ message: 'hello', value: 42 })
      const result = parseClaudeOutput(json, 'json')

      expect(result.structured).toEqual({ message: 'hello', value: 42 })
    })

    test('extracts usage from JSON if present', () => {
      const json = JSON.stringify({
        content: 'response',
        usage: { input_tokens: 100, output_tokens: 50 }
      })
      const result = parseClaudeOutput(json, 'json')

      expect(result.tokensUsed.input).toBe(100)
      expect(result.tokensUsed.output).toBe(50)
    })

    test('extracts turns from JSON if present', () => {
      const json = JSON.stringify({
        content: 'response',
        turns: 7
      })
      const result = parseClaudeOutput(json, 'json')

      expect(result.turnsUsed).toBe(7)
    })

    test('handles string JSON output', () => {
      const json = JSON.stringify('just a string')
      const result = parseClaudeOutput(json, 'json')

      expect(result.output).toBe('just a string')
      expect(result.structured).toBe('just a string')
    })

    test('handles invalid JSON gracefully', () => {
      const invalid = 'not valid json {'
      const result = parseClaudeOutput(invalid, 'json')

      expect(result.output).toBe(invalid)
      expect(result.structured).toBeUndefined()
    })

    test('formats object JSON in output', () => {
      const obj = { key: 'value', nested: { a: 1 } }
      const json = JSON.stringify(obj)
      const result = parseClaudeOutput(json, 'json')

      expect(result.output).toBe(JSON.stringify(obj, null, 2))
    })
  })

  describe('stream-json output format', () => {
    test('handles stream-json like json', () => {
      const json = JSON.stringify({
        result: 'streamed',
        usage: { input_tokens: 200, output_tokens: 100 }
      })
      const result = parseClaudeOutput(json, 'stream-json')

      expect(result.structured).toEqual({
        result: 'streamed',
        usage: { input_tokens: 200, output_tokens: 100 }
      })
      expect(result.tokensUsed.input).toBe(200)
      expect(result.tokensUsed.output).toBe(100)
    })
  })

  describe('default output format', () => {
    test('defaults to text format', () => {
      const result = parseClaudeOutput('plain text')

      expect(result.output).toBe('plain text')
      expect(result.structured).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    test('handles empty string', () => {
      const result = parseClaudeOutput('', 'text')

      expect(result.output).toBe('')
      expect(result.tokensUsed).toEqual({ input: 0, output: 0 })
      expect(result.turnsUsed).toBe(1)
    })

    test('handles multiline output', () => {
      const stdout = `First line
Second line
tokens: 500 input, 250 output
Third line
turns: 10`
      const result = parseClaudeOutput(stdout, 'text')

      expect(result.output).toBe(stdout)
      expect(result.tokensUsed.input).toBe(500)
      expect(result.tokensUsed.output).toBe(250)
      expect(result.turnsUsed).toBe(10)
    })

    test('handles JSON with no usage field', () => {
      const json = JSON.stringify({ data: [1, 2, 3] })
      const result = parseClaudeOutput(json, 'json')

      expect(result.tokensUsed).toEqual({ input: 0, output: 0 })
    })

    test('handles JSON usage with missing fields', () => {
      const json = JSON.stringify({
        usage: { input_tokens: 100 }
        // output_tokens missing
      })
      const result = parseClaudeOutput(json, 'json')

      expect(result.tokensUsed.input).toBe(100)
      expect(result.tokensUsed.output).toBe(0)
    })

    test('handles JSON array', () => {
      const json = JSON.stringify([1, 2, 3])
      const result = parseClaudeOutput(json, 'json')

      expect(result.structured).toEqual([1, 2, 3])
      expect(result.output).toBe('[\n  1,\n  2,\n  3\n]')
    })

    test('prefers text pattern over JSON default when format is text', () => {
      const stdout = 'Some response\ntokens: 300 input, 150 output\nturns: 4'
      const result = parseClaudeOutput(stdout, 'text')

      // Should extract from text pattern even though JSON parsing would fail
      expect(result.tokensUsed.input).toBe(300)
      expect(result.tokensUsed.output).toBe(150)
      expect(result.turnsUsed).toBe(4)
    })
  })
})
