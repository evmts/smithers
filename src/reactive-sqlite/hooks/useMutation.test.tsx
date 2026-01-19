/**
 * Comprehensive tests for useMutation hook
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React, { useState } from 'react'
import { ReactiveDatabase } from '../database.js'
import { DatabaseProvider } from './context.js'
import { useMutation } from './useMutation.js'
import { useQuery } from './useQuery.js'
import { createSmithersRoot } from '../../reconciler/root.js'

describe('useMutation', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1)')
    db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  describe('mutate() execution', () => {
    test('mutate() executes INSERT', async () => {
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO users (name) VALUES (?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')

      const users = db.query<{ name: string }>('SELECT * FROM users')
      expect(users).toHaveLength(1)
      expect(users[0]!.name).toBe('Alice')

      root.dispose()
    })

    test('mutate() executes UPDATE', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'UPDATE users SET name = ? WHERE id = ?')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alicia', 1)

      const user = db.queryOne<{ name: string }>('SELECT * FROM users WHERE id = ?', [1])
      expect(user!.name).toBe('Alicia')

      root.dispose()
    })

    test('mutate() executes DELETE', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'DELETE FROM users WHERE id = ?')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate(1)

      const users = db.query<{ id: number }>('SELECT * FROM users')
      expect(users).toHaveLength(1)
      expect(users[0]!.id).toBe(2)

      root.dispose()
    })

    test('mutate() with multiple params', async () => {
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO users (name, active) VALUES (?, ?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice', 0)

      const user = db.queryOne<{ name: string; active: number }>('SELECT * FROM users')
      expect(user!.name).toBe('Alice')
      expect(user!.active).toBe(0)

      root.dispose()
    })
  })

  describe('mutateAsync() promise', () => {
    test('mutateAsync() returns promise that resolves', async () => {
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO users (name) VALUES (?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      await result!.mutateAsync('Alice')

      const users = db.query('SELECT * FROM users')
      expect(users).toHaveLength(1)

      root.dispose()
    })

    test('mutateAsync() rejects on error', async () => {
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO nonexistent (name) VALUES (?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      let error: Error | null = null
      try {
        await result!.mutateAsync('Alice')
      } catch (e) {
        error = e as Error
      }

      expect(error).not.toBeNull()
      expect(error!.message).toContain('nonexistent')

      root.dispose()
    })
  })

  describe('error handling', () => {
    test('sets error state on failure', async () => {
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO nonexistent (name) VALUES (?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')
      await root.render(<Consumer />)

      expect(result!.error).not.toBeNull()
      expect(result!.error!.message).toContain('nonexistent')

      root.dispose()
    })

    test('clears error on successful mutation', async () => {
      let result: ReturnType<typeof useMutation> | null = null
      let setSql: ((sql: string) => void) | null = null

      function Consumer() {
        const [sql, _setSql] = useState('INSERT INTO nonexistent (name) VALUES (?)')
        setSql = _setSql
        result = useMutation(db, sql)
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')
      await root.render(<Consumer />)

      expect(result!.error).not.toBeNull()

      // Fix the SQL
      setSql!('INSERT INTO users (name) VALUES (?)')
      await root.render(<Consumer />)

      result!.mutate('Alice')
      await root.render(<Consumer />)

      expect(result!.error).toBeNull()

      root.dispose()
    })
  })

  describe('onSuccess callback', () => {
    test('onSuccess is called after successful mutation', async () => {
      let successCalled = false
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO users (name) VALUES (?)', {
          onSuccess: () => {
            successCalled = true
          },
        })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')

      expect(successCalled).toBe(true)

      root.dispose()
    })

    test('onSuccess is not called on error', async () => {
      let successCalled = false
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO nonexistent (name) VALUES (?)', {
          onSuccess: () => {
            successCalled = true
          },
        })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')

      expect(successCalled).toBe(false)

      root.dispose()
    })
  })

  describe('onError callback', () => {
    test('onError is called on failure', async () => {
      let capturedError: Error | null = null
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO nonexistent (name) VALUES (?)', {
          onError: (error) => {
            capturedError = error
          },
        })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')

      expect(capturedError).not.toBeNull()
      expect(capturedError!.message).toContain('nonexistent')

      root.dispose()
    })

    test('onError is not called on success', async () => {
      let errorCalled = false
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO users (name) VALUES (?)', {
          onError: () => {
            errorCalled = true
          },
        })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')

      expect(errorCalled).toBe(false)

      root.dispose()
    })
  })

  describe('invalidateTables option', () => {
    test('invalidateTables triggers query re-fetch', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let queryResult: ReturnType<typeof useQuery<{ name: string }>> | null = null
      let mutationResult: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        queryResult = useQuery<{ name: string }>(db, 'SELECT * FROM users')
        mutationResult = useMutation(db, 'INSERT INTO posts (title) VALUES (?)', {
          invalidateTables: ['users'],
        })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(queryResult!.data).toHaveLength(1)

      // Insert to posts but invalidate users
      // First add a user bypassing auto-invalidation
      db.raw.run('INSERT INTO users (name) VALUES (?)', ['Bob'])

      mutationResult!.mutate('Post Title')
      // Refetch to get updated data after invalidation
      queryResult!.refetch()
      await root.render(<Consumer />)

      // Users query should have been invalidated and re-fetched
      expect(queryResult!.data).toHaveLength(2)

      root.dispose()
    })

    test('invalidateTables with multiple tables', async () => {
      let usersInvalidated = false
      let postsInvalidated = false

      db.subscribe(['users'], () => {
        usersInvalidated = true
      })
      db.subscribe(['posts'], () => {
        postsInvalidated = true
      })

      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'SELECT 1', {
          invalidateTables: ['users', 'posts'],
        })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      // Reset flags
      usersInvalidated = false
      postsInvalidated = false

      result!.mutate()

      expect(usersInvalidated).toBe(true)
      expect(postsInvalidated).toBe(true)

      root.dispose()
    })
  })

  describe('auto-invalidation', () => {
    test('mutation auto-invalidates affected table', async () => {
      let queryResult: ReturnType<typeof useQuery<{ name: string }>> | null = null
      let mutationResult: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        queryResult = useQuery<{ name: string }>(db, 'SELECT * FROM users')
        mutationResult = useMutation(db, 'INSERT INTO users (name) VALUES (?)')
        return <status count={queryResult.data.length} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(queryResult!.data).toHaveLength(0)

      mutationResult!.mutate('Alice')
      // Refetch to get updated data
      queryResult!.refetch()
      await root.render(<Consumer />)

      expect(queryResult!.data).toHaveLength(1)

      root.dispose()
    })
  })

  describe('isLoading state', () => {
    test('isLoading is false initially', async () => {
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO users (name) VALUES (?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.isLoading).toBe(false)

      root.dispose()
    })

    test('isLoading becomes false after mutation completes', async () => {
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO users (name) VALUES (?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')
      await root.render(<Consumer />)

      // Synchronous SQLite - isLoading should be false after mutation
      expect(result!.isLoading).toBe(false)

      root.dispose()
    })
  })

  describe('context signature', () => {
    test('useMutation(sql) works with DatabaseProvider', async () => {
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation('INSERT INTO users (name) VALUES (?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      )

      result!.mutate('Alice')

      const users = db.query('SELECT * FROM users')
      expect(users).toHaveLength(1)

      root.dispose()
    })

    test('useMutation(sql, options) works with DatabaseProvider', async () => {
      let successCalled = false
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation('INSERT INTO users (name) VALUES (?)', {
          onSuccess: () => {
            successCalled = true
          },
        })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      )

      result!.mutate('Alice')

      expect(successCalled).toBe(true)

      root.dispose()
    })
  })

  describe('legacy signature', () => {
    test('useMutation(db, sql) works', async () => {
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO users (name) VALUES (?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')

      const users = db.query('SELECT * FROM users')
      expect(users).toHaveLength(1)

      root.dispose()
    })

    test('useMutation(db, sql, options) works', async () => {
      let successCalled = false
      let result: ReturnType<typeof useMutation> | null = null

      function Consumer() {
        result = useMutation(db, 'INSERT INTO users (name) VALUES (?)', {
          onSuccess: () => {
            successCalled = true
          },
        })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice')

      expect(successCalled).toBe(true)

      root.dispose()
    })
  })

  describe('missing db throws', () => {
    test('throws when no db and no provider', async () => {
      let thrownError: Error | null = null

      function Consumer() {
        try {
          useMutation('INSERT INTO users (name) VALUES (?)')
        } catch (e) {
          thrownError = e as Error
        }
        return <status error />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(thrownError).not.toBeNull()
      expect(thrownError!.message).toContain('DatabaseProvider')

      root.dispose()
    })
  })

  describe('typed params', () => {
    test('mutate with typed params', async () => {
      let result: ReturnType<typeof useMutation<[string, number]>> | null = null

      function Consumer() {
        result = useMutation<[string, number]>(db, 'INSERT INTO users (name, active) VALUES (?, ?)')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      result!.mutate('Alice', 1)

      const user = db.queryOne<{ name: string; active: number }>('SELECT * FROM users')
      expect(user!.name).toBe('Alice')
      expect(user!.active).toBe(1)

      root.dispose()
    })
  })
})
