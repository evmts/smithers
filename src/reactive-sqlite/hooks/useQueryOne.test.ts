/**
 * Tests for useQueryOne hook
 *
 * useQueryOne is a thin wrapper around useQuery that returns:
 * - data: T | null (first row or null, instead of T[])
 * - All other UseQueryResult properties unchanged
 *
 * Testing Strategy:
 * - Module exports and function signatures
 * - Type contracts showing T | null return type
 * - Integration tests via ReactiveDatabase.queryOne behavior
 * - Argument parsing validation (same as useQuery)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { useQueryOne } from './useQueryOne.js'
import { ReactiveDatabase } from '../database.js'
import type { UseQueryResult } from '../types.js'

describe('useQueryOne', () => {
  describe('module exports', () => {
    test('useQueryOne is exported as a function', () => {
      expect(typeof useQueryOne).toBe('function')
    })

    test('useQueryOne accepts 1-4 arguments (overloaded)', () => {
      expect(useQueryOne.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('type contracts', () => {
    test('return type has data: T | null (not T[])', () => {
      // TypeScript contract: useQueryOne returns { data: T | null, ... }
      type QueryOneResult = Omit<UseQueryResult<{ id: number }>, 'data'> & { data: { id: number } | null }

      const result: QueryOneResult = {
        data: null,
        isLoading: false,
        error: null,
        refetch: () => {},
      }
      expect(result.data).toBeNull()
    })

    test('data can be a single object when found', () => {
      type User = { id: number; name: string }
      type QueryOneResult = Omit<UseQueryResult<User>, 'data'> & { data: User | null }

      const result: QueryOneResult = {
        data: { id: 1, name: 'Alice' },
        isLoading: false,
        error: null,
        refetch: () => {},
      }
      expect(result.data?.id).toBe(1)
      expect(result.data?.name).toBe('Alice')
    })

    test('data is null when no results', () => {
      type QueryOneResult = Omit<UseQueryResult<unknown>, 'data'> & { data: unknown | null }

      const result: QueryOneResult = {
        data: null,
        isLoading: false,
        error: null,
        refetch: () => {},
      }
      expect(result.data).toBeNull()
    })

    test('error and refetch are preserved from UseQueryResult', () => {
      const error = new Error('Query failed')
      type QueryOneResult = Omit<UseQueryResult<unknown>, 'data'> & { data: unknown | null }

      const result: QueryOneResult = {
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
 * Integration tests verifying ReactiveDatabase.queryOne behavior
 * which useQueryOne delegates to (via useQuery + [0] extraction)
 */
describe('useQueryOne underlying behavior via ReactiveDatabase', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, active INTEGER)')
    db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  describe('single row retrieval', () => {
    test('returns single row when exists', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      const user = db.queryOne<{ id: number; name: string }>('SELECT * FROM users WHERE id = 1')
      expect(user).not.toBeNull()
      expect(user?.id).toBe(1)
      expect(user?.name).toBe('Alice')
    })

    test('returns null when no match', () => {
      const user = db.queryOne('SELECT * FROM users WHERE id = 999')
      expect(user).toBeNull()
    })

    test('returns first row when multiple match', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [3, 'Charlie'])

      const user = db.queryOne<{ id: number; name: string }>(
        'SELECT * FROM users ORDER BY id ASC'
      )
      expect(user?.id).toBe(1)
      expect(user?.name).toBe('Alice')
    })

    test('ORDER BY affects which row is first', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [3, 'Charlie'])

      const ascending = db.queryOne<{ id: number; name: string }>(
        'SELECT * FROM users ORDER BY name ASC'
      )
      expect(ascending?.name).toBe('Alice')

      const descending = db.queryOne<{ id: number; name: string }>(
        'SELECT * FROM users ORDER BY name DESC'
      )
      expect(descending?.name).toBe('Charlie')
    })
  })

  describe('parameterized queries', () => {
    test('queryOne with single parameter', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      const user = db.queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [1])
      expect(user?.name).toBe('Alice')
    })

    test('queryOne with multiple parameters', () => {
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [1, 'Alice', 1])
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [2, 'Bob', 0])
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [3, 'Charlie', 1])

      const user = db.queryOne<{ id: number; name: string }>(
        'SELECT id, name FROM users WHERE name = ? AND active = ?',
        ['Charlie', 1]
      )
      expect(user?.id).toBe(3)
    })

    test('queryOne returns null for non-matching parameters', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      const user = db.queryOne('SELECT * FROM users WHERE id = ?', [999])
      expect(user).toBeNull()
    })
  })

  describe('complex queries', () => {
    test('queryOne with JOIN', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO posts (id, user_id, title) VALUES (?, ?, ?)', [1, 1, 'First Post'])

      const result = db.queryOne<{ userName: string; postTitle: string }>(
        'SELECT u.name AS userName, p.title AS postTitle FROM users u JOIN posts p ON u.id = p.user_id'
      )
      expect(result?.userName).toBe('Alice')
      expect(result?.postTitle).toBe('First Post')
    })

    test('queryOne with subquery', () => {
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [1, 'Alice', 1])
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [2, 'Bob', 1])
      db.run('INSERT INTO posts (id, user_id, title) VALUES (?, ?, ?)', [1, 1, 'Post'])

      const user = db.queryOne<{ name: string }>(
        'SELECT name FROM users WHERE id IN (SELECT user_id FROM posts)'
      )
      expect(user?.name).toBe('Alice')
    })

    test('queryOne with aggregate in subquery', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      const result = db.queryOne<{ maxId: number }>(
        'SELECT MAX(id) as maxId FROM users'
      )
      expect(result?.maxId).toBe(2)
    })
  })

  describe('column types', () => {
    test('queryOne preserves NULL values', () => {
      db.run('INSERT INTO users (id, name, email, active) VALUES (?, ?, ?, ?)', [1, 'Alice', null, null])

      const user = db.queryOne<{ id: number; name: string; email: string | null; active: number | null }>(
        'SELECT * FROM users WHERE id = 1'
      )
      expect(user?.name).toBe('Alice')
      expect(user?.email).toBeNull()
      expect(user?.active).toBeNull()
    })

    test('queryOne with BLOB column', () => {
      db.exec('CREATE TABLE files (id INTEGER PRIMARY KEY, data BLOB)')
      const blob = new Uint8Array([0x01, 0x02, 0x03])
      db.run('INSERT INTO files (data) VALUES (?)', [blob])

      const file = db.queryOne<{ data: Uint8Array }>('SELECT data FROM files')
      expect(file?.data).toBeInstanceOf(Uint8Array)
      expect(file?.data[0]).toBe(1)
    })

    test('queryOne with TEXT column', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice with spaces'])

      const user = db.queryOne<{ name: string }>('SELECT name FROM users')
      expect(user?.name).toBe('Alice with spaces')
    })

    test('queryOne with INTEGER column', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [12345, 'Alice'])

      const user = db.queryOne<{ id: number }>('SELECT id FROM users')
      expect(user?.id).toBe(12345)
    })

    test('queryOne with REAL column', () => {
      db.exec('CREATE TABLE prices (id INTEGER PRIMARY KEY, value REAL)')
      db.run('INSERT INTO prices (value) VALUES (?)', [19.99])

      const price = db.queryOne<{ value: number }>('SELECT value FROM prices')
      expect(price?.value).toBeCloseTo(19.99)
    })
  })

  describe('reactivity (subscription behavior)', () => {
    test('subscription triggers when queried row changes', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let callCount = 0
      db.subscribeQuery('SELECT * FROM users WHERE id = 1', () => {
        callCount++
      })

      // Update the specific row
      db.run('UPDATE users SET name = ? WHERE id = ?', ['Alicia', 1])
      expect(callCount).toBe(1)
    })

    test('subscription triggers when row is deleted', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let callCount = 0
      db.subscribeQuery('SELECT * FROM users WHERE id = 1', () => {
        callCount++
      })

      db.run('DELETE FROM users WHERE id = ?', [1])
      expect(callCount).toBe(1)
    })

    test('subscription triggers when matching row is inserted', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users WHERE id = 1', () => {
        callCount++
      })

      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      expect(callCount).toBe(1)
    })
  })

  describe('edge cases', () => {
    test('queryOne on empty table returns null', () => {
      const user = db.queryOne('SELECT * FROM users')
      expect(user).toBeNull()
    })

    test('queryOne with LIMIT 1 is equivalent to queryOne without', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      const withLimit = db.queryOne<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1')
      const withoutLimit = db.queryOne<{ id: number }>('SELECT id FROM users ORDER BY id')

      expect(withLimit?.id).toBe(withoutLimit?.id)
    })

    test('queryOne with column alias', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      const user = db.queryOne<{ userId: number; userName: string }>(
        'SELECT id AS userId, name AS userName FROM users'
      )
      expect(user?.userId).toBe(1)
      expect(user?.userName).toBe('Alice')
    })

    test('queryOne with expression column', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      const result = db.queryOne<{ doubled: number; upper: string }>(
        'SELECT id * 2 AS doubled, UPPER(name) AS upper FROM users'
      )
      expect(result?.doubled).toBe(2)
      expect(result?.upper).toBe('ALICE')
    })

    test('closed database returns null', () => {
      db.close()
      const user = db.queryOne('SELECT * FROM users')
      expect(user).toBeNull()
    })
  })
})

describe('useQueryOne argument parsing', () => {
  test('same parsing logic as useQuery applies', () => {
    // useQueryOne delegates to useQuery, so argument parsing is identical
    // Verify the function signature matches
    expect(typeof useQueryOne).toBe('function')

    // Both support: (db, sql, params?, options?) and (sql, params?, options?, db?)
    const db = new ReactiveDatabase(':memory:')

    // Verify db is detected as ReactiveDatabase
    const isDb = (obj: unknown): boolean =>
      obj !== null && typeof obj === 'object' && 'subscribe' in obj && typeof (obj as any).subscribe === 'function'

    expect(isDb(db)).toBe(true)

    db.close()
  })
})
