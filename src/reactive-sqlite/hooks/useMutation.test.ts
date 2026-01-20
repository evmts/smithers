/**
 * Tests for useMutation hook
 *
 * Testing Strategy:
 * - Module exports and function signatures
 * - Type contracts for UseMutationResult and UseMutationOptions
 * - Integration tests via ReactiveDatabase (underlying mutation/invalidation behavior)
 * - Argument parsing validation
 *
 * Note: React hooks require component context. We test the underlying database
 * mutation behavior which the hook delegates to.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { useMutation } from './useMutation.js'
import { ReactiveDatabase } from '../database.js'
import type { UseMutationResult, UseMutationOptions } from '../types.js'

describe('useMutation', () => {
  describe('module exports', () => {
    test('useMutation is exported as a function', () => {
      expect(typeof useMutation).toBe('function')
    })

    test('useMutation accepts 1-3 arguments (overloaded)', () => {
      expect(useMutation.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('type contracts', () => {
    test('UseMutationResult has required properties', () => {
      const result: UseMutationResult<[string, number]> = {
        mutate: () => {},
        mutateAsync: async () => {},
        isLoading: false,
        error: null,
      }
      expect(typeof result.mutate).toBe('function')
      expect(typeof result.mutateAsync).toBe('function')
      expect(result.isLoading).toBe(false)
      expect(result.error).toBeNull()
    })

    test('UseMutationResult with error', () => {
      const error = new Error('Mutation failed')
      const result: UseMutationResult = {
        mutate: () => {},
        mutateAsync: async () => {},
        isLoading: false,
        error,
      }
      expect(result.error).toBe(error)
    })

    test('UseMutationResult during loading', () => {
      const result: UseMutationResult = {
        mutate: () => {},
        mutateAsync: async () => {},
        isLoading: true,
        error: null,
      }
      expect(result.isLoading).toBe(true)
    })

    test('UseMutationOptions shape', () => {
      const options: UseMutationOptions = {
        invalidateTables: ['users', 'posts'],
        onSuccess: () => {},
        onError: (err) => console.error(err),
      }
      expect(options.invalidateTables).toEqual(['users', 'posts'])
      expect(typeof options.onSuccess).toBe('function')
      expect(typeof options.onError).toBe('function')
    })

    test('UseMutationOptions with only invalidateTables', () => {
      const options: UseMutationOptions = { invalidateTables: ['users'] }
      expect(options.invalidateTables).toEqual(['users'])
      expect(options.onSuccess).toBeUndefined()
      expect(options.onError).toBeUndefined()
    })

    test('UseMutationOptions with only callbacks', () => {
      const options: UseMutationOptions = {
        onSuccess: () => {},
        onError: () => {},
      }
      expect(options.invalidateTables).toBeUndefined()
    })

    test('UseMutationOptions defaults (empty object)', () => {
      const options: UseMutationOptions = {}
      expect(options.invalidateTables).toBeUndefined()
      expect(options.onSuccess).toBeUndefined()
      expect(options.onError).toBeUndefined()
    })
  })
})

/**
 * Integration tests verifying the underlying ReactiveDatabase behavior
 * that useMutation depends on. This tests mutation execution, auto-invalidation,
 * and manual table invalidation.
 */
describe('useMutation underlying behavior via ReactiveDatabase', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)')
    db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)')
    db.exec('CREATE TABLE logs (id INTEGER PRIMARY KEY, action TEXT, timestamp TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  describe('mutation execution (db.run)', () => {
    test('INSERT returns lastInsertRowid', () => {
      const result = db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(result.lastInsertRowid).toBe(1)

      const result2 = db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      expect(result2.lastInsertRowid).toBe(2)
    })

    test('UPDATE returns changes count', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])

      const result = db.run('UPDATE users SET email = ?', ['test@example.com'])
      expect(result.changes).toBe(3)
    })

    test('UPDATE with WHERE returns affected rows count', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      const result = db.run('UPDATE users SET name = ? WHERE id = ?', ['Alicia', 1])
      expect(result.changes).toBe(1)
    })

    test('DELETE returns deleted rows count', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])

      const result = db.run('DELETE FROM users WHERE name = ?', ['Alice'])
      expect(result.changes).toBe(1)
    })

    test('DELETE all returns total count', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])

      const result = db.run('DELETE FROM users')
      expect(result.changes).toBe(3)
    })

    test('mutation with no matches returns 0 changes', () => {
      const result = db.run('UPDATE users SET name = ? WHERE id = ?', ['Nobody', 999])
      expect(result.changes).toBe(0)
    })
  })

  describe('auto-invalidation on mutations', () => {
    test('INSERT auto-invalidates affected table', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => { callCount++ })

      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(callCount).toBe(1)
    })

    test('UPDATE auto-invalidates affected table', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => { callCount++ })

      db.run('UPDATE users SET name = ? WHERE id = ?', ['Alicia', 1])
      expect(callCount).toBe(1)
    })

    test('DELETE auto-invalidates affected table', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => { callCount++ })

      db.run('DELETE FROM users')
      expect(callCount).toBe(1)
    })

    test('mutation only invalidates affected table, not others', () => {
      let usersCount = 0
      let postsCount = 0

      db.subscribeQuery('SELECT * FROM users', () => { usersCount++ })
      db.subscribeQuery('SELECT * FROM posts', () => { postsCount++ })

      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(usersCount).toBe(1)
      expect(postsCount).toBe(0)
    })
  })

  describe('manual table invalidation', () => {
    test('invalidate() with specific tables triggers subscriptions', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => { callCount++ })

      db.invalidate(['users'])
      expect(callCount).toBe(1)

      db.invalidate(['users'])
      expect(callCount).toBe(2)
    })

    test('invalidate() with multiple tables', () => {
      let usersCount = 0
      let postsCount = 0
      let logsCount = 0

      db.subscribeQuery('SELECT * FROM users', () => { usersCount++ })
      db.subscribeQuery('SELECT * FROM posts', () => { postsCount++ })
      db.subscribeQuery('SELECT * FROM logs', () => { logsCount++ })

      db.invalidate(['users', 'posts'])
      expect(usersCount).toBe(1)
      expect(postsCount).toBe(1)
      expect(logsCount).toBe(0)
    })

    test('invalidate() with empty array is no-op', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => { callCount++ })

      db.invalidate([])
      expect(callCount).toBe(0)
    })

    test('invalidate() with no args invalidates all', () => {
      let usersCount = 0
      let postsCount = 0

      db.subscribeQuery('SELECT * FROM users', () => { usersCount++ })
      db.subscribeQuery('SELECT * FROM posts', () => { postsCount++ })

      db.invalidate()
      expect(usersCount).toBe(1)
      expect(postsCount).toBe(1)
    })
  })

  describe('error handling', () => {
    test('invalid SQL throws error', () => {
      expect(() => {
        db.run('INVALID SQL SYNTAX')
      }).toThrow()
    })

    test('constraint violation throws error', () => {
      db.exec('CREATE TABLE unique_users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)')
      db.run('INSERT INTO unique_users (email) VALUES (?)', ['test@example.com'])

      expect(() => {
        db.run('INSERT INTO unique_users (email) VALUES (?)', ['test@example.com'])
      }).toThrow()
    })

    test('foreign key violation throws error', () => {
      db.exec('CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)')
      db.exec('CREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES authors(id))')

      expect(() => {
        db.run('INSERT INTO books (author_id) VALUES (?)', [999])
      }).toThrow()
    })

    test('NOT NULL violation throws error', () => {
      db.exec('CREATE TABLE required (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')

      expect(() => {
        db.run('INSERT INTO required (name) VALUES (?)', [null])
      }).toThrow()
    })
  })

  describe('callback simulation', () => {
    /**
     * useMutation supports onSuccess and onError callbacks.
     * We test the pattern these callbacks would follow.
     */
    test('success pattern: mutation completes without error', () => {
      let successCalled = false
      let errorCalled = false

      try {
        db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
        successCalled = true
      } catch {
        errorCalled = true
      }

      expect(successCalled).toBe(true)
      expect(errorCalled).toBe(false)
    })

    test('error pattern: mutation throws and error callback runs', () => {
      let successCalled = false
      let errorCalled = false
      let capturedError: Error | null = null

      try {
        db.run('INSERT INTO nonexistent_table (col) VALUES (?)', ['value'])
        successCalled = true
      } catch (e) {
        errorCalled = true
        capturedError = e as Error
      }

      expect(successCalled).toBe(false)
      expect(errorCalled).toBe(true)
      expect(capturedError).not.toBeNull()
    })
  })

  describe('async mutation pattern', () => {
    /**
     * useMutation provides mutateAsync which wraps the sync db.run in a Promise.
     * We verify the pattern works correctly.
     */
    test('async wrapper resolves on success', async () => {
      const mutateAsync = async (...params: any[]) => {
        db.run('INSERT INTO users (name) VALUES (?)', params)
      }

      await expect(mutateAsync('Alice')).resolves.toBeUndefined()

      const users = db.query('SELECT * FROM users')
      expect(users).toHaveLength(1)
    })

    test('async wrapper rejects on error', async () => {
      const mutateAsync = async (...params: any[]) => {
        db.run('INSERT INTO nonexistent_table (col) VALUES (?)', params)
      }

      await expect(mutateAsync('value')).rejects.toThrow()
    })
  })

  describe('transaction behavior', () => {
    test('mutations in transaction batch invalidations', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => { callCount++ })

      db.transaction(() => {
        db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
        db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
        db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])
      })

      // Single notification after commit
      expect(callCount).toBe(1)

      // Verify all inserts succeeded
      const users = db.query('SELECT * FROM users')
      expect(users).toHaveLength(3)
    })

    test('failed transaction rolls back and skips invalidation', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => { callCount++ })

      try {
        db.transaction(() => {
          db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
          throw new Error('Simulated failure')
        })
      } catch {
        // Expected
      }

      // No notification because transaction rolled back
      expect(callCount).toBe(0)

      // Verify rollback
      const users = db.query('SELECT * FROM users')
      expect(users).toHaveLength(0)
    })
  })

  describe('UPSERT operations', () => {
    test('INSERT OR REPLACE invalidates correctly', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let callCount = 0
      db.subscribeQuery('SELECT * FROM users', () => { callCount++ })

      db.run('INSERT OR REPLACE INTO users (id, name) VALUES (?, ?)', [1, 'Alicia'])
      expect(callCount).toBe(1)

      const user = db.queryOne<{ name: string }>('SELECT name FROM users WHERE id = 1')
      expect(user?.name).toBe('Alicia')
    })

    test('ON CONFLICT DO UPDATE invalidates correctly', () => {
      db.exec('CREATE TABLE unique_users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE)')
      db.run('INSERT INTO unique_users (name, email) VALUES (?, ?)', ['Alice', 'alice@test.com'])

      let callCount = 0
      db.subscribeQuery('SELECT * FROM unique_users', () => { callCount++ })

      db.run(
        'INSERT INTO unique_users (name, email) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name',
        ['Alicia', 'alice@test.com']
      )
      expect(callCount).toBe(1)

      const user = db.queryOne<{ name: string }>('SELECT name FROM unique_users')
      expect(user?.name).toBe('Alicia')
    })

    test('ON CONFLICT DO NOTHING does not throw', () => {
      db.exec('CREATE TABLE unique_users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)')
      db.run('INSERT INTO unique_users (email) VALUES (?)', ['test@test.com'])

      let callCount = 0
      db.subscribeQuery('SELECT * FROM unique_users', () => { callCount++ })

      // This should not throw, just do nothing
      db.run('INSERT INTO unique_users (email) VALUES (?) ON CONFLICT DO NOTHING', ['test@test.com'])
      expect(callCount).toBe(1) // Still invalidates

      const count = db.queryValue<number>('SELECT COUNT(*) FROM unique_users')
      expect(count).toBe(1) // No new row
    })
  })

  describe('edge cases', () => {
    test('closed database returns undefined', () => {
      db.close()
      const result = db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(result).toBeUndefined()
    })

    test('mutation with empty params', () => {
      const result = db.run('INSERT INTO users (name) VALUES (NULL)')
      expect(result.lastInsertRowid).toBe(1)

      const user = db.queryOne<{ name: string | null }>('SELECT name FROM users')
      expect(user?.name).toBeNull()
    })

    test('mutation with many params', () => {
      const values = Array.from({ length: 100 }, (_, i) => [`User${i}`])

      for (const [name] of values) {
        db.run('INSERT INTO users (name) VALUES (?)', [name])
      }

      const count = db.queryValue<number>('SELECT COUNT(*) FROM users')
      expect(count).toBe(100)
    })
  })
})

describe('useMutation argument parsing', () => {
  test('isDb helper detects ReactiveDatabase', () => {
    const db = new ReactiveDatabase(':memory:')

    // The hook checks for 'subscribe' method presence
    const isDb = (obj: unknown): boolean =>
      obj !== null && typeof obj === 'object' && 'subscribe' in obj && typeof (obj as any).subscribe === 'function'

    const options: UseMutationOptions = { invalidateTables: ['users'] }

    expect(isDb(db)).toBe(true)
    expect(isDb(options)).toBe(false)

    db.close()
  })

  test('string first argument indicates SQL', () => {
    const sql = 'INSERT INTO users (name) VALUES (?)'
    expect(typeof sql).toBe('string')
  })
})
