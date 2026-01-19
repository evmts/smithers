/**
 * Unit tests for output-parser.ts - Output parsing for monitor.
 */
import { describe, test, expect } from 'bun:test'
import { OutputParser } from './output-parser.js'

describe('OutputParser', () => {
  describe('parseChunk', () => {
    test('parses phase events', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Phase: Research - STARTING\n')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('phase')
      expect(events[0].data.name).toBe('Research')
      expect(events[0].data.status).toBe('STARTING')
    })

    test('parses agent events', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Agent: MainAgent - RUNNING\n')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('agent')
      expect(events[0].data.name).toBe('MainAgent')
      expect(events[0].data.status).toBe('RUNNING')
    })

    test('parses Claude agent events', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Claude executing task\n')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('agent')
    })

    test('parses tool events', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Tool: Read - /path/to/file\n')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('tool')
      expect(events[0].data.name).toBe('Read')
      expect(events[0].data.details).toBe('/path/to/file')
    })

    test('parses Ralph iteration events', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Iteration 5 starting\n')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('ralph')
      expect(events[0].data.iteration).toBe(5)
    })

    test('parses error events', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Error: Something went wrong\n')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('error')
      expect(events[0].data.message).toContain('Something went wrong')
    })

    test('parses stack trace lines as errors', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('    at someFunction (/path/to/file:10:5)\n')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('error')
    })

    test('parses generic log lines', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Some log message\n')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('log')
      expect(events[0].data.message).toBe('Some log message')
    })

    test('handles multiple lines', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Phase: Init\nTool: Read\nLog message\n')

      expect(events).toHaveLength(3)
      expect(events[0].type).toBe('phase')
      expect(events[1].type).toBe('tool')
      expect(events[2].type).toBe('log')
    })

    test('buffers incomplete lines', () => {
      const parser = new OutputParser()
      
      // First chunk doesn't end with newline
      const events1 = parser.parseChunk('Phase: Resear')
      expect(events1).toHaveLength(0)
      
      // Second chunk completes the line
      const events2 = parser.parseChunk('ch\n')
      expect(events2).toHaveLength(1)
      expect(events2[0].type).toBe('phase')
      expect(events2[0].data.name).toBe('Research')
    })

    test('ignores empty lines', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('\n\n\n')

      expect(events).toHaveLength(0)
    })
  })

  describe('flush', () => {
    test('returns remaining buffered data', () => {
      const parser = new OutputParser()
      
      // Partial line without newline
      parser.parseChunk('Phase: Final')
      
      const events = parser.flush()
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('phase')
    })

    test('returns empty array if buffer is empty', () => {
      const parser = new OutputParser()
      const events = parser.flush()

      expect(events).toHaveLength(0)
    })

    test('clears buffer after flush', () => {
      const parser = new OutputParser()
      
      parser.parseChunk('Phase: Test')
      parser.flush()
      
      const events = parser.flush()
      expect(events).toHaveLength(0)
    })
  })

  describe('timestamp', () => {
    test('events have timestamp', () => {
      const parser = new OutputParser()
      const before = new Date()
      const events = parser.parseChunk('Log message\n')
      const after = new Date()

      expect(events[0].timestamp).toBeInstanceOf(Date)
      expect(events[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(events[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  describe('raw property', () => {
    test('events include raw line', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Phase: Test - DONE\n')

      expect(events[0].raw).toBe('Phase: Test - DONE')
    })
  })

  describe('malformed input - missing tests', () => {
    test.todo('handles binary data in chunk')
    test.todo('handles null bytes in chunk')
    test.todo('handles very long lines (>10KB)')
    test.todo('handles chunk with only whitespace')
    test.todo('handles chunk with only carriage returns')
    test.todo('handles mixed line endings (\\r\\n, \\r, \\n)')
    test.todo('handles unicode characters in chunk')
    test.todo('handles emoji in chunk')
    test.todo('handles control characters in chunk')
    test.todo('handles chunk with BOM marker')
  })

  describe('phase parsing edge cases - missing tests', () => {
    test.todo('Phase: with no name after colon')
    test.todo('PHASE: uppercase variant')
    test.todo('Phase: with very long name')
    test.todo('Phase: with special characters in name')
    test.todo('Phase: with multiple dashes in status')
    test.todo('Phase: with only whitespace after colon')
    test.todo('Phase: embedded in middle of line')
  })

  describe('agent parsing edge cases - missing tests', () => {
    test.todo('Agent: with no name after colon')
    test.todo('AGENT: uppercase variant')
    test.todo('Agent: with very long name')
    test.todo('Agent: with special characters in name')
    test.todo('Claude with no following text')
    test.todo('Claude embedded in longer word (ClaudeAgent)')
    test.todo('Agent: with multiple dashes in status')
  })

  describe('tool parsing edge cases - missing tests', () => {
    test.todo('Tool: with no name after colon')
    test.todo('TOOL: uppercase variant')
    test.todo('Tool: with very long name')
    test.todo('Tool: with special characters in name')
    test.todo('Tool: with no details after dash')
    test.todo('Tool: with multiple dashes in details')
    test.todo('Tool: with JSON in details')
  })

  describe('ralph parsing edge cases - missing tests', () => {
    test.todo('Iteration with very large number')
    test.todo('Iteration with zero')
    test.todo('Iteration with negative number')
    test.todo('ITERATION uppercase variant')
    test.todo('Iteration with leading zeros')
    test.todo('Iteration embedded in other text')
  })

  describe('error parsing edge cases - missing tests', () => {
    test.todo('Error: with empty message')
    test.todo('ERROR: uppercase variant')
    test.todo('Stack trace with unusual format')
    test.todo('Multiple Error: on same line')
    test.todo('Error embedded in longer word')
    test.todo('Error with very long message')
    test.todo('Error with newlines in message')
  })

  describe('buffer handling edge cases - missing tests', () => {
    test.todo('buffer accumulates correctly across many chunks')
    test.todo('buffer handles very long incomplete lines')
    test.todo('buffer clears after complete line')
    test.todo('buffer handles alternating complete/incomplete chunks')
    test.todo('flush with buffer containing only whitespace')
    test.todo('flush with buffer containing incomplete multi-byte char')
    test.todo('parseChunk with empty string')
    test.todo('parseChunk with only newline')
    test.todo('multiple flush calls in succession')
  })

  describe('regex edge cases - missing tests', () => {
    test.todo('regex handles catastrophic backtracking patterns')
    test.todo('regex handles ReDoS attack strings')
    test.todo('regex handles repeated patterns')
  })

  describe('performance - missing tests', () => {
    test.todo('handles thousands of lines efficiently')
    test.todo('handles very frequent small chunks')
    test.todo('memory usage remains stable with large buffer')
  })

  describe('encoding edge cases - missing tests', () => {
    test.todo('handles UTF-8 encoded text')
    test.todo('handles Latin-1 encoded text')
    test.todo('handles invalid UTF-8 sequences')
    test.todo('handles mixed encoding in single chunk')
  })
})
