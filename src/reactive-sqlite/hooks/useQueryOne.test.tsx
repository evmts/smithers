/**
 * Comprehensive tests for useQueryOne hook
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { ReactiveDatabase } from '../database.js'
import { DatabaseProvider } from './context.js'
import { useQueryOne } from './useQueryOne.js'
import { createSmithersRoot } from '../../reconciler/root.js'

interface User {
  id: number
  name: string
  active: number
}

describe('useQueryOne', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1)')
  })

  afterEach(() => {
    db.close()
  })

  describe('returns single row or null', () => {
    test('returns null for empty result', async () => {
      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users WHERE id = ?', [999])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBeNull()
      expect(result!.isLoading).toBe(false)
      expect(result!.error).toBeNull()

      root.dispose()
    })

    test('returns single row when exists', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users WHERE id = ?', [1])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).not.toBeNull()
      expect(result!.data!.name).toBe('Alice')
      expect(result!.data!.id).toBe(1)

      root.dispose()
    })
  })

  describe('first row when multiple', () => {
    test('returns first row when query returns multiple', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [3, 'Charlie'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users ORDER BY id ASC')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).not.toBeNull()
      expect(result!.data!.name).toBe('Alice')
      expect(result!.data!.id).toBe(1)

      root.dispose()
    })

    test('respects ORDER BY to get correct first row', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [3, 'Charlie'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users ORDER BY id DESC')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data!.name).toBe('Charlie')
      expect(result!.data!.id).toBe(3)

      root.dispose()
    })
  })

  describe('null for empty result', () => {
    test('returns null when table is empty', async () => {
      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBeNull()

      root.dispose()
    })

    test('returns null when WHERE clause matches nothing', async () => {
      db.run('INSERT INTO users (id, name, active) VALUES (?, ?, ?)', [1, 'Alice', 1])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users WHERE active = ?', [0])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBeNull()

      root.dispose()
    })
  })

  describe('reactivity', () => {
    test('updates when row is modified via refetch', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users WHERE id = ?', [1])
        return <status name={result?.data?.name} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data!.name).toBe('Alice')

      // Update the row (bypassing auto-invalidation to test refetch)
      db.raw.run('UPDATE users SET name = ? WHERE id = ?', ['Alicia', 1])

      // Refetch to get updated data
      result!.refetch()
      await root.render(<Consumer />)

      expect(result!.data!.name).toBe('Alicia')

      root.dispose()
    })

    test('updates when row is deleted via refetch', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users WHERE id = ?', [1])
        return <status hasData={!!result?.data} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).not.toBeNull()

      // Delete the row (bypassing auto-invalidation to test refetch)
      db.raw.run('DELETE FROM users WHERE id = ?', [1])

      // Refetch to get updated data
      result!.refetch()
      await root.render(<Consumer />)

      expect(result!.data).toBeNull()

      root.dispose()
    })
  })

  describe('context signature', () => {
    test('useQueryOne(sql) works with DatabaseProvider', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>('SELECT * FROM users LIMIT 1')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      )

      expect(result!.data).not.toBeNull()
      expect(result!.data!.name).toBe('Alice')

      root.dispose()
    })

    test('useQueryOne(sql, params) works with DatabaseProvider', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>('SELECT * FROM users WHERE id = ?', [2])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      )

      expect(result!.data!.name).toBe('Bob')

      root.dispose()
    })

    test('useQueryOne(sql, params, db) works with explicit db', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>('SELECT * FROM users WHERE id = ?', [1], db)
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data!.name).toBe('Alice')

      root.dispose()
    })
  })

  describe('legacy signature', () => {
    test('useQueryOne(db, sql) works', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data!.name).toBe('Alice')

      root.dispose()
    })

    test('useQueryOne(db, sql, params) works', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users WHERE id = ?', [2])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data!.name).toBe('Bob')

      root.dispose()
    })

    test('useQueryOne(db, sql, params, options) works', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users', [], { skip: false })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data!.name).toBe('Alice')

      root.dispose()
    })
  })

  describe('error handling', () => {
    test('sets error state on invalid query', async () => {
      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM nonexistent')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.error).not.toBeNull()
      expect(result!.data).toBeNull()

      root.dispose()
    })
  })

  describe('skip option', () => {
    test('skip: true returns null', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users', [], { skip: true })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBeNull()

      root.dispose()
    })
  })

  describe('missing db throws', () => {
    test('throws when no db and no provider', async () => {
      let thrownError: Error | null = null

      function Consumer() {
        try {
          useQueryOne('SELECT * FROM users')
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

  describe('refetch', () => {
    test('refetch() re-executes query', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryOne<User>> | null = null

      function Consumer() {
        result = useQueryOne<User>(db, 'SELECT * FROM users WHERE id = ?', [1])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data!.name).toBe('Alice')

      // Update bypassing auto-invalidation
      db.raw.run('UPDATE users SET name = ? WHERE id = ?', ['Alicia', 1])

      result!.refetch()
      await root.render(<Consumer />)

      expect(result!.data!.name).toBe('Alicia')

      root.dispose()
    })
  })
})
