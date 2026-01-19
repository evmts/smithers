/**
 * Comprehensive tests for useQueryValue hook
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { ReactiveDatabase } from '../database.js'
import { DatabaseProvider } from './context.js'
import { useQueryValue } from './useQueryValue.js'
import { createSmithersRoot } from '../../reconciler/root.js'

describe('useQueryValue', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, salary REAL)')
    db.exec('CREATE TABLE stats (id INTEGER PRIMARY KEY, value INTEGER)')
  })

  afterEach(() => {
    db.close()
  })

  describe('extracts first column value', () => {
    test('returns first column value from single row', async () => {
      db.run('INSERT INTO users (id, name, age) VALUES (?, ?, ?)', [1, 'Alice', 30])

      let result: ReturnType<typeof useQueryValue<string>> | null = null

      function Consumer() {
        result = useQueryValue<string>(db, 'SELECT name FROM users WHERE id = ?', [1])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe('Alice')
      expect(result!.isLoading).toBe(false)
      expect(result!.error).toBeNull()

      root.dispose()
    })

    test('returns first column when multiple columns selected', async () => {
      db.run('INSERT INTO users (id, name, age) VALUES (?, ?, ?)', [1, 'Alice', 30])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT id, name, age FROM users WHERE id = ?', [1])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(1)

      root.dispose()
    })

    test('returns aliased column value', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQueryValue<string>> | null = null

      function Consumer() {
        result = useQueryValue<string>(db, 'SELECT name as username FROM users WHERE id = ?', [1])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe('Alice')

      root.dispose()
    })
  })

  describe('null for empty result', () => {
    test('returns null when no rows', async () => {
      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT id FROM users WHERE id = ?', [999])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBeNull()

      root.dispose()
    })

    test('returns null when table is empty', async () => {
      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT id FROM users LIMIT 1')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBeNull()

      root.dispose()
    })
  })

  describe('COUNT queries', () => {
    test('COUNT(*) returns correct count', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT COUNT(*) as count FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(3)

      root.dispose()
    })

    test('COUNT with WHERE returns correct count', async () => {
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Charlie', 35])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT COUNT(*) as count FROM users WHERE age >= ?', [30])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(2)

      root.dispose()
    })

    test('COUNT returns 0 for empty result', async () => {
      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT COUNT(*) as count FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(0)

      root.dispose()
    })
  })

  describe('SUM queries', () => {
    test('SUM returns correct total', async () => {
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Charlie', 35])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT SUM(age) as total FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(90)

      root.dispose()
    })

    test('SUM with WHERE returns correct total', async () => {
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Charlie', 35])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT SUM(age) as total FROM users WHERE age >= ?', [30])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(65)

      root.dispose()
    })

    test('SUM returns null for empty result', async () => {
      let result: ReturnType<typeof useQueryValue<number | null>> | null = null

      function Consumer() {
        result = useQueryValue<number | null>(db, 'SELECT SUM(age) as total FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      // SQLite SUM of no rows returns null
      expect(result!.data).toBeNull()

      root.dispose()
    })
  })

  describe('AVG queries', () => {
    test('AVG returns correct average', async () => {
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 20])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Charlie', 40])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT AVG(age) as avg FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(30)

      root.dispose()
    })

    test('AVG with REAL column returns decimal', async () => {
      db.run('INSERT INTO users (name, salary) VALUES (?, ?)', ['Alice', 50000.50])
      db.run('INSERT INTO users (name, salary) VALUES (?, ?)', ['Bob', 60000.50])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT AVG(salary) as avg FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(55000.5)

      root.dispose()
    })
  })

  describe('MIN/MAX queries', () => {
    test('MIN returns minimum value', async () => {
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 20])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Charlie', 40])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT MIN(age) as min FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(20)

      root.dispose()
    })

    test('MAX returns maximum value', async () => {
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 20])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Charlie', 40])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT MAX(age) as max FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(40)

      root.dispose()
    })
  })

  describe('reactivity', () => {
    test('updates when data changes via refetch', async () => {
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT COUNT(*) as count FROM users')
        return <status count={result?.data} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(1)

      // Insert bypassing auto-invalidation to test refetch
      db.raw.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25])

      result!.refetch()
      await root.render(<Consumer />)

      expect(result!.data).toBe(2)

      root.dispose()
    })
  })

  describe('context signature', () => {
    test('useQueryValue(sql) works with DatabaseProvider', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>('SELECT COUNT(*) as count FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      )

      expect(result!.data).toBe(2)

      root.dispose()
    })

    test('useQueryValue(sql, params) works with DatabaseProvider', async () => {
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>('SELECT COUNT(*) as count FROM users WHERE age >= ?', [30])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      )

      expect(result!.data).toBe(1)

      root.dispose()
    })

    test('useQueryValue(sql, params, db) works with explicit db', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>('SELECT COUNT(*) as count FROM users', [], db)
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(1)

      root.dispose()
    })
  })

  describe('legacy signature', () => {
    test('useQueryValue(db, sql) works', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT COUNT(*) as count FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(1)

      root.dispose()
    })

    test('useQueryValue(db, sql, params) works', async () => {
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
      db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT SUM(age) as total FROM users WHERE age >= ?', [25])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(55)

      root.dispose()
    })
  })

  describe('error handling', () => {
    test('sets error state on invalid query', async () => {
      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT COUNT(*) FROM nonexistent')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.error).not.toBeNull()
      expect(result!.data).toBeNull()

      root.dispose()
    })
  })

  describe('missing db throws', () => {
    test('throws when no db and no provider', async () => {
      let thrownError: Error | null = null

      function Consumer() {
        try {
          useQueryValue('SELECT COUNT(*) FROM users')
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

  describe('skip option', () => {
    test('skip: true returns null', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT COUNT(*) as count FROM users', [], { skip: true })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBeNull()

      root.dispose()
    })
  })

  describe('refetch', () => {
    test('refetch() re-executes query', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQueryValue<number>> | null = null

      function Consumer() {
        result = useQueryValue<number>(db, 'SELECT COUNT(*) as count FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toBe(1)

      // Insert bypassing auto-invalidation
      db.raw.run('INSERT INTO users (name) VALUES (?)', ['Bob'])

      result!.refetch()
      await root.render(<Consumer />)

      expect(result!.data).toBe(2)

      root.dispose()
    })
  })
})
