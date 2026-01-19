/**
 * Tests for executions-view
 * 
 * Covers: Execution list display, status formatting, duration calculation
 */

import { describe, it, test, expect, beforeEach, afterEach } from 'bun:test'
import { showExecutions } from './executions-view'

describe('showExecutions', () => {
  let consoleOutput: string[]
  let originalConsoleLog: typeof console.log

  beforeEach(() => {
    consoleOutput = []
    originalConsoleLog = console.log
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    console.log = originalConsoleLog
  })

  interface Execution {
    id: string
    name?: string
    status: string
    file_path: string
    started_at?: string
    completed_at?: string
    total_agents: number
    total_tool_calls: number
    total_tokens_used: number
    error?: string
  }

  function createMockDb(executions: Execution[]) {
    return {
      execution: {
        list: async (_limit: number) => executions
      }
    }
  }

  describe('empty executions', () => {
    test('prints "(no executions)" when list is empty', async () => {
      const db = createMockDb([])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('(no executions)'))).toBe(true)
    })

    test('prints header even when empty', async () => {
      const db = createMockDb([])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('RECENT EXECUTIONS'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('═'))).toBe(true)
    })
  })

  describe('execution display', () => {
    test('shows execution name or "Unnamed"', async () => {
      const db = createMockDb([
        { id: '1', name: 'My Execution', status: 'running', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 },
        { id: '2', status: 'running', file_path: '/test2.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('My Execution'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('Unnamed'))).toBe(true)
    })

    test('shows execution ID', async () => {
      const db = createMockDb([
        { id: 'exec-12345', status: 'running', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('exec-12345'))).toBe(true)
    })

    test('shows uppercase status', async () => {
      const db = createMockDb([
        { id: '1', status: 'running', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('RUNNING'))).toBe(true)
    })

    test('shows file path', async () => {
      const db = createMockDb([
        { id: '1', status: 'running', file_path: '/path/to/main.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('/path/to/main.tsx'))).toBe(true)
    })
  })

  describe('status symbols', () => {
    test('uses ✓ for COMPLETED status', async () => {
      const db = createMockDb([
        { id: '1', status: 'completed', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('✓'))).toBe(true)
    })

    test('uses ✗ for FAILED status', async () => {
      const db = createMockDb([
        { id: '1', status: 'failed', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('✗'))).toBe(true)
    })

    test('uses ● for other statuses', async () => {
      const db = createMockDb([
        { id: '1', status: 'running', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('●'))).toBe(true)
    })

    test('handles lowercase status input', async () => {
      const db = createMockDb([
        { id: '1', status: 'completed', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      // Should uppercase the status
      expect(consoleOutput.some(line => line.includes('COMPLETED'))).toBe(true)
    })
  })

  describe('timing information', () => {
    test('shows started_at when present', async () => {
      const db = createMockDb([
        { id: '1', status: 'running', file_path: '/test.tsx', started_at: '2024-01-15T10:30:00Z', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Started:'))).toBe(true)
    })

    test('calculates duration when completed_at present', async () => {
      const db = createMockDb([
        { id: '1', status: 'completed', file_path: '/test.tsx', started_at: '2024-01-15T10:30:00.000Z', completed_at: '2024-01-15T10:30:05.000Z', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Duration:'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('5000ms'))).toBe(true)
    })

    test('skips timing when started_at missing', async () => {
      const db = createMockDb([
        { id: '1', status: 'running', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Started:'))).toBe(false)
    })
  })

  describe('metrics display', () => {
    test('shows total agents count', async () => {
      const db = createMockDb([
        { id: '1', status: 'completed', file_path: '/test.tsx', total_agents: 5, total_tool_calls: 10, total_tokens_used: 1000 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Agents: 5'))).toBe(true)
    })

    test('shows total tool calls count', async () => {
      const db = createMockDb([
        { id: '1', status: 'completed', file_path: '/test.tsx', total_agents: 5, total_tool_calls: 42, total_tokens_used: 1000 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Tools: 42'))).toBe(true)
    })

    test('shows total tokens used', async () => {
      const db = createMockDb([
        { id: '1', status: 'completed', file_path: '/test.tsx', total_agents: 5, total_tool_calls: 10, total_tokens_used: 50000 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Tokens: 50000'))).toBe(true)
    })
  })

  describe('error display', () => {
    test('shows error message when present', async () => {
      const db = createMockDb([
        { id: '1', status: 'failed', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0, error: 'Connection timeout' }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Error: Connection timeout'))).toBe(true)
    })

    test('skips error line when no error', async () => {
      const db = createMockDb([
        { id: '1', status: 'completed', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Error:'))).toBe(false)
    })
  })

  describe('header formatting', () => {
    test('prints correct header separator', async () => {
      const db = createMockDb([])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('═══════════════════════════════════════════════════════════'))).toBe(true)
    })

    test('prints "RECENT EXECUTIONS (last 10)" title', async () => {
      const db = createMockDb([])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('RECENT EXECUTIONS (last 10)'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles null name gracefully', async () => {
      const db = createMockDb([
        { id: '1', name: undefined, status: 'running', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Unnamed'))).toBe(true)
    })

    test('handles zero metrics values', async () => {
      const db = createMockDb([
        { id: '1', status: 'running', file_path: '/test.tsx', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      expect(consoleOutput.some(line => line.includes('Agents: 0'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('Tools: 0'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('Tokens: 0'))).toBe(true)
    })

    test('handles missing completed_at with present started_at', async () => {
      const db = createMockDb([
        { id: '1', status: 'running', file_path: '/test.tsx', started_at: '2024-01-15T10:30:00Z', total_agents: 0, total_tool_calls: 0, total_tokens_used: 0 }
      ])
      await showExecutions(db)
      
      // Should show started but not duration
      expect(consoleOutput.some(line => line.includes('Started:'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('Duration:'))).toBe(false)
    })
  })
})
