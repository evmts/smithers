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

  describe('edge cases - missing tests', () => {
    // Header edge cases
    test.todo('formatHeader truncates very long file names to fit box width')
    test.todo('formatHeader handles file names with special characters (unicode, emojis)')
    test.todo('formatHeader handles empty file name')
    test.todo('formatHeader handles file name with newlines')
    
    // Event formatting edge cases
    test.todo('formatEvent handles unknown event type - falls through to default')
    test.todo('formatEvent handles event with missing data fields')
    test.todo('formatEvent handles event with null/undefined data values')
    test.todo('formatEvent handles event with very long name (>100 chars)')
    test.todo('formatEvent handles event with special characters in name')
    test.todo('formatEvent handles event with newlines in data fields')
    
    // Tool event edge cases
    test.todo('formatEvent tool with empty details string')
    test.todo('formatEvent tool with multi-line summary preserves formatting')
    test.todo('formatEvent tool with very long summary (>1000 chars)')
    test.todo('formatEvent tool with special characters in summary')
    test.todo('formatEvent tool with undefined logPath and summary')
    
    // Log deduplication
    test.todo('consecutive log events are deduplicated (only first shown)')
    test.todo('log events interspersed with other events are shown')
    test.todo('lastEventType resets correctly between different event types')
    
    // Stats edge cases
    test.todo('stats overflow - very large number of tool calls')
    test.todo('stats remain accurate after mixed event types')
    test.todo('phase with non-COMPLETE status does not increment phasesCompleted')
    test.todo('agent with non-COMPLETE status does not increment agentsExecuted')
    
    // Summary edge cases
    test.todo('formatSummary handles 0ms duration')
    test.todo('formatSummary handles very large duration (>24h)')
    test.todo('formatSummary handles negative duration gracefully')
    test.todo('formatSummary truncates very long log directory path')
    test.todo('formatSummary handles log directory with special characters')
    
    // Time formatting edge cases
    test.todo('formatTime handles midnight correctly')
    test.todo('formatTime handles different timezones')
    
    // Concurrent usage
    test.todo('multiple formatEvent calls in rapid succession')
    test.todo('stats consistency under concurrent updates')
  })
})
