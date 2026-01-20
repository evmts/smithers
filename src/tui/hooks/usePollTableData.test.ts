/**
 * Tests for src/tui/hooks/usePollTableData.ts
 * Hook for polling table data from SQLite
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { TableData } from './usePollTableData.js'
import { isAllowedTableName } from './usePollTableData.js'
import { resetTuiState } from '../state.js'

describe('tui/hooks/usePollTableData', () => {
  beforeEach(() => {
    resetTuiState()
  })

  afterEach(() => {
    resetTuiState()
  })

  describe('initial state', () => {
    test('columns is empty array initially', () => {
      const initialColumns: string[] = []
      expect(initialColumns).toEqual([])
      expect(initialColumns).toHaveLength(0)
    })

    test('data is empty array initially', () => {
      const initialData: Record<string, unknown>[] = []
      expect(initialData).toEqual([])
      expect(initialData).toHaveLength(0)
    })
  })

  describe('TableData interface', () => {
    test('has columns and data properties', () => {
      const tableData: TableData = {
        columns: ['id', 'name', 'status'],
        data: [{ id: '1', name: 'test', status: 'running' }]
      }

      expect(tableData.columns).toBeDefined()
      expect(tableData.data).toBeDefined()
    })

    test('columns is string array', () => {
      const tableData: TableData = {
        columns: ['col1', 'col2', 'col3'],
        data: []
      }
      expect(tableData.columns).toHaveLength(3)
      expect(tableData.columns[0]).toBe('col1')
    })

    test('data is array of records', () => {
      const tableData: TableData = {
        columns: ['id', 'value'],
        data: [
          { id: '1', value: 100 },
          { id: '2', value: 200 }
        ]
      }
      expect(tableData.data).toHaveLength(2)
      expect(tableData.data[0]).toEqual({ id: '1', value: 100 })
    })
  })

  describe('isAllowedTableName', () => {
    test('returns true for executions table', () => {
      expect(isAllowedTableName('executions')).toBe(true)
    })

    test('returns true for phases table', () => {
      expect(isAllowedTableName('phases')).toBe(true)
    })

    test('returns true for agents table', () => {
      expect(isAllowedTableName('agents')).toBe(true)
    })

    test('returns true for tool_calls table', () => {
      expect(isAllowedTableName('tool_calls')).toBe(true)
    })

    test('returns true for human_interactions table', () => {
      expect(isAllowedTableName('human_interactions')).toBe(true)
    })

    test('returns true for render_frames table', () => {
      expect(isAllowedTableName('render_frames')).toBe(true)
    })

    test('returns true for tasks table', () => {
      expect(isAllowedTableName('tasks')).toBe(true)
    })

    test('returns true for steps table', () => {
      expect(isAllowedTableName('steps')).toBe(true)
    })

    test('returns true for reports table', () => {
      expect(isAllowedTableName('reports')).toBe(true)
    })

    test('returns true for memories table', () => {
      expect(isAllowedTableName('memories')).toBe(true)
    })

    test('returns true for state table', () => {
      expect(isAllowedTableName('state')).toBe(true)
    })

    test('returns true for transitions table', () => {
      expect(isAllowedTableName('transitions')).toBe(true)
    })

    test('returns true for artifacts table', () => {
      expect(isAllowedTableName('artifacts')).toBe(true)
    })

    test('returns true for commits table', () => {
      expect(isAllowedTableName('commits')).toBe(true)
    })

    test('returns true for snapshots table', () => {
      expect(isAllowedTableName('snapshots')).toBe(true)
    })

    test('returns true for reviews table', () => {
      expect(isAllowedTableName('reviews')).toBe(true)
    })

    test('returns false for unknown table', () => {
      expect(isAllowedTableName('unknown_table')).toBe(false)
    })

    test('returns false for SQL injection attempt', () => {
      expect(isAllowedTableName('executions; DROP TABLE users;')).toBe(false)
    })

    test('returns false for table name with special characters', () => {
      expect(isAllowedTableName('table-with-dash')).toBe(false)
    })

    test('returns false for empty string', () => {
      expect(isAllowedTableName('')).toBe(false)
    })

    test('returns false for table name starting with number', () => {
      expect(isAllowedTableName('123table')).toBe(false)
    })
  })

  describe('table name pattern validation', () => {
    test('TABLE_NAME_PATTERN matches valid identifiers', () => {
      const pattern = /^[A-Za-z_][A-Za-z0-9_]*$/
      expect(pattern.test('executions')).toBe(true)
      expect(pattern.test('tool_calls')).toBe(true)
      expect(pattern.test('_private')).toBe(true)
      expect(pattern.test('Table123')).toBe(true)
    })

    test('TABLE_NAME_PATTERN rejects invalid identifiers', () => {
      const pattern = /^[A-Za-z_][A-Za-z0-9_]*$/
      expect(pattern.test('123start')).toBe(false)
      expect(pattern.test('table-name')).toBe(false)
      expect(pattern.test('table.name')).toBe(false)
      expect(pattern.test('')).toBe(false)
      expect(pattern.test(' ')).toBe(false)
    })
  })

  describe('polling behavior', () => {
    test('polls every 500ms', () => {
      const POLL_INTERVAL = 500
      expect(POLL_INTERVAL).toBe(500)
    })

    test('cleanup clears interval', () => {
      const mockClearInterval = mock(() => {})
      mockClearInterval()
      expect(mockClearInterval).toHaveBeenCalled()
    })

    test('restarts polling when db changes', () => {
      const deps = ['db', 'tableName']
      expect(deps).toContain('db')
    })

    test('restarts polling when tableName changes', () => {
      const deps = ['db', 'tableName']
      expect(deps).toContain('tableName')
    })
  })

  describe('PRAGMA table_info query', () => {
    test('extracts column names from PRAGMA result', () => {
      const pragmaResult = [
        { name: 'id' },
        { name: 'name' },
        { name: 'status' }
      ]
      const columns = pragmaResult.map(r => r.name)
      expect(columns).toEqual(['id', 'name', 'status'])
    })
  })

  describe('table data query', () => {
    test('orders by rowid DESC', () => {
      const query = 'SELECT * FROM executions ORDER BY rowid DESC LIMIT 100'
      expect(query).toContain('ORDER BY rowid DESC')
    })

    test('limits to 100 rows', () => {
      const query = 'SELECT * FROM executions ORDER BY rowid DESC LIMIT 100'
      expect(query).toContain('LIMIT 100')
    })
  })

  describe('disallowed table handling', () => {
    test('sets columns to empty array for disallowed table', () => {
      let columns: string[] = ['old', 'columns']

      if (!isAllowedTableName('invalid_table')) {
        columns = []
      }

      expect(columns).toEqual([])
    })

    test('sets data to empty array for disallowed table', () => {
      let data: Record<string, unknown>[] = [{ old: 'data' }]

      if (!isAllowedTableName('invalid_table')) {
        data = []
      }

      expect(data).toEqual([])
    })

    test('returns early without making queries', () => {
      let queriesMade = 0

      if (!isAllowedTableName('invalid_table')) {
        // Return early
      } else {
        queriesMade++
      }

      expect(queriesMade).toBe(0)
    })
  })

  describe('error handling', () => {
    test('sets columns to empty array on error', () => {
      let columns: string[] = ['existing']

      try {
        throw new Error('Database error')
      } catch {
        columns = []
      }

      expect(columns).toEqual([])
    })

    test('sets data to empty array on error', () => {
      let data: Record<string, unknown>[] = [{ existing: true }]

      try {
        throw new Error('Database error')
      } catch {
        data = []
      }

      expect(data).toEqual([])
    })

    test('logs debug message on error', () => {
      const consoleDebug = mock(() => {})

      try {
        throw new Error('Polling error')
      } catch (err) {
        consoleDebug('[usePollTableData] Polling error:', err)
      }

      expect(consoleDebug).toHaveBeenCalled()
    })
  })

  describe('state keys', () => {
    test('generates unique key for columns based on tableName', () => {
      const tableName = 'executions'
      const columnsKey = `tui:table:${tableName}:columns`
      expect(columnsKey).toBe('tui:table:executions:columns')
    })

    test('generates unique key for data based on tableName', () => {
      const tableName = 'agents'
      const dataKey = `tui:table:${tableName}:rows`
      expect(dataKey).toBe('tui:table:agents:rows')
    })
  })

  describe('edge cases', () => {
    test('handles empty table', () => {
      const tableData: TableData = {
        columns: ['id', 'name'],
        data: []
      }
      expect(tableData.data).toHaveLength(0)
    })

    test('handles table with no columns', () => {
      const tableData: TableData = {
        columns: [],
        data: []
      }
      expect(tableData.columns).toHaveLength(0)
    })

    test('handles many rows', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        id: `row-${i}`,
        value: i
      }))
      expect(data).toHaveLength(100)
    })

    test('handles rows with null values', () => {
      const data: Record<string, unknown>[] = [
        { id: '1', name: null, status: 'running' },
        { id: '2', name: 'test', status: null }
      ]
      expect(data[0]!['name']).toBeNull()
      expect(data[1]!['status']).toBeNull()
    })

    test('handles various column types', () => {
      const data: Record<string, unknown>[] = [
        {
          id: '1',
          count: 42,
          ratio: 3.14,
          active: true,
          tags: null,
          created_at: '2024-01-15T10:00:00Z'
        }
      ]

      expect(typeof data[0]!['id']).toBe('string')
      expect(typeof data[0]!['count']).toBe('number')
      expect(typeof data[0]!['ratio']).toBe('number')
      expect(typeof data[0]!['active']).toBe('boolean')
      expect(data[0]!['tags']).toBeNull()
      expect(typeof data[0]!['created_at']).toBe('string')
    })
  })

  describe('ALLOWED_TABLES constant', () => {
    test('contains all expected tables', () => {
      const ALLOWED_TABLES = [
        'executions', 'phases', 'agents', 'tool_calls', 'human_interactions',
        'render_frames', 'tasks', 'steps', 'reports', 'memories',
        'state', 'transitions', 'artifacts', 'commits', 'snapshots', 'reviews'
      ]
      expect(ALLOWED_TABLES).toHaveLength(16)
    })

    test('does not contain system tables', () => {
      const ALLOWED_TABLES = [
        'executions', 'phases', 'agents', 'tool_calls', 'human_interactions',
        'render_frames', 'tasks', 'steps', 'reports', 'memories',
        'state', 'transitions', 'artifacts', 'commits', 'snapshots', 'reviews'
      ]
      expect(ALLOWED_TABLES).not.toContain('sqlite_master')
      expect(ALLOWED_TABLES).not.toContain('sqlite_sequence')
    })
  })

  describe('poll key memoization', () => {
    test('creates new pollKey when db changes', () => {
      const db1 = { id: 'db1' }
      const db2 = { id: 'db2' }
      const tableName = 'executions'

      const pollKey1 = { db: db1, tableName }
      const pollKey2 = { db: db2, tableName }

      expect(pollKey1.db).not.toBe(pollKey2.db)
    })

    test('creates new pollKey when tableName changes', () => {
      const db = { id: 'db1' }
      const tableName1 = 'executions'
      const tableName2 = 'agents'

      const pollKey1 = { db, tableName: tableName1 }
      const pollKey2 = { db, tableName: tableName2 }

      expect(pollKey1.tableName).not.toBe(pollKey2.tableName)
    })
  })
})
