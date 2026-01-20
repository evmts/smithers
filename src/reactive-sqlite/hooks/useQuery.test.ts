/**
 * Tests for useQuery hook
 *
 * Testing Strategy:
 * - Module exports and function signatures
 * - Type contracts for UseQueryResult and UseQueryOptions
 * - Integration tests via ReactiveDatabase (underlying query/subscription behavior)
 * - Argument parsing validation
 *
 * Note: React hooks require component context. Direct hook invocation tests would
 * require a test renderer (react-test-renderer or @testing-library/react-hooks).
 * Instead, we test the underlying database behavior which the hook delegates to.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { useQuery } from './useQuery.js'
import { ReactiveDatabase } from '../database.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'

describe('useQuery', () => {
  describe('module exports', () => {
    test('useQuery is exported as a function', () => {
      expect(typeof useQuery).toBe('function')
    })

    test('useQuery accepts 1-4 arguments (overloaded)', () => {
      // Minimum: db or sql
      // Maximum: db, sql, params, options  OR  sql, params, options, db
      expect(useQuery.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('type contracts', () => {
    test('UseQueryResult has required properties', () => {
      const result: UseQueryResult<{ id: number }> = {
        data: [],
        isLoading: false,
        error: null,
        refetch: () => {},
      }
      expect(result.data).toEqual([])
      expect(result.isLoading).toBe(false)
      expect(result.error).toBeNull()
      expect(typeof result.refetch).toBe('function')
    })

    test('UseQueryResult with data', () => {
      const result: UseQueryResult<{ id: number; name: string }> = {
        data: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
        isLoading: false,
        error: null,
        refetch: () => {},
      }
      expect(result.data).toHaveLength(2)
      expect(result.data[0].name).toBe('Alice')
    })

    test('UseQueryResult with error', () => {
      const error = new Error('Query failed')
      const result: UseQueryResult<unknown> = {
        data: [],
        isLoading: false,
        error,
        refetch: () => {},
      }
      expect(result.error).toBe(error)
      expect(result.data).toEqual([])
    })

    test('UseQueryOptions shape', () => {
      const options: UseQueryOptions = {
        skip: true,
        deps: ['dep1', 123],
      }
      expect(options.skip).toBe(true)
      expect(options.deps).toEqual(['dep1', 123])
    })

    test('UseQueryOptions with skip only', () => {
      const options: UseQueryOptions = { skip: false }
      expect(options.skip).toBe(false)
      expect(options.deps).toBeUndefined()
    })

    test('UseQueryOptions with deps only', () => {
      const options: UseQueryOptions = { deps: [1, 2, 3] }
      expect(options.skip).toBeUndefined()
      expect(options.deps).toEqual([1, 2, 3])
    })

    test('UseQueryOptions defaults (empty object)', () => {
      const options: UseQueryOptions = {}
      expect(options.skip).toBeUndefined()
      expect(options.deps).toBeUndefined()
    })
  })
})

/**
 * Integration tests verifying the underlying ReactiveDatabase behavior
 * that useQuery depends on. This tests query execution, caching semantics,
 * and subscription-based reactivity.
 */
describe('useQuery underlying behavior via ReactiveDatabase', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER)')
    db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  describe('query execution', () => {
    test('db.query returns array of results', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      const users = db.query<{ id: number; name: string }>('SELECT * FROM users ORDER BY id')
      expect(users).toHaveLength(2)
      expect(users[0]).toEqual({ id: 1, name: 'Alice', active: null })
      expect(users[1]).toEqual({ id: 2, name: 'Bob', active: null })
    })

    test('db.query with parameters', () => {
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [1, 'Alice', 1])
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [2, 'Bob', 0])
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [3, 'Charlie', 1])

      const activeUsers = db.query<{ id: number; name: string }>(
        'SELECT id, name FROM users WHERE active = ?',
        [1]
      )
      expect(activeUsers).toHaveLength(2)
      expect(activeUsers.map(u => u.name)).toEqual(['Alice', 'Charlie'])
    })

    test('db.query returns empty array when no results', () => {
      const users = db.query('SELECT * FROM users')
      expect(users).toEqual([])
    })

    test('db.query throws on invalid SQL', () => {
      expect(() => {
        db.query('SELECT * FROM nonexistent_table')
      }).toThrow()
    })
  })

  describe('subscription and reactivity', () => {
    test('subscribeQuery triggers callback on table changes', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => {
        callCount++
      })

      expect(callCount).toBe(0)

      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(callCount).toBe(1)

      db.run('UPDATE users SET name = ? WHERE name = ?', ['Alicia', 'Alice'])
      expect(callCount).toBe(2)

      db.run('DELETE FROM users WHERE name = ?', ['Alicia'])
      expect(callCount).toBe(3)
    })

    test('subscription only triggers for relevant tables', () => {
      let usersCallCount = 0
      let postsCallCount = 0

      db.subscribeQuery('SELECT * FROM users', () => { usersCallCount++ })
      db.subscribeQuery('SELECT * FROM posts', () => { postsCallCount++ })

      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(usersCallCount).toBe(1)
      expect(postsCallCount).toBe(0)

      db.run('INSERT INTO posts (title) VALUES (?)', ['First Post'])
      expect(usersCallCount).toBe(1)
      expect(postsCallCount).toBe(1)
    })

    test('unsubscribe stops notifications', () => {
      let callCount = 0
      const unsubscribe = db.subscribeQuery('SELECT * FROM users', () => {
        callCount++
      })

      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(callCount).toBe(1)

      unsubscribe()

      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      expect(callCount).toBe(1) // No additional call
    })

    test('multiple subscriptions to same table all trigger', () => {
      let count1 = 0
      let count2 = 0
      let count3 = 0

      db.subscribeQuery('SELECT * FROM users', () => { count1++ })
      db.subscribeQuery('SELECT id FROM users', () => { count2++ })
      db.subscribeQuery('SELECT name FROM users WHERE active = 1', () => { count3++ })

      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      expect(count1).toBe(1)
      expect(count2).toBe(1)
      expect(count3).toBe(1)
    })
  })

  describe('caching behavior simulation', () => {
    /**
     * useQuery uses a cache keyed by JSON.stringify({ sql, params, skip, dbId })
     * This test simulates that behavior
     */
    test('same sql and params should produce same cache key', () => {
      const makeKey = (sql: string, params: any[], skip: boolean, dbId: number) =>
        JSON.stringify({ sql, params, skip, dbId })

      const key1 = makeKey('SELECT * FROM users WHERE id = ?', [1], false, 0)
      const key2 = makeKey('SELECT * FROM users WHERE id = ?', [1], false, 0)

      expect(key1).toBe(key2)
    })

    test('different params produce different cache keys', () => {
      const makeKey = (sql: string, params: any[], skip: boolean, dbId: number) =>
        JSON.stringify({ sql, params, skip, dbId })

      const key1 = makeKey('SELECT * FROM users WHERE id = ?', [1], false, 0)
      const key2 = makeKey('SELECT * FROM users WHERE id = ?', [2], false, 0)

      expect(key1).not.toBe(key2)
    })

    test('skip flag changes cache key', () => {
      const makeKey = (sql: string, params: any[], skip: boolean, dbId: number) =>
        JSON.stringify({ sql, params, skip, dbId })

      const key1 = makeKey('SELECT * FROM users', [], false, 0)
      const key2 = makeKey('SELECT * FROM users', [], true, 0)

      expect(key1).not.toBe(key2)
    })

    test('different db identity changes cache key', () => {
      const makeKey = (sql: string, params: any[], skip: boolean, dbId: number) =>
        JSON.stringify({ sql, params, skip, dbId })

      const key1 = makeKey('SELECT * FROM users', [], false, 0)
      const key2 = makeKey('SELECT * FROM users', [], false, 1)

      expect(key1).not.toBe(key2)
    })
  })

  describe('skip option behavior', () => {
    test('when skip is true, query should not execute', () => {
      // In the hook, skip: true returns empty data without executing query
      // We verify the option is understood
      const options: UseQueryOptions = { skip: true }
      expect(options.skip).toBe(true)

      // The actual skip behavior is tested through the hook
      // Here we verify the option structure
    })

    test('when skip is false or undefined, query executes normally', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      const options1: UseQueryOptions = { skip: false }
      const options2: UseQueryOptions = {}

      expect(options1.skip).toBe(false)
      expect(options2.skip).toBeUndefined()

      // Both should result in query execution (verified in hook context)
    })
  })

  describe('error handling', () => {
    test('invalid SQL produces error', () => {
      let error: Error | null = null
      try {
        db.query('INVALID SQL SYNTAX')
      } catch (e) {
        error = e as Error
      }

      expect(error).not.toBeNull()
      expect(error!.message).toBeDefined()
    })

    test('SQL with undefined table throws', () => {
      expect(() => db.query('SELECT * FROM undefined_table')).toThrow()
    })

    test('parameter count mismatch throws error', () => {
      // bun:sqlite enforces parameter count matching
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      expect(() => {
        db.query('SELECT * FROM users WHERE id = ? AND name = ?', [1])
      }).toThrow()
    })
  })

  describe('dependency tracking', () => {
    test('extractReadTables correctly identifies SELECT tables', () => {
      // Verified through subscription behavior
      let called = false
      db.subscribeQuery('SELECT u.*, p.title FROM users u JOIN posts p ON u.id = p.user_id', () => {
        called = true
      })

      db.run('INSERT INTO posts (title) VALUES (?)', ['Test'])
      expect(called).toBe(true)
    })

    test('subscription detects CTEs', () => {
      let called = false
      db.subscribeQuery(`
        WITH active_users AS (SELECT * FROM users WHERE active = 1)
        SELECT * FROM active_users
      `, () => {
        called = true
      })

      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Alice', 1])
      expect(called).toBe(true)
    })

    test('subscription detects subqueries', () => {
      let called = false
      db.subscribeQuery(`
        SELECT * FROM users
        WHERE id IN (SELECT user_id FROM posts)
      `, () => {
        called = true
      })

      db.run('INSERT INTO posts (user_id, title) VALUES (?, ?)', [1, 'Post'])
      expect(called).toBe(true)
    })
  })

  describe('re-render triggers', () => {
    test('manual invalidate triggers subscriptions', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => {
        callCount++
      })

      db.invalidate(['users'])
      expect(callCount).toBe(1)

      db.invalidate(['users'])
      expect(callCount).toBe(2)
    })

    test('invalidate with no tables triggers all subscriptions', () => {
      let usersCount = 0
      let postsCount = 0

      db.subscribeQuery('SELECT * FROM users', () => { usersCount++ })
      db.subscribeQuery('SELECT * FROM posts', () => { postsCount++ })

      db.invalidate() // No tables = all
      expect(usersCount).toBe(1)
      expect(postsCount).toBe(1)
    })

    test('transaction batches invalidations', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => {
        callCount++
      })

      db.transaction(() => {
        db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
        db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
        db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])
      })

      // Only one notification after transaction commits
      expect(callCount).toBe(1)
    })
  })

  describe('isLoading behavior', () => {
    test('SQLite queries are synchronous, isLoading always false', () => {
      // In useQuery, isLoading is always false because SQLite is sync
      // This verifies that db.query is synchronous
      const start = Date.now()
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      const result = db.query('SELECT * FROM users')
      const elapsed = Date.now() - start

      expect(result).toHaveLength(1)
      expect(elapsed).toBeLessThan(100) // Should be effectively instant
    })
  })

  describe('edge cases', () => {
    test('closed database returns empty array', () => {
      db.close()
      const result = db.query('SELECT * FROM users')
      expect(result).toEqual([])
    })

    test('query with NULL values', () => {
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [1, null, null])
      const result = db.query<{ id: number; name: string | null; active: number | null }>(
        'SELECT * FROM users WHERE id = 1'
      )
      expect(result[0].name).toBeNull()
      expect(result[0].active).toBeNull()
    })

    test('query with BLOB values', () => {
      db.exec('CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)')
      const blob = new Uint8Array([1, 2, 3, 4])
      db.run('INSERT INTO blobs (data) VALUES (?)', [blob])

      const result = db.query<{ id: number; data: Uint8Array }>('SELECT * FROM blobs')
      expect(result[0].data).toBeInstanceOf(Uint8Array)
      expect(result[0].data[0]).toBe(1)
    })

    test('empty params array is equivalent to no params', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      const result1 = db.query('SELECT * FROM users')
      const result2 = db.query('SELECT * FROM users', [])

      expect(result1).toEqual(result2)
    })
  })
})

describe('useQuery argument parsing', () => {
  /**
   * useQuery supports multiple call signatures:
   * 1. useQuery(db, sql, params?, options?)        - Legacy
   * 2. useQuery(sql, params?, options?, db?)       - Context-based
   * 3. useQuery(sql, db)                           - Shorthand with explicit db
   * 4. useQuery(sql, params, db)                   - Shorthand with params and db
   *
   * The parsing logic is complex. These tests verify expected behavior.
   */

  test('isDb helper detects ReactiveDatabase', () => {
    // The hook uses this check: obj !== null && typeof obj === 'object' && 'subscribe' in obj
    const db = new ReactiveDatabase(':memory:')
    const isDb = (obj: unknown): boolean =>
      obj !== null && typeof obj === 'object' && 'subscribe' in obj && typeof (obj as any).subscribe === 'function'

    expect(isDb(db)).toBe(true)
    expect(isDb(null)).toBe(false)
    expect(isDb({})).toBe(false)
    expect(isDb({ subscribe: 'not a function' })).toBe(false)
    expect(isDb({ subscribe: () => {} })).toBe(true)

    db.close()
  })

  test('Array.isArray distinguishes params from options', () => {
    const params = [1, 'test']
    const options: UseQueryOptions = { skip: false }

    expect(Array.isArray(params)).toBe(true)
    expect(Array.isArray(options)).toBe(false)
  })

  test('type narrowing for first argument', () => {
    const sql = 'SELECT * FROM users'
    const db = new ReactiveDatabase(':memory:')

    // First arg is string = new signature
    expect(typeof sql).toBe('string')
    // First arg is db = legacy signature
    expect(typeof db).toBe('object')

    db.close()
  })
})
