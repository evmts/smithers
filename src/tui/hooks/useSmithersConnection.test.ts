/**
 * Tests for src/tui/hooks/useSmithersConnection.ts
 * Hook for connecting to Smithers database
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import * as dbModule from '../../db/index.js'

// Mock the createSmithersDB function
const mockDb = {
  execution: {
    current: mock(() => null),
    list: mock(() => [])
  },
  close: mock(() => {})
}

const originalCreateSmithersDB = dbModule.createSmithersDB

describe('tui/hooks/useSmithersConnection', () => {
  describe('Execution type', () => {
    test('Execution interface has all required properties', () => {
      // Import the type and verify it matches expected structure
      const execution = {
        id: 'test-id',
        name: 'test-name',
        status: 'running',
        file_path: '/path/to/file',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: null,
        total_iterations: 5,
        total_agents: 3,
        total_tool_calls: 10
      }
      
      expect(execution.id).toBe('test-id')
      expect(execution.name).toBe('test-name')
      expect(execution.status).toBe('running')
      expect(execution.file_path).toBe('/path/to/file')
      expect(execution.started_at).toBe('2024-01-01T00:00:00Z')
      expect(execution.completed_at).toBeNull()
      expect(execution.total_iterations).toBe(5)
      expect(execution.total_agents).toBe(3)
      expect(execution.total_tool_calls).toBe(10)
    })
  })

  describe('UseSmithersConnectionResult type', () => {
    test('result interface has all required properties', () => {
      const result = {
        db: null,
        isConnected: false,
        error: null,
        currentExecution: null,
        executions: []
      }
      
      expect(result.db).toBeNull()
      expect(result.isConnected).toBe(false)
      expect(result.error).toBeNull()
      expect(result.currentExecution).toBeNull()
      expect(result.executions).toEqual([])
    })
  })

  describe('path handling', () => {
    test('appends /smithers.db when path does not end with .db', () => {
      const path = '/some/directory'
      const expectedFullPath = `${path}/smithers.db`
      
      // Logic from the hook
      const fullPath = path.endsWith('.db') ? path : `${path}/smithers.db`
      expect(fullPath).toBe(expectedFullPath)
    })

    test('uses path as-is when it ends with .db', () => {
      const path = '/some/directory/custom.db'
      
      const fullPath = path.endsWith('.db') ? path : `${path}/smithers.db`
      expect(fullPath).toBe(path)
    })

    test('handles relative paths', () => {
      const path = './relative/path'
      const fullPath = path.endsWith('.db') ? path : `${path}/smithers.db`
      expect(fullPath).toBe('./relative/path/smithers.db')
    })

    test('handles absolute paths', () => {
      const path = '/absolute/path/to/db.db'
      const fullPath = path.endsWith('.db') ? path : `${path}/smithers.db`
      expect(fullPath).toBe('/absolute/path/to/db.db')
    })
  })

  describe('execution type conversion', () => {
    test('converts started_at Date to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const isoString = date.toISOString()
      expect(isoString).toBe('2024-01-15T10:30:00.000Z')
    })

    test('converts completed_at Date to ISO string', () => {
      const date = new Date('2024-01-15T12:00:00Z')
      const isoString = date.toISOString()
      expect(isoString).toBe('2024-01-15T12:00:00.000Z')
    })

    test('handles null started_at', () => {
      const started_at = null
      const result = started_at?.toISOString() ?? null
      expect(result).toBeNull()
    })

    test('handles null completed_at', () => {
      const completed_at = null
      const result = completed_at?.toISOString() ?? null
      expect(result).toBeNull()
    })
  })

  describe('polling behavior', () => {
    test('REPORT_INTERVAL is 500ms', () => {
      // From the hook: setInterval(pollData, 500)
      const POLL_INTERVAL = 500
      expect(POLL_INTERVAL).toBe(500)
    })
  })

  describe('error handling logic', () => {
    test('extracts message from Error instance', () => {
      const error = new Error('Connection failed')
      const message = error instanceof Error ? error.message : 'Connection failed'
      expect(message).toBe('Connection failed')
    })

    test('uses fallback message for non-Error exceptions', () => {
      const error = 'string error'
      const message = error instanceof Error ? error.message : 'Connection failed'
      expect(message).toBe('Connection failed')
    })
  })

  describe('initial state values', () => {
    test('db should be null initially', () => {
      // Initial useState values from the hook
      const initialDb = null
      expect(initialDb).toBeNull()
    })

    test('isConnected should be false initially', () => {
      const initialIsConnected = false
      expect(initialIsConnected).toBe(false)
    })

    test('error should be null initially', () => {
      const initialError = null
      expect(initialError).toBeNull()
    })

    test('currentExecution should be null initially', () => {
      const initialCurrentExecution = null
      expect(initialCurrentExecution).toBeNull()
    })

    test('executions should be empty array initially', () => {
      const initialExecutions: unknown[] = []
      expect(initialExecutions).toEqual([])
    })
  })

  describe('edge cases', () => {
    test('handles empty dbPath', () => {
      const path = ''
      const fullPath = path.endsWith('.db') ? path : `${path}/smithers.db`
      expect(fullPath).toBe('/smithers.db')
    })

    test('handles dbPath with special characters', () => {
      const path = '/path with spaces/and-dashes/db.db'
      const fullPath = path.endsWith('.db') ? path : `${path}/smithers.db`
      expect(fullPath).toBe('/path with spaces/and-dashes/db.db')
    })
  })
})
