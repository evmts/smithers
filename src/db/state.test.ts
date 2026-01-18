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
})
