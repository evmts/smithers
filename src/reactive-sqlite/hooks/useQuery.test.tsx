/**
 * Comprehensive tests for useQuery hook
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React, { useState } from 'react'
import { ReactiveDatabase } from '../database.js'
import { DatabaseProvider } from './context.js'
import { useQuery } from './useQuery.js'
import { createSmithersRoot } from '../../reconciler/root.js'

describe('useQuery', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1)')
    db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  describe('initial state', () => {
    test('returns empty array initially for empty table', async () => {
      let result: ReturnType<typeof useQuery> | null = null

      function Consumer() {
        result = useQuery(db, 'SELECT * FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result).not.toBeNull()
      expect(result!.data).toEqual([])
      expect(result!.isLoading).toBe(false)
      expect(result!.error).toBeNull()

      root.dispose()
    })

    test('returns data when table has rows', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])

      let result: ReturnType<typeof useQuery> | null = null

      function Consumer() {
        result = useQuery<{ id: number; name: string }>(db, 'SELECT * FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(2)
      expect(result!.data[0]!.name).toBe('Alice')
      expect(result!.data[1]!.name).toBe('Bob')

      root.dispose()
    })
  })

  describe('error handling', () => {
    test('sets error state on query throw', async () => {
      let result: ReturnType<typeof useQuery> | null = null

      function Consumer() {
        result = useQuery(db, 'SELECT * FROM nonexistent_table')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.error).not.toBeNull()
      expect(result!.error!.message).toContain('nonexistent_table')
      expect(result!.data).toEqual([])

      root.dispose()
    })

    test('sets error state on invalid SQL syntax', async () => {
      let result: ReturnType<typeof useQuery> | null = null

      function Consumer() {
        result = useQuery(db, 'SELECTT * FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.error).not.toBeNull()

      root.dispose()
    })
  })

  describe('refetch', () => {
    test('refetch() re-executes query', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQuery<{ id: number; name: string }>> | null = null

      function Consumer() {
        result = useQuery<{ id: number; name: string }>(db, 'SELECT * FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)
      expect(result!.data[0]!.name).toBe('Alice')

      // Add another user without going through db.run (bypass auto-invalidation)
      db.raw.run('INSERT INTO users (name) VALUES (?)', ['Bob'])

      // Manual refetch
      result!.refetch()

      // Re-render to see updated data
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(2)

      root.dispose()
    })
  })

  describe('reactivity', () => {
    test('params change triggers re-query', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let result: ReturnType<typeof useQuery<{ id: number; name: string }>> | null = null
      let setUserId: ((id: number) => void) | null = null

      function Consumer() {
        const [userId, _setUserId] = useState(1)
        setUserId = _setUserId
        result = useQuery<{ id: number; name: string }>(
          db,
          'SELECT * FROM users WHERE id = ?',
          [userId]
        )
        return <status userId={userId} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)
      expect(result!.data[0]!.name).toBe('Alice')

      // Change params
      setUserId!(2)
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)
      expect(result!.data[0]!.name).toBe('Bob')

      root.dispose()
    })

    test('SQL change triggers re-query', async () => {
      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Alice', 1])
      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Bob', 0])

      let result: ReturnType<typeof useQuery<{ id: number; name: string }>> | null = null
      let setActiveOnly: ((active: boolean) => void) | null = null

      function Consumer() {
        const [activeOnly, _setActiveOnly] = useState(true)
        setActiveOnly = _setActiveOnly
        const sql = activeOnly
          ? 'SELECT * FROM users WHERE active = 1'
          : 'SELECT * FROM users'
        result = useQuery<{ id: number; name: string }>(db, sql)
        return <status activeOnly={activeOnly} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)
      expect(result!.data[0]!.name).toBe('Alice')

      // Change SQL
      setActiveOnly!(false)
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(2)

      root.dispose()
    })

    test('auto-invalidates when table data changes', async () => {
      let result: ReturnType<typeof useQuery<{ id: number; name: string }>> | null = null

      function Consumer() {
        result = useQuery<{ id: number; name: string }>(db, 'SELECT * FROM users')
        return <status count={result.data.length} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(0)

      // Insert data - should auto-invalidate and update cache
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      // Call refetch to force cache refresh
      result!.refetch()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)

      root.dispose()
    })
  })

  describe('skip option', () => {
    test('skip: true prevents query execution', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQuery> | null = null

      function Consumer() {
        result = useQuery(db, 'SELECT * FROM users', [], { skip: true })
        return <status skipped />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toEqual([])
      expect(result!.isLoading).toBe(false)
      expect(result!.error).toBeNull()

      root.dispose()
    })

    test('skip: false executes query', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null

      function Consumer() {
        result = useQuery<{ name: string }>(db, 'SELECT * FROM users', [], { skip: false })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)

      root.dispose()
    })

    test('toggling skip re-executes query', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null
      let setSkip: ((skip: boolean) => void) | null = null

      function Consumer() {
        const [skip, _setSkip] = useState(true)
        setSkip = _setSkip
        result = useQuery<{ name: string }>(db, 'SELECT * FROM users', [], { skip })
        return <status skip={skip} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toEqual([])

      // Enable query
      setSkip!(false)
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)

      root.dispose()
    })
  })

  describe('deps option', () => {
    test('deps change triggers re-fetch', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let fetchCount = 0
      let setExtraDep: ((dep: number) => void) | null = null

      function Consumer() {
        const [extraDep, _setExtraDep] = useState(0)
        setExtraDep = _setExtraDep
        useQuery<{ name: string }>(db, 'SELECT * FROM users', [], { deps: [extraDep] })
        fetchCount++
        return <status dep={extraDep} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      const initialFetchCount = fetchCount

      // Change dep
      setExtraDep!(1)
      await root.render(<Consumer />)

      expect(fetchCount).toBeGreaterThan(initialFetchCount)

      root.dispose()
    })
  })

  describe('unmount unsubscription', () => {
    test('unsubscribes on unmount without errors', async () => {
      let setShowConsumer: ((show: boolean) => void) | null = null
      let renderCount = 0

      function Consumer() {
        renderCount++
        useQuery(db, 'SELECT * FROM users')
        return <status consuming />
      }

      function App() {
        const [show, _setShow] = useState(true)
        setShowConsumer = _setShow
        return show ? <Consumer /> : <status hidden />
      }

      const root = createSmithersRoot()
      await root.render(<App />)

      const rendersBeforeUnmount = renderCount

      setShowConsumer!(false)
      await root.render(<App />)

      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      expect(renderCount).toBe(rendersBeforeUnmount)

      root.dispose()
    })
  })

  describe('context signature', () => {
    test('useQuery(sql) works with DatabaseProvider', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null

      function Consumer() {
        result = useQuery<{ name: string }>('SELECT * FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      )

      expect(result!.data).toHaveLength(1)
      expect(result!.data[0]!.name).toBe('Alice')

      root.dispose()
    })

    test('useQuery(sql, params) works with DatabaseProvider', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null

      function Consumer() {
        result = useQuery<{ name: string }>('SELECT * FROM users WHERE id = ?', [1])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      )

      expect(result!.data).toHaveLength(1)
      expect(result!.data[0]!.name).toBe('Alice')

      root.dispose()
    })

    test('useQuery(sql, params, options) works with DatabaseProvider', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null

      function Consumer() {
        result = useQuery<{ name: string }>('SELECT * FROM users', [], { skip: false })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      )

      expect(result!.data).toHaveLength(1)

      root.dispose()
    })
  })

  describe('legacy signature', () => {
    test('useQuery(db, sql) works', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null

      function Consumer() {
        result = useQuery<{ name: string }>(db, 'SELECT * FROM users')
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)

      root.dispose()
    })

    test('useQuery(db, sql, params) works', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null

      function Consumer() {
        result = useQuery<{ name: string }>(db, 'SELECT * FROM users WHERE id = ?', [1])
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)
      expect(result!.data[0]!.name).toBe('Alice')

      root.dispose()
    })

    test('useQuery(db, sql, params, options) works', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null

      function Consumer() {
        result = useQuery<{ name: string }>(db, 'SELECT * FROM users', [], { skip: false })
        return <status ready />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)

      expect(result!.data).toHaveLength(1)

      root.dispose()
    })
  })

  describe('missing db throws', () => {
    test('throws when no db and no provider', async () => {
      let thrownError: Error | null = null

      function Consumer() {
        try {
          useQuery('SELECT * FROM users')
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

  describe('cache behavior', () => {
    test('same query key returns cached result', async () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

      let renderCount = 0
      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null

      function Consumer() {
        renderCount++
        result = useQuery<{ name: string }>(db, 'SELECT * FROM users')
        return <status render={renderCount} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)
      const firstData = result!.data

      await root.render(<Consumer />)
      const secondData = result!.data

      // Same reference due to caching
      expect(firstData).toBe(secondData)

      root.dispose()
    })

    test('different query key invalidates cache', async () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let result: ReturnType<typeof useQuery<{ name: string }>> | null = null
      let setUserId: ((id: number) => void) | null = null

      function Consumer() {
        const [userId, _setUserId] = useState(1)
        setUserId = _setUserId
        result = useQuery<{ name: string }>(db, 'SELECT * FROM users WHERE id = ?', [userId])
        return <status userId={userId} />
      }

      const root = createSmithersRoot()
      await root.render(<Consumer />)
      const firstData = result!.data

      setUserId!(2)
      await root.render(<Consumer />)
      const secondData = result!.data

      // Different data due to different query key
      expect(firstData).not.toBe(secondData)
      expect(firstData[0]!.name).toBe('Alice')
      expect(secondData[0]!.name).toBe('Bob')

      root.dispose()
    })
  })
})
