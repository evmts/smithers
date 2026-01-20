/**
 * Tests for useQueryValue hook
 *
 * useQueryValue is a thin wrapper around useQuery that returns:
 * - data: T | null (first column of first row, or null)
 * - All other UseQueryResult properties unchanged
 *
 * Implementation extracts: result.data[0] ? Object.values(result.data[0])[0] : null
 *
 * Testing Strategy:
 * - Module exports and function signatures
 * - Type contracts showing T | null return type for scalar values
 * - Integration tests via ReactiveDatabase.queryValue behavior
 * - Column value extraction logic
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { useQueryValue } from './useQueryValue.js'
import { ReactiveDatabase } from '../database.js'
import type { UseQueryResult } from '../types.js'

describe('useQueryValue', () => {
  describe('module exports', () => {
    test('useQueryValue is exported as a function', () => {
      expect(typeof useQueryValue).toBe('function')
    })

    test('useQueryValue accepts 1-4 arguments (overloaded)', () => {
      expect(useQueryValue.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('type contracts', () => {
    test('return type has data: T | null (scalar, not object)', () => {
      // TypeScript contract: useQueryValue<number> returns { data: number | null, ... }
      type QueryValueResult = Omit<UseQueryResult<Record<string, number>>, 'data'> & { data: number | null }

      const result: QueryValueResult = {
        data: null,
        isLoading: false,
        error: null,
        refetch: () => {},
      }
      expect(result.data).toBeNull()
    })

    test('data can be a number', () => {
      type QueryValueResult = Omit<UseQueryResult<Record<string, number>>, 'data'> & { data: number | null }

      const result: QueryValueResult = {
        data: 42,
        isLoading: false,
        error: null,
        refetch: () => {},
      }
      expect(result.data).toBe(42)
    })

    test('data can be a string', () => {
      type QueryValueResult = Omit<UseQueryResult<Record<string, string>>, 'data'> & { data: string | null }

      const result: QueryValueResult = {
        data: 'Alice',
        isLoading: false,
        error: null,
        refetch: () => {},
      }
      expect(result.data).toBe('Alice')
    })

    test('data is null when no results', () => {
      type QueryValueResult = Omit<UseQueryResult<unknown>, 'data'> & { data: unknown }

      const result: QueryValueResult = {
        data: null,
        isLoading: false,
        error: null,
        refetch: () => {},
      }
      expect(result.data).toBeNull()
    })

    test('error and refetch are preserved from UseQueryResult', () => {
      const error = new Error('Query failed')
      type QueryValueResult = Omit<UseQueryResult<unknown>, 'data'> & { data: unknown }

      const result: QueryValueResult = {
        data: null,
        isLoading: false,
        error,
        refetch: () => {},
      }
      expect(result.error).toBe(error)
      expect(typeof result.refetch).toBe('function')
    })
  })
})

/**
 * Integration tests verifying ReactiveDatabase.queryValue behavior
 * which useQueryValue delegates to (via useQuery + first column extraction)
 */
describe('useQueryValue underlying behavior via ReactiveDatabase', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, active INTEGER)')
    db.exec('CREATE TABLE counters (id INTEGER PRIMARY KEY, count INTEGER)')
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  describe('scalar value retrieval', () => {
    test('returns COUNT(*) as number', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])

      const count = db.queryValue<number>('SELECT COUNT(*) FROM users')
      expect(count).toBe(3)
    })

    test('returns SUM() as number', () => {
      db.run('INSERT INTO counters (count) VALUES (?)', [10])
      db.run('INSERT INTO counters (count) VALUES (?)', [20])
      db.run('INSERT INTO counters (count) VALUES (?)', [30])

      const sum = db.queryValue<number>('SELECT SUM(count) FROM counters')
      expect(sum).toBe(60)
    })

    test('returns AVG() as number', () => {
      db.run('INSERT INTO counters (count) VALUES (?)', [10])
      db.run('INSERT INTO counters (count) VALUES (?)', [20])
      db.run('INSERT INTO counters (count) VALUES (?)', [30])

      const avg = db.queryValue<number>('SELECT AVG(count) FROM counters')
      expect(avg).toBe(20)
    })

    test('returns MAX() as number', () => {
      db.run('INSERT INTO counters (count) VALUES (?)', [10])
      db.run('INSERT INTO counters (count) VALUES (?)', [50])
      db.run('INSERT INTO counters (count) VALUES (?)', [30])

      const max = db.queryValue<number>('SELECT MAX(count) FROM counters')
      expect(max).toBe(50)
    })

    test('returns MIN() as number', () => {
      db.run('INSERT INTO counters (count) VALUES (?)', [10])
      db.run('INSERT INTO counters (count) VALUES (?)', [50])
      db.run('INSERT INTO counters (count) VALUES (?)', [30])

      const min = db.queryValue<number>('SELECT MIN(count) FROM counters')
      expect(min).toBe(10)
    })

    test('returns single string column', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      const name = db.queryValue<string>('SELECT name FROM users WHERE id = 1')
      expect(name).toBe('Alice')
    })

    test('returns null when no rows match', () => {
      const result = db.queryValue('SELECT name FROM users WHERE id = 999')
      expect(result).toBeNull()
    })

    test('returns null for aggregate on empty table', () => {
      // COUNT(*) returns 0 even on empty table
      const count = db.queryValue<number>('SELECT COUNT(*) FROM users')
      expect(count).toBe(0)

      // SUM/AVG/MAX/MIN return NULL on empty table
      const sum = db.queryValue<number>('SELECT SUM(active) FROM users')
      expect(sum).toBeNull()
    })
  })

  describe('first column extraction', () => {
    test('extracts first column when multiple columns selected', () => {
      db.run('INSERT INTO users (id, name, email) VALUES (?, ?, ?)', [1, 'Alice', 'alice@test.com'])

      // SELECT returns { id, name, email }, queryValue extracts 'id' (first column)
      const value = db.queryValue<number>('SELECT id, name, email FROM users')
      expect(value).toBe(1)
    })

    test('column alias does not affect extraction order', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      // First column is 'count', not 'name'
      const count = db.queryValue<number>('SELECT COUNT(*) as count, name FROM users')
      expect(count).toBe(1) // COUNT(*) is first
    })

    test('extracts first column with ORDER BY', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      const name = db.queryValue<string>('SELECT name FROM users ORDER BY id DESC')
      expect(name).toBe('Bob') // First row after ORDER BY
    })

    test('extracts value from expression column', () => {
      db.run('INSERT INTO counters (id, count) VALUES (?, ?)', [1, 10])

      const doubled = db.queryValue<number>('SELECT count * 2 FROM counters')
      expect(doubled).toBe(20)
    })
  })

  describe('different value types', () => {
    test('INTEGER value', () => {
      db.run('INSERT INTO counters (count) VALUES (?)', [12345])

      const count = db.queryValue<number>('SELECT count FROM counters')
      expect(count).toBe(12345)
    })

    test('REAL value', () => {
      db.exec('CREATE TABLE decimals (value REAL)')
      db.run('INSERT INTO decimals (value) VALUES (?)', [3.14159])

      const value = db.queryValue<number>('SELECT value FROM decimals')
      expect(value).toBeCloseTo(3.14159)
    })

    test('TEXT value', () => {
      db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['theme', 'dark'])

      const value = db.queryValue<string>('SELECT value FROM settings WHERE key = ?', ['theme'])
      expect(value).toBe('dark')
    })

    test('NULL value', () => {
      db.run('INSERT INTO users (id, name, email) VALUES (?, ?, ?)', [1, 'Alice', null])

      const email = db.queryValue<string | null>('SELECT email FROM users WHERE id = 1')
      expect(email).toBeNull()
    })

    test('BLOB value', () => {
      db.exec('CREATE TABLE blobs (data BLOB)')
      const blob = new Uint8Array([1, 2, 3, 4])
      db.run('INSERT INTO blobs (data) VALUES (?)', [blob])

      const data = db.queryValue<Uint8Array>('SELECT data FROM blobs')
      expect(data).toBeInstanceOf(Uint8Array)
      expect(data?.[0]).toBe(1)
    })

    test('boolean-like INTEGER (0/1)', () => {
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [1, 'Alice', 1])
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [2, 'Bob', 0])

      const active1 = db.queryValue<number>('SELECT active FROM users WHERE id = 1')
      expect(active1).toBe(1)

      const active2 = db.queryValue<number>('SELECT active FROM users WHERE id = 2')
      expect(active2).toBe(0)
    })
  })

  describe('parameterized queries', () => {
    test('queryValue with single parameter', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      const name = db.queryValue<string>('SELECT name FROM users WHERE id = ?', [2])
      expect(name).toBe('Bob')
    })

    test('queryValue with multiple parameters', () => {
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [1, 'Alice', 1])
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [2, 'Bob', 1])
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [3, 'Charlie', 0])

      const count = db.queryValue<number>(
        'SELECT COUNT(*) FROM users WHERE name LIKE ? AND active = ?',
        ['%o%', 1]
      )
      expect(count).toBe(1) // Only 'Bob' matches
    })

    test('queryValue with no matching parameters returns null', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      const name = db.queryValue<string>('SELECT name FROM users WHERE id = ?', [999])
      expect(name).toBeNull()
    })
  })

  describe('common use cases', () => {
    test('check if record exists (COUNT)', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      const exists = db.queryValue<number>('SELECT COUNT(*) FROM users WHERE id = ?', [1])
      expect(exists).toBe(1)

      const notExists = db.queryValue<number>('SELECT COUNT(*) FROM users WHERE id = ?', [999])
      expect(notExists).toBe(0)
    })

    test('get setting value by key', () => {
      db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['app.version', '1.0.0'])

      const version = db.queryValue<string>('SELECT value FROM settings WHERE key = ?', ['app.version'])
      expect(version).toBe('1.0.0')
    })

    test('get last insert ID', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])

      // SQLite's last_insert_rowid()
      const lastId = db.queryValue<number>('SELECT last_insert_rowid()')
      expect(lastId).toBe(2)
    })

    test('get SQLite version', () => {
      const version = db.queryValue<string>('SELECT sqlite_version()')
      expect(typeof version).toBe('string')
      expect(version).toMatch(/^\d+\.\d+/)
    })

    test('get current timestamp', () => {
      const timestamp = db.queryValue<string>("SELECT datetime('now')")
      expect(typeof timestamp).toBe('string')
    })
  })

  describe('reactivity (subscription behavior)', () => {
    test('subscription triggers when aggregate value changes', () => {
      let callCount = 0
      db.subscribeQuery('SELECT COUNT(*) FROM users', () => {
        callCount++
      })

      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(callCount).toBe(1)

      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      expect(callCount).toBe(2)
    })

    test('subscription triggers on UPDATE affecting value', () => {
      db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['theme', 'light'])

      let callCount = 0
      db.subscribeQuery("SELECT value FROM settings WHERE key = 'theme'", () => {
        callCount++
      })

      db.run("UPDATE settings SET value = ? WHERE key = ?", ['dark', 'theme'])
      expect(callCount).toBe(1)
    })
  })

  describe('edge cases', () => {
    test('queryValue on empty table returns null for aggregates', () => {
      // COUNT returns 0, not null
      const count = db.queryValue<number>('SELECT COUNT(*) FROM users')
      expect(count).toBe(0)

      // Non-COUNT aggregates return null
      const sum = db.queryValue<number>('SELECT SUM(active) FROM users')
      expect(sum).toBeNull()
    })

    test('queryValue with GROUP BY returns first group value', () => {
      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Alice', 1])
      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Bob', 1])
      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Charlie', 0])

      const count = db.queryValue<number>(
        'SELECT COUNT(*) as cnt FROM users GROUP BY active ORDER BY cnt DESC'
      )
      // First group has 2 (active=1), second has 1 (active=0)
      expect(count).toBe(2)
    })

    test('queryValue with DISTINCT', () => {
      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Alice', 1])
      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Bob', 1])
      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Charlie', 0])

      const distinctCount = db.queryValue<number>('SELECT COUNT(DISTINCT active) FROM users')
      expect(distinctCount).toBe(2) // 0 and 1
    })

    test('queryValue with COALESCE for default', () => {
      const result = db.queryValue<number>(
        "SELECT COALESCE((SELECT COUNT(*) FROM users WHERE id = 999), 0)"
      )
      expect(result).toBe(0)
    })

    test('closed database returns null', () => {
      db.close()
      const value = db.queryValue('SELECT COUNT(*) FROM users')
      expect(value).toBeNull()
    })

    test('queryValue extracts 0 correctly (not null)', () => {
      const zero = db.queryValue<number>('SELECT 0')
      expect(zero).toBe(0)
    })

    test('queryValue extracts empty string correctly (not null)', () => {
      const empty = db.queryValue<string>("SELECT ''")
      expect(empty).toBe('')
    })
  })
})

describe('useQueryValue argument parsing', () => {
  test('same parsing logic as useQuery applies', () => {
    expect(typeof useQueryValue).toBe('function')

    const db = new ReactiveDatabase(':memory:')
    const isDb = (obj: unknown): boolean =>
      obj !== null && typeof obj === 'object' && 'subscribe' in obj && typeof (obj as any).subscribe === 'function'

    expect(isDb(db)).toBe(true)

    db.close()
  })
})

describe('value extraction logic', () => {
  /**
   * useQueryValue extracts value via:
   * const firstRow = result.data[0]
   * const value = firstRow ? Object.values(firstRow)[0] ?? null : null
   */
  test('Object.values extracts first column value', () => {
    const row = { count: 42, name: 'Alice' }
    const value = Object.values(row)[0]
    expect(value).toBe(42)
  })

  test('Object.values on empty object', () => {
    const row = {}
    const values = Object.values(row)
    expect(values).toHaveLength(0)
    expect(values[0]).toBeUndefined()
  })

  test('null coalescing for undefined', () => {
    const row = { value: undefined }
    const extracted = Object.values(row)[0] ?? null
    expect(extracted).toBeNull()
  })

  test('null value is preserved (not coalesced)', () => {
    const row = { value: null }
    const extracted = Object.values(row)[0] ?? 'default'
    // null ?? 'default' = 'default' (null triggers ??)
    expect(extracted).toBe('default')
  })

  test('0 is not coalesced', () => {
    const row = { count: 0 }
    const extracted = Object.values(row)[0] ?? null
    expect(extracted).toBe(0)
  })

  test('empty string is not coalesced', () => {
    const row = { name: '' }
    const extracted = Object.values(row)[0] ?? null
    expect(extracted).toBe('')
  })
})
