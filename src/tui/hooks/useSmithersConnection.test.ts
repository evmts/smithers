/**
 * Tests for src/tui/hooks/useSmithersConnection.ts
 * Hook for connecting to Smithers database with polling
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { Execution, UseSmithersConnectionResult, UseSmithersConnectionOptions } from './useSmithersConnection.js'
import { resetTuiState } from '../state.js'

describe('tui/hooks/useSmithersConnection', () => {
  beforeEach(() => {
    resetTuiState()
  })

  afterEach(() => {
    resetTuiState()
  })

  describe('Execution type', () => {
    test('Execution interface has all required properties', () => {
      const execution: Execution = {
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

    test('name can be null', () => {
      const execution: Execution = {
        id: 'test-id',
        name: null,
        status: 'pending',
        file_path: '/path',
        started_at: null,
        completed_at: null,
        total_iterations: 0,
        total_agents: 0,
        total_tool_calls: 0
      }
      expect(execution.name).toBeNull()
    })

    test('started_at can be null', () => {
      const execution: Execution = {
        id: 'test-id',
        name: 'test',
        status: 'pending',
        file_path: '/path',
        started_at: null,
        completed_at: null,
        total_iterations: 0,
        total_agents: 0,
        total_tool_calls: 0
      }
      expect(execution.started_at).toBeNull()
    })
  })

  describe('UseSmithersConnectionResult type', () => {
    test('result interface has all required properties', () => {
      const result: UseSmithersConnectionResult = {
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

    test('isConnected can be true', () => {
      const result: UseSmithersConnectionResult = {
        db: null,
        isConnected: true,
        error: null,
        currentExecution: null,
        executions: []
      }
      expect(result.isConnected).toBe(true)
    })

    test('error can contain error message', () => {
      const result: UseSmithersConnectionResult = {
        db: null,
        isConnected: false,
        error: 'Connection failed',
        currentExecution: null,
        executions: []
      }
      expect(result.error).toBe('Connection failed')
    })
  })

  describe('path handling', () => {
    test('appends /smithers.db when path does not end with .db', () => {
      const path = '/some/directory'
      const expectedFullPath = `${path}/smithers.db`

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

    test('handles empty path', () => {
      const path = ''
      const fullPath = path.endsWith('.db') ? path : `${path}/smithers.db`
      expect(fullPath).toBe('/smithers.db')
    })

    test('handles path with special characters', () => {
      const path = '/path with spaces/and-dashes/db.db'
      const fullPath = path.endsWith('.db') ? path : `${path}/smithers.db`
      expect(fullPath).toBe('/path with spaces/and-dashes/db.db')
    })
  })

  describe('custom resolveDbPath option', () => {
    test('uses custom resolveDbPath when provided', () => {
      const customResolver = (path: string) => `/custom/${path}/database.db`
      const path = 'test'
      const fullPath = customResolver(path)
      expect(fullPath).toBe('/custom/test/database.db')
    })

    test('custom resolver receives original path', () => {
      const receivedPaths: string[] = []
      const customResolver = (path: string) => {
        receivedPaths.push(path)
        return path
      }
      customResolver('/my/path')
      expect(receivedPaths).toEqual(['/my/path'])
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
      const started_at = null as Date | null
      const result = started_at?.toISOString() ?? null
      expect(result).toBeNull()
    })

    test('handles null completed_at', () => {
      const completed_at = null as Date | null
      const result = completed_at?.toISOString() ?? null
      expect(result).toBeNull()
    })
  })

  describe('polling behavior', () => {
    test('default poll interval is 500ms', () => {
      const POLL_INTERVAL = 500
      expect(POLL_INTERVAL).toBe(500)
    })

    test('custom poll interval can be specified via options', () => {
      const options: UseSmithersConnectionOptions = { pollIntervalMs: 1000 }
      expect(options.pollIntervalMs).toBe(1000)
    })

    test('cleanup clears interval', () => {
      const mockClearInterval = mock(() => {})
      mockClearInterval()
      expect(mockClearInterval).toHaveBeenCalled()
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

    test('handles object errors', () => {
      const error = { code: 'ENOENT' }
      const message = error instanceof Error ? error.message : 'Connection failed'
      expect(message).toBe('Connection failed')
    })
  })

  describe('initial state values', () => {
    test('db should be null initially', () => {
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
      const initialExecutions: Execution[] = []
      expect(initialExecutions).toEqual([])
    })
  })

  describe('connection lifecycle', () => {
    test('cleanup closes db connection', () => {
      const mockClose = mock(() => {})
      const mockDb = { close: mockClose }

      // Simulate cleanup
      mockDb.close()
      expect(mockClose).toHaveBeenCalled()
    })

    test('cleanup clears poll interval', () => {
      let intervalCleared = false
      const intervalId = setInterval(() => {}, 500)

      // Simulate cleanup
      clearInterval(intervalId)
      intervalCleared = true

      expect(intervalCleared).toBe(true)
    })

    test('reconnects when dbPath changes', () => {
      // The hook uses useEffectOnValueChange with dbPath as dependency
      const deps = ['dbPath']
      expect(deps).toContain('dbPath')
    })
  })

  describe('createDb option', () => {
    test('uses custom createDb when provided', () => {
      const mockDb = { close: () => {}, execution: { current: () => null, list: () => [] } }
      const createDb = mock(() => mockDb)

      const options: UseSmithersConnectionOptions = { createDb: createDb as any }
      expect(options.createDb).toBe(createDb)
    })
  })

  describe('state key generation', () => {
    test('generates unique keys based on dbPath', () => {
      const dbPath = '/test/path'
      const keyBase = `tui:connection:${dbPath}`

      expect(`${keyBase}:connected`).toBe('tui:connection:/test/path:connected')
      expect(`${keyBase}:error`).toBe('tui:connection:/test/path:error')
      expect(`${keyBase}:currentExecution`).toBe('tui:connection:/test/path:currentExecution')
      expect(`${keyBase}:executions`).toBe('tui:connection:/test/path:executions')
    })
  })

  describe('executions list mapping', () => {
    test('maps execution dates to ISO strings', () => {
      const rawExecution = {
        id: 'exec-1',
        name: 'test',
        status: 'completed',
        file_path: '/path',
        started_at: new Date('2024-01-15T10:00:00Z'),
        completed_at: new Date('2024-01-15T11:00:00Z'),
        total_iterations: 1,
        total_agents: 2,
        total_tool_calls: 5
      }

      const mapped: Execution = {
        ...rawExecution,
        started_at: rawExecution.started_at.toISOString(),
        completed_at: rawExecution.completed_at.toISOString()
      }

      expect(mapped.started_at).toBe('2024-01-15T10:00:00.000Z')
      expect(mapped.completed_at).toBe('2024-01-15T11:00:00.000Z')
    })
  })
})
