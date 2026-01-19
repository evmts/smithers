/**
 * Tests for current-view
 * 
 * Covers: Current execution details, phase, agent, tool calls, state
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { showCurrent } from './current-view'

describe('showCurrent', () => {
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
  }

  interface Phase {
    name: string
    iteration: number
    status: string
  }

  interface Agent {
    id: string
    model: string
    status: string
    prompt: string
  }

  interface ToolCall {
    tool_name: string
    status: string
  }

  interface MockDbOptions {
    execution?: Execution | null
    phase?: Phase | null
    agent?: Agent | null
    tools?: ToolCall[]
    state?: Record<string, unknown>
  }

  function createMockDb(options: MockDbOptions = {}) {
    return {
      execution: {
        current: async () => options.execution ?? null
      },
      phases: {
        current: async () => options.phase ?? null
      },
      agents: {
        current: async () => options.agent ?? null
      },
      tools: {
        list: async () => options.tools ?? []
      },
      state: {
        getAll: async () => options.state ?? {}
      }
    }
  }

  describe('no active execution', () => {
    test('prints "(no active execution)" when null', async () => {
      const db = createMockDb({ execution: null })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('(no active execution)'))).toBe(true)
    })

    test('returns early when no execution', async () => {
      const db = createMockDb({ execution: null })
      await showCurrent(db)
      
      // Should not try to show phase/agent details
      expect(consoleOutput.some(line => line.includes('Current Phase'))).toBe(false)
    })
  })

  describe('execution display', () => {
    test('shows execution name or "Unnamed"', async () => {
      const db = createMockDb({
        execution: { id: '1', name: 'Test Execution', status: 'running', file_path: '/test.tsx' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Name: Test Execution'))).toBe(true)
    })

    test('shows "Unnamed" when name is missing', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Unnamed'))).toBe(true)
    })

    test('shows execution ID', async () => {
      const db = createMockDb({
        execution: { id: 'exec-abc123', status: 'running', file_path: '/test.tsx' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('ID: exec-abc123'))).toBe(true)
    })

    test('shows uppercase status', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Status: RUNNING'))).toBe(true)
    })

    test('shows file path', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/path/to/main.tsx' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('File: /path/to/main.tsx'))).toBe(true)
    })
  })

  describe('phase display', () => {
    test('shows current phase name', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        phase: { name: 'Implementation', iteration: 1, status: 'running' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Current Phase: Implementation'))).toBe(true)
    })

    test('shows phase iteration number', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        phase: { name: 'Review', iteration: 3, status: 'running' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('iteration 3'))).toBe(true)
    })

    test('shows uppercase phase status', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        phase: { name: 'Test', iteration: 1, status: 'pending' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Phase Status: PENDING'))).toBe(true)
    })

    test('handles null phase gracefully', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        phase: null
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Current Phase'))).toBe(false)
    })
  })

  describe('agent display', () => {
    test('shows current agent model', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: { id: 'a1', model: 'claude-sonnet', status: 'running', prompt: 'Test prompt' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Current Agent: claude-sonnet'))).toBe(true)
    })

    test('shows uppercase agent status', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: { id: 'a1', model: 'claude-haiku', status: 'waiting', prompt: 'Test' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Agent Status: WAITING'))).toBe(true)
    })

    test('shows truncated prompt (100 chars with ...)', async () => {
      const longPrompt = 'A'.repeat(150)
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: { id: 'a1', model: 'claude', status: 'running', prompt: longPrompt }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('...'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('A'.repeat(100)))).toBe(true)
    })

    test('handles null agent gracefully', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: null
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Current Agent'))).toBe(false)
    })
  })

  describe('tool calls display', () => {
    test('shows recent tool calls count', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: { id: 'a1', model: 'claude', status: 'running', prompt: 'Test' },
        tools: [
          { tool_name: 'Read', status: 'complete' },
          { tool_name: 'Write', status: 'complete' },
          { tool_name: 'Bash', status: 'running' }
        ]
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Recent Tool Calls (3)'))).toBe(true)
    })

    test('shows last 5 tool calls', async () => {
      const tools = Array.from({ length: 10 }, (_, i) => ({
        tool_name: `Tool${i}`,
        status: 'complete'
      }))
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: { id: 'a1', model: 'claude', status: 'running', prompt: 'Test' },
        tools
      })
      await showCurrent(db)
      
      // Should show the last 5 tools (Tool5-Tool9)
      expect(consoleOutput.some(line => line.includes('Tool9'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('Tool5'))).toBe(true)
    })

    test('shows tool name and status', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: { id: 'a1', model: 'claude', status: 'running', prompt: 'Test' },
        tools: [{ tool_name: 'Grep', status: 'complete' }]
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Grep') && line.includes('complete'))).toBe(true)
    })

    test('handles empty tool calls list', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: { id: 'a1', model: 'claude', status: 'running', prompt: 'Test' },
        tools: []
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Recent Tool Calls'))).toBe(false)
    })

    test('only shows tools when agent exists', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: null,
        tools: [{ tool_name: 'Read', status: 'complete' }]
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Recent Tool Calls'))).toBe(false)
    })
  })

  describe('state display', () => {
    test('shows all state key-value pairs', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        state: { phase: 'implementation', step: 1 }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('phase:'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('step:'))).toBe(true)
    })

    test('serializes values as JSON', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        state: { config: { nested: true } }
      })
      await showCurrent(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('config')
    })

    test('handles empty state', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        state: {}
      })
      await showCurrent(db)
      
      // State section should still be printed
      expect(consoleOutput.some(line => line.includes('State:'))).toBe(true)
    })
  })

  describe('header formatting', () => {
    test('prints correct header separator', async () => {
      const db = createMockDb({})
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('═══════════════════════════════════════════════════════════'))).toBe(true)
    })

    test('prints "CURRENT EXECUTION" title', async () => {
      const db = createMockDb({})
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('CURRENT EXECUTION'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles null execution name', async () => {
      const db = createMockDb({
        execution: { id: '1', name: undefined, status: 'running', file_path: '/test.tsx' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Unnamed'))).toBe(true)
    })

    test('handles exactly 100 char prompt', async () => {
      const exactPrompt = 'B'.repeat(100)
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: { id: 'a1', model: 'claude', status: 'running', prompt: exactPrompt }
      })
      await showCurrent(db)
      
      // Should show exactly 100 chars plus ...
      expect(consoleOutput.some(line => line.includes('B'.repeat(100)))).toBe(true)
    })

    test('handles empty prompt string', async () => {
      const db = createMockDb({
        execution: { id: '1', status: 'running', file_path: '/test.tsx' },
        agent: { id: 'a1', model: 'claude', status: 'running', prompt: '' }
      })
      await showCurrent(db)
      
      expect(consoleOutput.some(line => line.includes('Prompt:'))).toBe(true)
    })
  })
})
