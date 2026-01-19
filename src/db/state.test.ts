/**
 * Tests for state module - state management with transaction tracking
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createStateModule } from './state.js'

describe('StateModule', () => {
  let db: ReactiveDatabase
  let currentExecutionId: string | null = null

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS transitions (
        id TEXT PRIMARY KEY,
        execution_id TEXT,
        key TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT NOT NULL,
        trigger TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY
      );
    `)
  }

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    setupSchema()
    currentExecutionId = null
  })

  afterEach(() => {
    db.close()
  })

  const createState = () => {
    return createStateModule({
      rdb: db,
      getCurrentExecutionId: () => currentExecutionId
    })
  }

  describe('get/set operations', () => {
    test('sets and gets simple value', () => {
      const state = createState()
      state.set('counter', 42)

      const value = state.get<number>('counter')
      expect(value).toBe(42)
    })

    test('sets and gets complex object', () => {
      const state = createState()
      const config = {
        enabled: true,
        settings: {
          timeout: 5000,
          retries: 3
        },
        tags: ['a', 'b', 'c']
      }

      state.set('config', config)

      const retrieved = state.get<typeof config>('config')
      expect(retrieved).toEqual(config)
    })

    test('returns null for non-existent key', () => {
      const state = createState()
      const value = state.get('nonexistent')
      expect(value).toBeNull()
    })

    test('updates existing key (ON CONFLICT)', () => {
      const state = createState()
      state.set('key1', 'value1')
      state.set('key1', 'value2')

      const value = state.get<string>('key1')
      expect(value).toBe('value2')

      // Verify only one row exists
      const count = db.queryValue<number>('SELECT COUNT(*) FROM state WHERE key = ?', ['key1'])
      expect(count).toBe(1)
    })
  })

  describe('transaction tracking', () => {
    test('logs transition with old/new values', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      state.set('counter', 10)
      state.set('counter', 20)

      const transitions = db.query<{ old_value: string; new_value: string }>(
        'SELECT old_value, new_value FROM transitions WHERE key = ? ORDER BY created_at',
        ['counter']
      )

      expect(transitions).toHaveLength(2)
      expect(JSON.parse(transitions[0].old_value)).toBeNull()
      expect(JSON.parse(transitions[0].new_value)).toBe(10)
      expect(JSON.parse(transitions[1].old_value)).toBe(10)
      expect(JSON.parse(transitions[1].new_value)).toBe(20)
    })

    test('logs trigger parameter', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      state.set('status', 'active', 'user_action')

      const transition = db.queryOne<{ trigger: string }>(
        'SELECT trigger FROM transitions WHERE key = ?',
        ['status']
      )

      expect(transition!.trigger).toBe('user_action')
    })

    test('does not log transition without execution context', () => {
      currentExecutionId = null

      const state = createState()
      state.set('key', 'value')

      const count = db.queryValue<number>('SELECT COUNT(*) FROM transitions')
      expect(count).toBe(0)
    })

    test('setMany updates multiple keys', () => {
      const state = createState()
      state.setMany({
        key1: 'value1',
        key2: 42,
        key3: { nested: true }
      })

      expect(state.get('key1')).toBe('value1')
      expect(state.get('key2')).toBe(42)
      expect(state.get('key3')).toEqual({ nested: true })
    })

    test('setMany logs each transition', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      state.setMany({ a: 1, b: 2, c: 3 }, 'bulk_update')

      const transitions = db.query<{ key: string; trigger: string }>(
        'SELECT key, trigger FROM transitions ORDER BY key'
      )

      expect(transitions).toHaveLength(3)
      expect(transitions.map(t => t.key)).toEqual(['a', 'b', 'c'])
      expect(transitions.every(t => t.trigger === 'bulk_update')).toBe(true)
    })
  })

  describe('JSON handling', () => {
    test('handles null values', () => {
      const state = createState()
      state.set('nullable', null)

      const value = state.get('nullable')
      expect(value).toBeNull()
    })

    test('handles nested objects', () => {
      const state = createState()
      const nested = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      }

      state.set('nested', nested)
      expect(state.get('nested')).toEqual(nested)
    })

    test('handles arrays', () => {
      const state = createState()
      const arr = [1, 'two', { three: 3 }, [4, 5]]

      state.set('array', arr)
      expect(state.get('array')).toEqual(arr)
    })

    test('handles special characters', () => {
      const state = createState()
      const special = {
        quote: '"hello"',
        backslash: 'path\\to\\file',
        newline: 'line1\nline2',
        unicode: '\u0048\u0065\u006C\u006C\u006F',
        emoji: '\u{1F600}'
      }

      state.set('special', special)
      expect(state.get('special')).toEqual(special)
    })

    test('handles boolean values', () => {
      const state = createState()
      state.set('trueVal', true)
      state.set('falseVal', false)

      expect(state.get('trueVal')).toBe(true)
      expect(state.get('falseVal')).toBe(false)
    })

    test('handles number edge cases', () => {
      const state = createState()
      state.set('zero', 0)
      state.set('negative', -42)
      state.set('float', 3.14159)

      expect(state.get('zero')).toBe(0)
      expect(state.get('negative')).toBe(-42)
      expect(state.get('float')).toBeCloseTo(3.14159)
    })
  })

  describe('getAll', () => {
    test('returns all state as object', () => {
      const state = createState()
      state.set('key1', 'value1')
      state.set('key2', 42)
      state.set('key3', { nested: true })

      const all = state.getAll()

      expect(all).toEqual({
        key1: 'value1',
        key2: 42,
        key3: { nested: true }
      })
    })

    test('returns empty object when no state', () => {
      const state = createState()
      expect(state.getAll()).toEqual({})
    })
  })

  describe('history', () => {
    test('returns transitions for specific key', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      state.set('counter', 1)
      state.set('counter', 2)
      state.set('counter', 3)
      state.set('other', 'value')

      const history = state.history('counter')

      expect(history).toHaveLength(3)
      // History contains all transitions - order may depend on SQLite timestamp resolution
      const values = history.map(h => JSON.parse(h.new_value))
      expect(values).toContain(1)
      expect(values).toContain(2)
      expect(values).toContain(3)
    })

    test('returns all transitions without key filter', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      state.set('a', 1)
      state.set('b', 2)
      state.set('c', 3)

      const history = state.history()
      expect(history).toHaveLength(3)
    })

    test('respects limit parameter', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      for (let i = 0; i < 10; i++) {
        state.set('counter', i)
      }

      const history = state.history('counter', 5)
      expect(history).toHaveLength(5)
    })

    test('defaults to limit of 100', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      for (let i = 0; i < 150; i++) {
        state.set('counter', i)
      }

      const history = state.history('counter')
      expect(history).toHaveLength(100)
    })
  })

  describe('reset', () => {
    test('clears all state', () => {
      const state = createState()
      state.set('key1', 'value1')
      state.set('key2', 'value2')
      state.set('key3', 'value3')

      state.reset()

      // Custom keys should be gone
      expect(state.get('key1')).toBeNull()
      expect(state.get('key2')).toBeNull()
      expect(state.get('key3')).toBeNull()
    })

    test('inserts default values', () => {
      const state = createState()
      state.set('custom', 'value')

      state.reset()

      // Default values are inserted
      expect(state.get('phase')).toBe('initial')
      expect(state.get('ralphCount')).toBe(0)
      expect(state.get('data')).toBeNull()
    })
  })

  describe('set with undefined value', () => {
    test('throws on raw undefined (JSON.stringify returns undefined, violates NOT NULL)', () => {
      const state = createState()
      // JSON.stringify(undefined) returns undefined (not a string), so DB NOT NULL fails
      expect(() => state.set('undefinedKey', undefined)).toThrow()
    })

    test('object with undefined property omits that property', () => {
      const state = createState()
      const obj = { a: 1, b: undefined, c: 3 }
      state.set('objWithUndefined', obj)

      const retrieved = state.get<{ a: number; b?: number; c: number }>('objWithUndefined')
      expect(retrieved).toEqual({ a: 1, c: 3 })
      expect(retrieved).not.toHaveProperty('b')
    })
  })

  describe('special characters in keys', () => {
    test('handles keys with spaces', () => {
      const state = createState()
      state.set('key with spaces', 'value')
      expect(state.get('key with spaces')).toBe('value')
    })

    test('handles keys with special SQL characters', () => {
      const state = createState()
      state.set("key'with\"quotes", 'value1')
      state.set('key;with;semicolons', 'value2')
      state.set('key--comment', 'value3')

      expect(state.get("key'with\"quotes")).toBe('value1')
      expect(state.get('key;with;semicolons')).toBe('value2')
      expect(state.get('key--comment')).toBe('value3')
    })

    test('handles keys with unicode', () => {
      const state = createState()
      state.set('键', '值')
      state.set('キー', '値')
      state.set('مفتاح', 'قيمة')

      expect(state.get('键')).toBe('值')
      expect(state.get('キー')).toBe('値')
      expect(state.get('مفتاح')).toBe('قيمة')
    })

    test('handles keys with emojis', () => {
      const state = createState()
      state.set('🔑', '🔓')
      expect(state.get('🔑')).toBe('🔓')
    })

    test('handles keys with newlines and tabs', () => {
      const state = createState()
      state.set('key\nwith\nnewlines', 'value1')
      state.set('key\twith\ttabs', 'value2')

      expect(state.get('key\nwith\nnewlines')).toBe('value1')
      expect(state.get('key\twith\ttabs')).toBe('value2')
    })
  })

  describe('key boundary conditions', () => {
    test('handles empty string key', () => {
      const state = createState()
      state.set('', 'empty key value')
      expect(state.get('')).toBe('empty key value')
    })

    test('handles very long key', () => {
      const state = createState()
      const longKey = 'k'.repeat(10000)
      state.set(longKey, 'value for long key')
      expect(state.get(longKey)).toBe('value for long key')
    })

    test('distinguishes similar keys', () => {
      const state = createState()
      state.set('key', 'value1')
      state.set('key ', 'value2')
      state.set(' key', 'value3')
      state.set('KEY', 'value4')

      expect(state.get('key')).toBe('value1')
      expect(state.get('key ')).toBe('value2')
      expect(state.get(' key')).toBe('value3')
      expect(state.get('KEY')).toBe('value4')
    })
  })

  describe('JSON edge cases', () => {
    test('handles Infinity (becomes null)', () => {
      const state = createState()
      state.set('infinity', Infinity)
      // JSON.stringify(Infinity) returns 'null'
      expect(state.get('infinity')).toBeNull()
    })

    test('handles NaN (becomes null)', () => {
      const state = createState()
      state.set('nan', NaN)
      // JSON.stringify(NaN) returns 'null'
      expect(state.get('nan')).toBeNull()
    })

    test('handles Date objects (becomes string)', () => {
      const state = createState()
      const date = new Date('2024-01-15T12:00:00Z')
      state.set('date', date)
      expect(state.get('date')).toBe('2024-01-15T12:00:00.000Z')
    })

    test('handles empty string value', () => {
      const state = createState()
      state.set('emptyString', '')
      expect(state.get('emptyString')).toBe('')
    })

    test('handles empty object', () => {
      const state = createState()
      state.set('emptyObj', {})
      expect(state.get('emptyObj')).toEqual({})
    })

    test('handles empty array', () => {
      const state = createState()
      state.set('emptyArr', [])
      expect(state.get('emptyArr')).toEqual([])
    })

    test('handles sparse array', () => {
      const state = createState()
      const sparse = [1, , , 4] // eslint-disable-line no-sparse-arrays
      state.set('sparse', sparse)
      // JSON converts holes to null
      expect(state.get('sparse')).toEqual([1, null, null, 4])
    })

    test('handles BigInt throws error', () => {
      const state = createState()
      expect(() => state.set('bigint', BigInt(9007199254740991))).toThrow()
    })

    test('handles circular reference throws error', () => {
      const state = createState()
      const circular: any = { a: 1 }
      circular.self = circular
      expect(() => state.set('circular', circular)).toThrow()
    })
  })

  describe('closed database behavior', () => {
    test('get returns null when db is closed', () => {
      const state = createState()
      state.set('key', 'value')
      db.close()

      expect(state.get('key')).toBeNull()
    })

    test('set is no-op when db is closed', () => {
      const state = createState()
      db.close()

      // Should not throw
      expect(() => state.set('key', 'value')).not.toThrow()
    })

    test('getAll returns empty object when db is closed', () => {
      const state = createState()
      state.set('key', 'value')
      db.close()

      expect(state.getAll()).toEqual({})
    })

    test('reset is no-op when db is closed', () => {
      const state = createState()
      db.close()

      expect(() => state.reset()).not.toThrow()
    })

    test('history returns empty array when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      state.set('key', 'value')
      db.close()

      expect(state.history()).toEqual([])
      expect(state.history('key')).toEqual([])
    })

    test('setMany is no-op when db is closed', () => {
      const state = createState()
      db.close()

      expect(() => state.setMany({ a: 1, b: 2 })).not.toThrow()
    })
  })

  describe('history edge cases', () => {
    test('returns empty array when no transitions exist', () => {
      const state = createState()
      expect(state.history()).toEqual([])
      expect(state.history('nonexistent')).toEqual([])
    })

    test('history works without execution context (no transitions logged)', () => {
      currentExecutionId = null
      const state = createState()
      state.set('key', 'value')

      // No transitions logged since no execution context
      expect(state.history('key')).toEqual([])
    })

    test('history with limit 0 returns empty', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      state.set('key', 'value')

      expect(state.history('key', 0)).toEqual([])
    })

    test('history preserves trigger null vs string', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      state.set('key1', 'value1') // no trigger
      state.set('key2', 'value2', 'explicit_trigger')

      const h1 = state.history('key1')
      const h2 = state.history('key2')

      expect(h1[0].trigger).toBeNull()
      expect(h2[0].trigger).toBe('explicit_trigger')
    })
  })

  describe('concurrent operations', () => {
    test('multiple rapid sets on same key preserve final value', () => {
      const state = createState()

      for (let i = 0; i < 100; i++) {
        state.set('counter', i)
      }

      expect(state.get('counter')).toBe(99)
    })

    test('setMany is atomic within single call', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const state = createState()
      state.setMany({
        step: 1,
        status: 'running',
        data: { items: [1, 2, 3] }
      })

      // All values should be set
      expect(state.get('step')).toBe(1)
      expect(state.get('status')).toBe('running')
      expect(state.get('data')).toEqual({ items: [1, 2, 3] })

      // All transitions should be logged
      const transitions = state.history()
      expect(transitions).toHaveLength(3)
    })
  })

  describe('type preservation', () => {
    test('preserves number 0 vs string "0"', () => {
      const state = createState()
      state.set('numZero', 0)
      state.set('strZero', '0')

      expect(state.get('numZero')).toBe(0)
      expect(state.get('numZero')).not.toBe('0')
      expect(state.get('strZero')).toBe('0')
      expect(state.get('strZero')).not.toBe(0)
    })

    test('preserves empty string vs null', () => {
      const state = createState()
      state.set('empty', '')
      state.set('nullVal', null)

      expect(state.get('empty')).toBe('')
      expect(state.get('nullVal')).toBeNull()
      expect(state.get('empty')).not.toBeNull()
    })

    test('preserves false vs null vs 0', () => {
      const state = createState()
      state.set('false', false)
      state.set('null', null)
      state.set('zero', 0)

      expect(state.get('false')).toBe(false)
      expect(state.get('null')).toBeNull()
      expect(state.get('zero')).toBe(0)
    })
  })
})
