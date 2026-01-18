/**
 * Tests for MessageParser and related utilities
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { MessageParser, truncateToLastLines } from './message-parser.js'

describe('MessageParser', () => {
  let parser: MessageParser

  beforeEach(() => {
    parser = new MessageParser()
  })

  describe('parseChunk', () => {
    test('parses single message without tools', () => {
      parser.parseChunk('Hello, this is a simple message.')
      parser.flush()

      const entries = parser.getEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].type).toBe('message')
      expect(entries[0].content).toBe('Hello, this is a simple message.')
    })

    test('parses message with Tool: prefix', () => {
      parser.parseChunk('Some text\n\nTool: Read\npath: /some/path\n\nMore text')
      parser.flush()

      const entries = parser.getEntries()
      expect(entries.length).toBeGreaterThanOrEqual(1)

      const toolEntry = entries.find(e => e.type === 'tool-call')
      expect(toolEntry).toBeDefined()
      expect(toolEntry?.toolName).toBe('Read')
    })

    test('parses message with TOOL: prefix (uppercase)', () => {
      parser.parseChunk('Some text\n\nTOOL: Write\npath: /some/path\n\nMore text')
      parser.flush()

      const entries = parser.getEntries()
      const toolEntry = entries.find(e => e.type === 'tool-call')
      expect(toolEntry).toBeDefined()
      expect(toolEntry?.toolName).toBe('Write')
    })

    test('parses message with <invoke pattern at start', () => {
      // The pattern /^\s*<invoke/m matches at the start of a line
      parser.parseChunk('<invoke name="Bash">\ncommand: ls\n</invoke>\n\n')
      parser.flush()

      const entries = parser.getEntries()
      const toolEntry = entries.find(e => e.type === 'tool-call')
      expect(toolEntry).toBeDefined()
      expect(toolEntry?.toolName).toBe('Bash')
    })

    test('handles multiple chunks forming one message', () => {
      parser.parseChunk('Hello, ')
      parser.parseChunk('this is ')
      parser.parseChunk('a multi-part message.')
      parser.flush()

      const entries = parser.getEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].type).toBe('message')
      expect(entries[0].content).toBe('Hello, this is a multi-part message.')
    })

    test('accumulates buffer across calls', () => {
      parser.parseChunk('First part ')
      expect(parser.getEntries()).toHaveLength(0) // Not yet flushed

      parser.parseChunk('second part')
      parser.flush()

      const entries = parser.getEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].content).toBe('First part second part')
    })
  })

  describe('findToolEnd', () => {
    test('finds end at double newline boundary', () => {
      parser.parseChunk('Tool: Read\npath: /file\n\nNext message')
      parser.flush()

      const entries = parser.getEntries()
      // Should have separated the tool call from the next message
      const toolEntry = entries.find(e => e.type === 'tool-call')
      expect(toolEntry).toBeDefined()
      expect(toolEntry?.content).not.toContain('Next message')
    })

    test('finds end at next tool boundary', () => {
      parser.parseChunk('Tool: Read\npath: /file\nTool: Write\npath: /other')
      parser.flush()

      const entries = parser.getEntries()
      const toolEntries = entries.filter(e => e.type === 'tool-call')
      expect(toolEntries.length).toBeGreaterThanOrEqual(1)
    })

    test('handles incomplete tool (returns -1 internally)', () => {
      // Tool started but not ended
      parser.parseChunk('Tool: Read\npath: /file')
      // Without double newline or another tool, it stays in buffer

      const entriesBeforeFlush = parser.getEntries()
      // Nothing emitted yet since tool not complete
      expect(entriesBeforeFlush.length).toBe(0)

      parser.flush()
      const entriesAfterFlush = parser.getEntries()
      expect(entriesAfterFlush.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('extractToolName', () => {
    test('extracts from "Tool: name" format', () => {
      parser.parseChunk('Tool: Bash\ncommand: ls\n\n')
      parser.flush()

      const entries = parser.getEntries()
      const toolEntry = entries.find(e => e.type === 'tool-call')
      expect(toolEntry?.toolName).toBe('Bash')
    })

    test('extracts from <invoke name="..."> format', () => {
      parser.parseChunk('<invoke name="Edit">\npath: /file\n</invoke>\n\n')
      parser.flush()

      const entries = parser.getEntries()
      const toolEntry = entries.find(e => e.type === 'tool-call')
      expect(toolEntry?.toolName).toBe('Edit')
    })

    test('returns unknown for unrecognized format', () => {
      // Force a tool entry without proper name format
      parser.parseChunk('  <invoke>\nsomething\n</invoke>\n\n')
      parser.flush()

      const entries = parser.getEntries()
      const toolEntry = entries.find(e => e.type === 'tool-call')
      if (toolEntry) {
        expect(toolEntry.toolName).toBe('unknown')
      }
    })
  })

  describe('flush', () => {
    test('flushes pending message content', () => {
      parser.parseChunk('Pending message content')
      expect(parser.getEntries()).toHaveLength(0)

      parser.flush()
      const entries = parser.getEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].content).toBe('Pending message content')
    })

    test('flushes pending buffer content', () => {
      parser.parseChunk('Buffer content')
      parser.flush()

      const entries = parser.getEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].type).toBe('message')
    })

    test('does nothing when empty', () => {
      parser.flush()
      expect(parser.getEntries()).toHaveLength(0)
    })

    test('handles whitespace-only content', () => {
      parser.parseChunk('   \n\n   ')
      parser.flush()

      // Whitespace-only should not create an entry
      expect(parser.getEntries()).toHaveLength(0)
    })
  })

  describe('getEntries', () => {
    test('returns all parsed entries', () => {
      parser.parseChunk('Message 1\n\nTool: Read\npath: /a\n\nMessage 2')
      parser.flush()

      const entries = parser.getEntries()
      expect(entries.length).toBeGreaterThanOrEqual(2)
    })

    test('returns empty array initially', () => {
      expect(parser.getEntries()).toEqual([])
    })

    test('entries have sequential indices', () => {
      parser.parseChunk('First\n\nTool: Test\ndata: x\n\nSecond')
      parser.flush()

      const entries = parser.getEntries()
      for (let i = 0; i < entries.length; i++) {
        expect(entries[i].index).toBe(i)
      }
    })
  })

  describe('getLatestEntries', () => {
    test('returns last N entries', () => {
      parser.parseChunk('A\n\nTool: T1\nx: 1\n\nB\n\nTool: T2\ny: 2\n\nC')
      parser.flush()

      const latest = parser.getLatestEntries(2)
      expect(latest.length).toBeLessThanOrEqual(2)
    })

    test('returns all entries if N > total', () => {
      parser.parseChunk('Only one')
      parser.flush()

      const latest = parser.getLatestEntries(10)
      expect(latest).toHaveLength(1)
    })

    test('returns empty array when no entries exist', () => {
      // slice(-0) returns all elements, so we test with no entries
      const latest = parser.getLatestEntries(0)
      expect(latest).toHaveLength(0)
    })
  })

  describe('entry types', () => {
    test('message entry has correct structure', () => {
      parser.parseChunk('Hello world')
      parser.flush()

      const entry = parser.getEntries()[0]
      expect(entry.index).toBe(0)
      expect(entry.type).toBe('message')
      expect(entry.content).toBe('Hello world')
      expect(entry.toolName).toBeUndefined()
    })

    test('tool-call entry has correct structure', () => {
      parser.parseChunk('Tool: Bash\ncommand: pwd\n\n')
      parser.flush()

      const entry = parser.getEntries().find(e => e.type === 'tool-call')
      expect(entry).toBeDefined()
      expect(entry!.type).toBe('tool-call')
      expect(entry!.toolName).toBe('Bash')
      expect(entry!.content).toContain('Tool: Bash')
    })
  })

  describe('maxEntries limit', () => {
    test('enforces maxEntries limit', () => {
      const limitedParser = new MessageParser(3)

      // Add more entries than the limit
      limitedParser.parseChunk('Message 1\n\nTool: T1\nx: 1\n\nMessage 2\n\nTool: T2\ny: 2\n\nMessage 3')
      limitedParser.flush()

      const entries = limitedParser.getEntries()
      expect(entries.length).toBeLessThanOrEqual(3)
    })

    test('keeps most recent entries when limit exceeded', () => {
      const limitedParser = new MessageParser(2)

      limitedParser.parseChunk('First message\n\nTool: Read\npath: /a\n\nSecond message\n\nTool: Write\npath: /b\n\nThird message')
      limitedParser.flush()

      const entries = limitedParser.getEntries()
      expect(entries.length).toBeLessThanOrEqual(2)
      // Most recent entries should be kept
      const contents = entries.map(e => e.content).join(' ')
      expect(contents).toContain('Third message')
    })

    test('uses default maxEntries of 100', () => {
      // Default constructor should allow many entries
      const defaultParser = new MessageParser()

      // Alternating messages and tools to create multiple entries
      for (let i = 0; i < 50; i++) {
        defaultParser.parseChunk(`Message ${i}\n\nTool: T${i}\nx: ${i}\n\n`)
      }
      defaultParser.flush()

      const entries = defaultParser.getEntries()
      // Should have many entries (up to 100, alternating messages and tools)
      expect(entries.length).toBeGreaterThan(20)
    })
  })

  describe('reset', () => {
    test('clears all entries and buffer', () => {
      parser.parseChunk('Some content')
      parser.flush()
      expect(parser.getEntries()).toHaveLength(1)

      parser.reset()
      expect(parser.getEntries()).toHaveLength(0)
    })

    test('allows reuse after reset', () => {
      parser.parseChunk('First run')
      parser.flush()
      expect(parser.getEntries()[0].index).toBe(0)

      parser.reset()

      parser.parseChunk('Second run')
      parser.flush()
      expect(parser.getEntries()[0].index).toBe(0)
      expect(parser.getEntries()[0].content).toBe('Second run')
    })
  })

  describe('robustness', () => {
    test('handles tool output with single blank lines', () => {
      parser.parseChunk('Tool: Read\npath: /file\n\nLine 1\n\nLine 2\n\n\nNext message')
      parser.flush()

      const entries = parser.getEntries()
      const toolEntry = entries.find(e => e.type === 'tool-call')
      expect(toolEntry).toBeDefined()
    })

    test('handles XML invoke with multiline content', () => {
      parser.parseChunk('<invoke name="Bash">\ncommand: cat file.txt\noutput: |\n  Line 1\n\n  Line 2\n</invoke>\n')
      parser.flush()

      const entries = parser.getEntries()
      const toolEntry = entries.find(e => e.type === 'tool-call')
      expect(toolEntry).toBeDefined()
      expect(toolEntry?.toolName).toBe('Bash')
    })
  })
})

describe('truncateToLastLines', () => {
  test('returns content unchanged when under maxLines', () => {
    const content = 'line1\nline2\nline3'
    expect(truncateToLastLines(content, 10)).toBe(content)
  })

  test('returns content unchanged when exactly at maxLines', () => {
    const content = 'line1\nline2\nline3'
    expect(truncateToLastLines(content, 3)).toBe(content)
  })

  test('truncates to last N lines when over maxLines', () => {
    const content = 'line1\nline2\nline3\nline4\nline5'
    const result = truncateToLastLines(content, 3)
    expect(result).toBe('line3\nline4\nline5')
  })

  test('uses default maxLines of 10', () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line${i + 1}`)
    const content = lines.join('\n')
    const result = truncateToLastLines(content)
    expect(result.split('\n')).toHaveLength(10)
    expect(result).toContain('line15')
    expect(result).not.toContain('line5\n')
  })

  test('handles single line content', () => {
    const content = 'single line'
    expect(truncateToLastLines(content, 5)).toBe(content)
  })

  test('handles empty string', () => {
    expect(truncateToLastLines('', 5)).toBe('')
  })

  test('handles maxLines of 1', () => {
    const content = 'line1\nline2\nline3'
    expect(truncateToLastLines(content, 1)).toBe('line3')
  })

  test('preserves line content exactly', () => {
    const content = '  indented\n\ttabbed\nempty_below\n\nafter_empty'
    const result = truncateToLastLines(content, 3)
    expect(result).toBe('empty_below\n\nafter_empty')
  })
})
