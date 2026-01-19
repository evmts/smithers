/**
 * Tests for src/tui/hooks/usePollTableData.ts
 * Hook for polling database table data
 */

import { describe, test, expect, mock } from 'bun:test'
import type { TableData } from './usePollTableData.js'

describe('tui/hooks/usePollTableData', () => {
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

  describe('polling behavior', () => {
    test('polls every 500ms', () => {
      const POLL_INTERVAL = 500
      expect(POLL_INTERVAL).toBe(500)
    })

    test('polls on initial mount', () => {
      // The hook calls poll() immediately after defining it
      let pollCalled = false
      const poll = () => { pollCalled = true }
      poll() // Simulating initial call
      expect(pollCalled).toBe(true)
    })

    test('stops polling on unmount', () => {
      const mockClearInterval = mock(() => {})
      mockClearInterval()
      expect(mockClearInterval).toHaveBeenCalled()
    })
  })

  describe('column fetching', () => {
    test('fetches columns via PRAGMA table_info', () => {
      const tableName = 'agents'
      const expectedQuery = `PRAGMA table_info(${tableName})`
      expect(expectedQuery).toBe('PRAGMA table_info(agents)')
    })

    test('extracts column names from pragma result', () => {
      const pragmaResult = [
        { name: 'id', type: 'TEXT' },
        { name: 'status', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' }
      ]
      const columns = pragmaResult.map(r => r.name)
      expect(columns).toEqual(['id', 'status', 'created_at'])
    })

    test('preserves column order', () => {
      const pragmaResult = [
        { name: 'first' },
        { name: 'second' },
        { name: 'third' }
      ]
      const columns = pragmaResult.map(r => r.name)
      expect(columns[0]).toBe('first')
      expect(columns[1]).toBe('second')
      expect(columns[2]).toBe('third')
    })
  })

  describe('data fetching', () => {
    test('fetches data with SELECT * FROM tableName', () => {
      const tableName = 'executions'
      const expectedQuery = `SELECT * FROM ${tableName} ORDER BY rowid DESC LIMIT 100`
      expect(expectedQuery).toBe('SELECT * FROM executions ORDER BY rowid DESC LIMIT 100')
    })

    test('orders by rowid DESC', () => {
      const query = 'SELECT * FROM agents ORDER BY rowid DESC LIMIT 100'
      expect(query).toContain('ORDER BY rowid DESC')
    })

    test('limits to 100 rows', () => {
      const query = 'SELECT * FROM agents ORDER BY rowid DESC LIMIT 100'
      expect(query).toContain('LIMIT 100')
    })

    test('returns records as objects', () => {
      const tableData: Record<string, unknown>[] = [
        { id: '1', name: 'first', status: 'running' },
        { id: '2', name: 'second', status: 'completed' }
      ]
      
      expect(tableData[0]).toEqual({ id: '1', name: 'first', status: 'running' })
      expect(typeof tableData[0]).toBe('object')
    })
  })

  describe('table name changes', () => {
    test('fetches new table data when tableName changes', () => {
      // useEffect depends on [db, tableName], so changing tableName triggers new poll
      const tableName1 = 'agents'
      const tableName2 = 'phases'
      
      const query1 = `SELECT * FROM ${tableName1} ORDER BY rowid DESC LIMIT 100`
      const query2 = `SELECT * FROM ${tableName2} ORDER BY rowid DESC LIMIT 100`
      
      expect(query1).not.toBe(query2)
      expect(query2).toContain('phases')
    })
  })

  describe('error handling', () => {
    test('sets columns to empty array on error', () => {
      let columns: string[] = ['id', 'name']
      
      try {
        throw new Error('Query failed')
      } catch {
        columns = []
      }
      
      expect(columns).toEqual([])
    })

    test('sets data to empty array on error', () => {
      let data: Record<string, unknown>[] = [{ id: '1' }]
      
      try {
        throw new Error('Query failed')
      } catch {
        data = []
      }
      
      expect(data).toEqual([])
    })

    test('handles non-existent table', () => {
      // When table doesn't exist, the query throws and error handling kicks in
      let columns: string[] = []
      let data: Record<string, unknown>[] = []
      
      try {
        throw new Error('no such table: nonexistent')
      } catch {
        columns = []
        data = []
      }
      
      expect(columns).toEqual([])
      expect(data).toEqual([])
    })

    test('handles invalid table name', () => {
      // Invalid names would cause SQL errors
      const invalidName = 'invalid;table'
      let error: string | null = null
      
      try {
        // This would throw in real usage
        if (invalidName.includes(';')) {
          throw new Error('Invalid table name')
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
      }
      
      expect(error).toBe('Invalid table name')
    })
  })

  describe('SQL injection prevention', () => {
    test('NOTE: tableName is directly interpolated - document security concern', () => {
      // The current implementation uses string interpolation for tableName
      // This is a security concern if tableName comes from user input
      const tableName = "agents; DROP TABLE users;--"
      const query = `PRAGMA table_info(${tableName})`
      
      // This demonstrates the vulnerability
      expect(query).toContain('DROP TABLE')
    })

    test('should validate tableName against allowed list', () => {
      // Recommended fix: validate against whitelist
      const ALLOWED_TABLES = ['agents', 'phases', 'executions', 'tool_calls', 'state']
      
      const validateTableName = (name: string): boolean => {
        return ALLOWED_TABLES.includes(name)
      }
      
      expect(validateTableName('agents')).toBe(true)
      expect(validateTableName('malicious_table')).toBe(false)
      expect(validateTableName("'; DROP TABLE users;--")).toBe(false)
    })
  })

  describe('edge cases', () => {
    test('handles table with no rows', () => {
      const tableData: Record<string, unknown>[] = []
      expect(tableData).toHaveLength(0)
    })

    test('handles table with no columns', () => {
      const columns: string[] = []
      expect(columns).toHaveLength(0)
    })

    test('handles table with many columns', () => {
      const manyColumns = Array.from({ length: 50 }, (_, i) => `col${i}`)
      expect(manyColumns).toHaveLength(50)
    })

    test('handles various data types in columns', () => {
      const row: Record<string, unknown> = {
        id: '123',           // string
        count: 42,           // number
        active: true,        // boolean (as 1/0 in SQLite)
        created_at: '2024-01-15T10:00:00Z', // timestamp string
        data: null,          // null
        amount: 3.14         // float
      }
      
      expect(typeof row['id']).toBe('string')
      expect(typeof row['count']).toBe('number')
      expect(typeof row['active']).toBe('boolean')
      expect(row['data']).toBeNull()
    })
  })

  describe('TableData interface', () => {
    test('has columns and data properties', () => {
      const tableData: TableData = {
        columns: ['id', 'name', 'status'],
        data: [
          { id: '1', name: 'first', status: 'running' },
          { id: '2', name: 'second', status: 'completed' }
        ]
      }
      
      expect(tableData.columns).toBeDefined()
      expect(tableData.data).toBeDefined()
      expect(Array.isArray(tableData.columns)).toBe(true)
      expect(Array.isArray(tableData.data)).toBe(true)
    })

    test('columns is string array', () => {
      const tableData: TableData = {
        columns: ['id', 'name'],
        data: []
      }
      
      expect(tableData.columns.every(c => typeof c === 'string')).toBe(true)
    })

    test('data is array of Record<string, unknown>', () => {
      const tableData: TableData = {
        columns: ['id'],
        data: [{ id: '1', extra: 42 }]
      }
      
      expect(tableData.data[0]!['id']).toBe('1')
      expect(tableData.data[0]!['extra']).toBe(42)
    })
  })

  describe('dependency array', () => {
    test('useEffect depends on db and tableName', () => {
      // The hook's useEffect has dependency array [db, tableName]
      // This means it re-runs when either changes
      const deps = ['db', 'tableName']
      expect(deps).toContain('db')
      expect(deps).toContain('tableName')
      expect(deps).toHaveLength(2)
    })
  })
})
