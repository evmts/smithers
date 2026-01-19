/**
 * Unit tests for stream-formatter.ts - Output formatting for monitor.
 */
import { describe, test, expect } from 'bun:test'
import { StreamFormatter } from './stream-formatter.js'
import type { ParsedEvent } from './output-parser.js'

function createEvent(type: ParsedEvent['type'], data: Record<string, any> = {}): ParsedEvent {
  return {
    type,
    timestamp: new Date(),
    data,
    raw: `${type}: test`,
  }
}

describe('StreamFormatter', () => {
  describe('formatHeader', () => {
    test('includes file name', () => {
      const formatter = new StreamFormatter()
      const header = formatter.formatHeader('test.tsx')

      expect(header).toContain('test.tsx')
      expect(header).toContain('SMITHERS MONITOR')
    })

    test('includes start time', () => {
      const formatter = new StreamFormatter()
      const header = formatter.formatHeader('test.tsx')

      expect(header).toContain('Started:')
    })
  })

  describe('formatEvent', () => {
    test('formats phase events', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('phase', { name: 'Research', status: 'STARTING' })

      const output = formatter.formatEvent(event)

      expect(output).toContain('PHASE: Research')
      expect(output).toContain('Status: STARTING')
    })

    test('formats agent events', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('agent', { name: 'MainAgent', status: 'RUNNING' })

      const output = formatter.formatEvent(event)

      expect(output).toContain('AGENT: MainAgent')
      expect(output).toContain('Status: RUNNING')
    })

    test('formats tool events', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('tool', { name: 'Read', details: '/path/to/file' })

      const output = formatter.formatEvent(event)

      expect(output).toContain('TOOL CALL: Read')
      expect(output).toContain('/path/to/file')
    })

    test('formats tool events with summary', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('tool', { name: 'Read', details: '' })

      const output = formatter.formatEvent(event, '/log/path', 'File contents here')

      expect(output).toContain('SUMMARY: File contents here')
      expect(output).toContain('Full output: /log/path')
    })

    test('formats ralph events', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('ralph', { iteration: 5 })

      const output = formatter.formatEvent(event)

      expect(output).toContain('RALPH: Iteration 5')
      expect(output).toContain('remount')
    })

    test('formats error events', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('error', { message: 'Something went wrong' })

      const output = formatter.formatEvent(event)

      expect(output).toContain('ERROR: Something went wrong')
    })

    test('formats error events with log path', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('error', { message: 'Error' })

      const output = formatter.formatEvent(event, '/log/path')

      expect(output).toContain('Full error: /log/path')
    })

    test('formats log events', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('log', { message: 'Log message' })

      const output = formatter.formatEvent(event)

      expect(output).toContain('Log message')
    })

    test('increments stats on completed phases', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('phase', { name: 'Test', status: 'COMPLETE' })

      formatter.formatEvent(event)
      const stats = formatter.getStats()

      expect(stats.phasesCompleted).toBe(1)
    })

    test('increments stats on completed agents', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('agent', { name: 'Test', status: 'COMPLETE' })

      formatter.formatEvent(event)
      const stats = formatter.getStats()

      expect(stats.agentsExecuted).toBe(1)
    })

    test('increments stats on tool calls', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('tool', { name: 'Read' })

      formatter.formatEvent(event)
      const stats = formatter.getStats()

      expect(stats.toolCalls).toBe(1)
    })

    test('increments stats on errors', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('error', { message: 'Error' })

      formatter.formatEvent(event)
      const stats = formatter.getStats()

      expect(stats.errors).toBe(1)
    })
  })

  describe('formatSummary', () => {
    test('includes duration', () => {
      const formatter = new StreamFormatter()
      const summary = formatter.formatSummary(5000, '/log/dir')

      expect(summary).toContain('Duration:')
      expect(summary).toContain('5s')
    })

    test('formats minutes correctly', () => {
      const formatter = new StreamFormatter()
      const summary = formatter.formatSummary(90000, '/log/dir') // 90 seconds

      expect(summary).toContain('1m 30s')
    })

    test('formats hours correctly', () => {
      const formatter = new StreamFormatter()
      const summary = formatter.formatSummary(3700000, '/log/dir') // 1h 1m 40s

      expect(summary).toContain('1h')
    })

    test('includes all stats', () => {
      const formatter = new StreamFormatter()
      
      // Increment some stats
      formatter.formatEvent(createEvent('phase', { status: 'COMPLETE' }))
      formatter.formatEvent(createEvent('agent', { status: 'COMPLETE' }))
      formatter.formatEvent(createEvent('tool', { name: 'Read' }))
      formatter.formatEvent(createEvent('error', { message: 'Error' }))

      const summary = formatter.formatSummary(1000, '/log/dir')

      expect(summary).toContain('Phases completed:')
      expect(summary).toContain('Agents executed:')
      expect(summary).toContain('Tool calls:')
      expect(summary).toContain('Errors:')
    })

    test('includes log directory', () => {
      const formatter = new StreamFormatter()
      const summary = formatter.formatSummary(1000, '/path/to/logs')

      expect(summary).toContain('Log directory:')
      expect(summary).toContain('/path/to/logs')
    })
  })

  describe('getStats', () => {
    test('returns copy of stats', () => {
      const formatter = new StreamFormatter()
      const stats = formatter.getStats()

      expect(stats).toHaveProperty('phasesCompleted')
      expect(stats).toHaveProperty('agentsExecuted')
      expect(stats).toHaveProperty('toolCalls')
      expect(stats).toHaveProperty('errors')
      expect(stats).toHaveProperty('startTime')
    })

    test('stats are independent from original', () => {
      const formatter = new StreamFormatter()
      const stats = formatter.getStats()
      stats.phasesCompleted = 999

      const newStats = formatter.getStats()
      expect(newStats.phasesCompleted).toBe(0)
    })
  })

  describe('formatHeader edge cases', () => {
    test('truncates very long file names to fit box width', () => {
      const formatter = new StreamFormatter()
      const longFileName = 'a'.repeat(100)
      const header = formatter.formatHeader(longFileName)
      
      expect(header).toContain('...')
      expect(header).toContain(longFileName.substring(0, 38))
      expect(header).toContain('SMITHERS MONITOR')
    })

    test('handles special characters (unicode, emojis)', () => {
      const formatter = new StreamFormatter()
      const unicodeName = '文件名-🚀-тест.tsx'
      const header = formatter.formatHeader(unicodeName)
      
      expect(header).toContain(unicodeName)
      expect(header).toContain('SMITHERS MONITOR')
    })

    test('handles empty file name', () => {
      const formatter = new StreamFormatter()
      const header = formatter.formatHeader('')
      
      expect(header).toContain('File:')
      expect(header).toContain('SMITHERS MONITOR')
    })

    test('handles file name with newlines', () => {
      const formatter = new StreamFormatter()
      const nameWithNewline = 'file\nname.tsx'
      const header = formatter.formatHeader(nameWithNewline)
      
      expect(header).toContain('File:')
    })
  })

  describe('formatEvent edge cases', () => {
    test('handles unknown event type - falls through to default', () => {
      const formatter = new StreamFormatter()
      const event: ParsedEvent = {
        type: 'unknown' as any,
        timestamp: new Date(),
        data: {},
        raw: 'some unknown event',
      }
      
      const output = formatter.formatEvent(event)
      expect(output).toContain('some unknown event')
    })

    test('handles event with missing data fields', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('phase', {})
      
      const output = formatter.formatEvent(event)
      expect(output).toContain('PHASE:')
      expect(output).toContain('undefined')
    })

    test('handles event with null/undefined data values', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('agent', { name: null, status: undefined })
      
      const output = formatter.formatEvent(event)
      expect(output).toContain('AGENT:')
    })

    test('handles event with very long name (>100 chars)', () => {
      const formatter = new StreamFormatter()
      const longName = 'A'.repeat(150)
      const event = createEvent('tool', { name: longName, details: 'test' })
      
      const output = formatter.formatEvent(event)
      expect(output).toContain('TOOL CALL:')
      expect(output).toContain(longName)
    })

    test('handles event with special characters in name', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('phase', { name: '🔥Phase<>&"\'', status: 'RUNNING' })
      
      const output = formatter.formatEvent(event)
      expect(output).toContain('🔥Phase<>&"\'')
    })

    test('handles event with newlines in data fields', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('error', { message: 'Error\nwith\nmultiple\nlines' })
      
      const output = formatter.formatEvent(event)
      expect(output).toContain('ERROR:')
    })
  })

  describe('tool event edge cases', () => {
    test('tool with empty details string', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('tool', { name: 'Read', details: '' })
      
      const output = formatter.formatEvent(event)
      expect(output).toContain('TOOL CALL: Read')
      expect(output).not.toContain('           \n           ')
    })

    test('tool with multi-line summary preserves formatting', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('tool', { name: 'Read', details: '' })
      const multiLineSummary = 'Line 1\nLine 2\nLine 3'
      
      const output = formatter.formatEvent(event, '/log', multiLineSummary)
      expect(output).toContain('SUMMARY:')
      expect(output).toContain('Line 1')
    })

    test('tool with very long summary (>1000 chars)', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('tool', { name: 'Read', details: '' })
      const longSummary = 'x'.repeat(1500)
      
      const output = formatter.formatEvent(event, '/log', longSummary)
      expect(output).toContain('SUMMARY:')
      expect(output).toContain(longSummary)
    })

    test('tool with undefined logPath and summary', () => {
      const formatter = new StreamFormatter()
      const event = createEvent('tool', { name: 'Read', details: 'test' })
      
      const output = formatter.formatEvent(event, undefined, undefined)
      expect(output).toContain('TOOL CALL: Read')
      expect(output).not.toContain('SUMMARY:')
      expect(output).not.toContain('Full output:')
    })
  })

  describe('log handling', () => {
    test('consecutive log events with different messages are shown', () => {
      const formatter = new StreamFormatter()
      const log1 = createEvent('log', { message: 'Log 1' })
      const log2 = createEvent('log', { message: 'Log 2' })
      
      const output1 = formatter.formatEvent(log1)
      const output2 = formatter.formatEvent(log2)
      
      expect(output1).toContain('Log 1')
      expect(output2).toContain('Log 2')
    })

    test('consecutive identical log events are deduplicated', () => {
      const formatter = new StreamFormatter()
      const log1 = createEvent('log', { message: 'Repeat' })
      const log2 = createEvent('log', { message: 'Repeat' })
      
      const output1 = formatter.formatEvent(log1)
      const output2 = formatter.formatEvent(log2)
      
      expect(output1).toContain('Repeat')
      expect(output2).toBe('')
    })

    test('log events interspersed with other events are shown', () => {
      const formatter = new StreamFormatter()
      const log1 = createEvent('log', { message: 'Log 1' })
      const phase = createEvent('phase', { name: 'Test', status: 'RUNNING' })
      const log2 = createEvent('log', { message: 'Log 2' })
      
      const output1 = formatter.formatEvent(log1)
      formatter.formatEvent(phase)
      const output3 = formatter.formatEvent(log2)
      
      expect(output1).toContain('Log 1')
      expect(output3).toContain('Log 2')
    })

    test('identical log after non-log event is shown', () => {
      const formatter = new StreamFormatter()
      
      formatter.formatEvent(createEvent('log', { message: 'Log' }))
      formatter.formatEvent(createEvent('tool', { name: 'Read' }))
      const logOutput = formatter.formatEvent(createEvent('log', { message: 'Log' }))
      
      expect(logOutput).toContain('Log')
    })
  })

  describe('stats edge cases', () => {
    test('phase with non-COMPLETE status does not increment phasesCompleted', () => {
      const formatter = new StreamFormatter()
      
      formatter.formatEvent(createEvent('phase', { name: 'Test', status: 'RUNNING' }))
      formatter.formatEvent(createEvent('phase', { name: 'Test', status: 'STARTING' }))
      
      const stats = formatter.getStats()
      expect(stats.phasesCompleted).toBe(0)
    })

    test('agent with non-COMPLETE status does not increment agentsExecuted', () => {
      const formatter = new StreamFormatter()
      
      formatter.formatEvent(createEvent('agent', { name: 'Test', status: 'RUNNING' }))
      formatter.formatEvent(createEvent('agent', { name: 'Test', status: 'STARTING' }))
      
      const stats = formatter.getStats()
      expect(stats.agentsExecuted).toBe(0)
    })

    test('stats remain accurate after mixed event types', () => {
      const formatter = new StreamFormatter()
      
      for (let i = 0; i < 5; i++) {
        formatter.formatEvent(createEvent('phase', { status: 'COMPLETE' }))
        formatter.formatEvent(createEvent('agent', { status: 'COMPLETE' }))
        formatter.formatEvent(createEvent('tool', { name: 'Read' }))
        formatter.formatEvent(createEvent('error', { message: 'Error' }))
        formatter.formatEvent(createEvent('log', { message: 'Log' }))
      }
      
      const stats = formatter.getStats()
      expect(stats.phasesCompleted).toBe(5)
      expect(stats.agentsExecuted).toBe(5)
      expect(stats.toolCalls).toBe(5)
      expect(stats.errors).toBe(5)
    })
  })

  describe('formatSummary edge cases', () => {
    test('handles 0ms duration', () => {
      const formatter = new StreamFormatter()
      const summary = formatter.formatSummary(0, '/log/dir')
      
      expect(summary).toContain('Duration:')
      expect(summary).toContain('0s')
    })

    test('handles very large duration (>24h)', () => {
      const formatter = new StreamFormatter()
      const duration = 25 * 60 * 60 * 1000
      const summary = formatter.formatSummary(duration, '/log/dir')
      
      expect(summary).toContain('Duration:')
      expect(summary).toContain('25h')
    })

    test('handles negative duration gracefully', () => {
      const formatter = new StreamFormatter()
      const summary = formatter.formatSummary(-1000, '/log/dir')
      
      expect(summary).toContain('Duration:')
    })

    test('handles log directory with special characters', () => {
      const formatter = new StreamFormatter()
      const specialPath = '/path/with spaces/and-特殊字符/🚀'
      const summary = formatter.formatSummary(1000, specialPath)
      
      expect(summary).toContain('Log directory:')
    })
  })
})
