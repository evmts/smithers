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

    test('parses ITERATION uppercase events', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('ITERATION 3 complete\n')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('ralph')
      expect(events[0].data.iteration).toBe(3)
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

  describe('malformed input', () => {
    test('handles binary data in chunk', () => {
      const parser = new OutputParser()
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xFF]).toString('utf-8') + '\n'
      
      const events = parser.parseChunk(binaryData)
      expect(events.length).toBeGreaterThanOrEqual(0)
    })

    test('handles null bytes in chunk', () => {
      const parser = new OutputParser()
      const nullBytes = 'Hello\x00World\n'
      
      const events = parser.parseChunk(nullBytes)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('log')
    })

    test('handles very long lines (>10KB)', () => {
      const parser = new OutputParser()
      const longLine = 'x'.repeat(15000) + '\n'
      
      const events = parser.parseChunk(longLine)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('log')
      expect(events[0].data.message.length).toBe(15000)
    })

    test('handles mixed line endings (\\r\\n, \\r, \\n)', () => {
      const parser = new OutputParser()
      const mixedEndings = 'line1\r\nline2\rline3\n'
      
      const events = parser.parseChunk(mixedEndings)
      expect(events.length).toBeGreaterThanOrEqual(2)
    })

    test('handles unicode characters in chunk', () => {
      const parser = new OutputParser()
      const unicode = '日本語テスト\n中文测试\n'
      
      const events = parser.parseChunk(unicode)
      expect(events).toHaveLength(2)
      expect(events[0].data.message).toBe('日本語テスト')
    })

    test('handles emoji in chunk', () => {
      const parser = new OutputParser()
      const emoji = '🚀 Launch complete 🎉\n'
      
      const events = parser.parseChunk(emoji)
      expect(events).toHaveLength(1)
      expect(events[0].data.message).toContain('🚀')
    })
  })

  describe('phase parsing edge cases', () => {
    test('Phase: with no name after colon', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Phase:\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('log')
    })

    test('PHASE: uppercase variant parses as phase', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('PHASE: Research - STARTING\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('phase')
    })

    test('Phase: with very long name', () => {
      const parser = new OutputParser()
      const longName = 'A'.repeat(500)
      const events = parser.parseChunk(`Phase: ${longName} - RUNNING\n`)
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('phase')
      expect(events[0].data.name).toBe(longName)
    })

    test('Phase: with special characters in name', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Phase: Research & Development <test> - RUNNING\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('phase')
    })
  })

  describe('agent parsing edge cases', () => {
    test('Agent: with no name after colon', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Agent:\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('log')
    })

    test('AGENT: uppercase variant parses as agent', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('AGENT: Worker - COMPLETE\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('agent')
      expect(events[0].data.name).toBe('Worker')
      expect(events[0].data.status).toBe('COMPLETE')
    })

    test('Agent: with very long name', () => {
      const parser = new OutputParser()
      const longName = 'Agent'.repeat(100)
      const events = parser.parseChunk(`Agent: ${longName} - RUNNING\n`)
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('agent')
    })
  })

  describe('tool parsing edge cases', () => {
    test('Tool: with no name after colon', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Tool:\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('log')
    })

    test('TOOL: uppercase variant parses as tool', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('TOOL: Read - /path\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('tool')
    })

    test('Tool: with very long name', () => {
      const parser = new OutputParser()
      const longName = 'Read'.repeat(50)
      const events = parser.parseChunk(`Tool: ${longName}\n`)
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('tool')
    })

    test('Tool: with multiple dashes in details', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Tool: Read - /path/to/file - extra - info\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('tool')
      expect(events[0].data.details).toContain('/path/to/file')
    })

    test('Tool: with JSON in details', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Tool: Write - {"path": "/test"}\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('tool')
      expect(events[0].data.details).toContain('{"path"')
    })
  })

  describe('error parsing edge cases', () => {
    test('Error: with empty message', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('Error:\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('error')
      expect(events[0].data.message).toBe('Error:')
    })

    test('ERROR: uppercase variant', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('ERROR: Something failed\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('error')
    })

    test('Error with very long message', () => {
      const parser = new OutputParser()
      const longMsg = 'x'.repeat(5000)
      const events = parser.parseChunk(`Error: ${longMsg}\n`)
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('error')
    })
  })

  describe('buffer handling edge cases', () => {
    test('buffer accumulates correctly across many chunks', () => {
      const parser = new OutputParser()
      
      parser.parseChunk('Pha')
      parser.parseChunk('se:')
      parser.parseChunk(' Te')
      parser.parseChunk('st')
      const events = parser.parseChunk('\n')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('phase')
      expect(events[0].data.name).toBe('Test')
    })

    test('buffer handles very long incomplete lines', () => {
      const parser = new OutputParser()
      const longContent = 'x'.repeat(50000)
      
      parser.parseChunk(longContent)
      const events = parser.flush()
      
      expect(events).toHaveLength(1)
      expect(events[0].data.message.length).toBe(50000)
    })

    test('parseChunk with empty string', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('')
      
      expect(events).toHaveLength(0)
    })

    test('parseChunk with only newline', () => {
      const parser = new OutputParser()
      const events = parser.parseChunk('\n')
      
      expect(events).toHaveLength(0)
    })

    test('multiple flush calls in succession', () => {
      const parser = new OutputParser()
      parser.parseChunk('Test content')
      
      const events1 = parser.flush()
      const events2 = parser.flush()
      const events3 = parser.flush()
      
      expect(events1).toHaveLength(1)
      expect(events2).toHaveLength(0)
      expect(events3).toHaveLength(0)
    })
  })

  describe('regex security', () => {
    test('ReDoS security test for regex patterns', () => {
      const parser = new OutputParser()
      const smallInput = 'Phase:' + ' '.repeat(10) + '-'.repeat(10) + '\n'
      const largeInput = 'Phase:' + ' '.repeat(1000) + '-'.repeat(1000) + '\n'

      const smallStart = performance.now()
      parser.parseChunk(smallInput)
      const smallDuration = performance.now() - smallStart

      const largeStart = performance.now()
      parser.parseChunk(largeInput)
      const largeDuration = performance.now() - largeStart

      const baseline = Math.max(1, smallDuration)
      expect(largeDuration).toBeLessThan(baseline * 200)
    })

    test('handles repeated patterns without hanging', () => {
      const parser = new OutputParser()
      const smallPattern = ('Tool: ' + 'a'.repeat(5) + ' - ').repeat(5) + '\n'
      const repeatedPattern = ('Tool: ' + 'a'.repeat(100) + ' - ').repeat(100) + '\n'

      const smallStart = performance.now()
      parser.parseChunk(smallPattern)
      const smallDuration = performance.now() - smallStart

      const largeStart = performance.now()
      parser.parseChunk(repeatedPattern)
      const largeDuration = performance.now() - largeStart

      const baseline = Math.max(1, smallDuration)
      expect(largeDuration).toBeLessThan(baseline * 200)
    })
  })
})
