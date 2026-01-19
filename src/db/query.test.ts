/**
 * Tests for query module - raw query access
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createQueryModule } from './query.js'

describe('QueryModule', () => {
  let db: ReactiveDatabase

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_table (
        id TEXT PRIMARY KEY,
        name TEXT,
        value INTEGER
      );
    `)
  }

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    setupSchema()
  })

  afterEach(() => {
    db.close()
  })

  const createQuery = () => {
    return createQueryModule({ rdb: db })
  }

  describe('Basic query operations', () => {
    test('query returns results for valid SQL', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 42])
      const query = createQuery()
      
      const results = query<{ id: string; name: string; value: number }>('SELECT * FROM test_table')
      
      expect(results).toHaveLength(1)
      expect(results[0]).toEqual({ id: '1', name: 'test', value: 42 })
    })

    test('query returns empty array for no results', () => {
      const query = createQuery()
      const results = query('SELECT * FROM test_table')
      expect(results).toEqual([])
    })

    test('query with params substitution', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 42])
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['2', 'other', 99])
      const query = createQuery()
      const results = query<{ id: string }>('SELECT * FROM test_table WHERE name = ?', ['test'])
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('1')
    })

    test('query without params (undefined)', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 42])
      const query = createQuery()
      const results = query('SELECT * FROM test_table', undefined)
      expect(results).toHaveLength(1)
    })

    test('query without params (empty array)', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 42])
      const query = createQuery()
      const results = query('SELECT * FROM test_table', [])
      expect(results).toHaveLength(1)
    })
  })

  describe('Type inference', () => {
    test('query infers correct return type', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 42])
      const query = createQuery()
      const results = query<{ id: string; name: string; value: number }>('SELECT * FROM test_table')
      const first = results[0]
      expect(typeof first.id).toBe('string')
      expect(typeof first.name).toBe('string')
      expect(typeof first.value).toBe('number')
    })

    test('query returns typed objects', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 42])
      const query = createQuery()
      interface TestRow { id: string; name: string; value: number }
      const results = query<TestRow>('SELECT * FROM test_table')
      expect(results[0].id).toBe('1')
      expect(results[0].name).toBe('test')
      expect(results[0].value).toBe(42)
    })
  })

  describe('Error cases', () => {
    test('query with invalid SQL throws', () => {
      const query = createQuery()
      expect(() => query('SELEKT * FROM test_table')).toThrow()
    })

    test('query with syntax error throws', () => {
      const query = createQuery()
      expect(() => query('SELECT * FROM')).toThrow()
    })

    test('query on non-existent table throws', () => {
      const query = createQuery()
      expect(() => query('SELECT * FROM nonexistent_table')).toThrow()
    })

    test('query with wrong number of params throws', () => {
      const query = createQuery()
      expect(() => query('SELECT * FROM test_table WHERE id = ? AND name = ?', ['only-one'])).toThrow()
    })
  })

  describe('Parameter handling', () => {
    test('query with null parameter', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', null, 42])
      const query = createQuery()
      const results = query<{ name: string | null }>('SELECT * FROM test_table WHERE name IS NULL')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe(null)
    })

    test('query with numeric parameters', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 42])
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['2', 'test', 100])
      const query = createQuery()
      const results = query('SELECT * FROM test_table WHERE value > ?', [50])
      expect(results).toHaveLength(1)
    })

    test('query with string parameters', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'alice', 42])
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['2', 'bob', 99])
      const query = createQuery()
      const results = query<{ id: string }>('SELECT * FROM test_table WHERE name = ?', ['alice'])
      expect(results[0].id).toBe('1')
    })

    test('query with boolean parameters', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 1])
      const query = createQuery()
      
      const results = query('SELECT * FROM test_table WHERE value = ?', [true])
      expect(results).toHaveLength(1)
    })
  })

  describe('SQL injection prevention', () => {
    test('query is safe against SQL injection in params', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 42])
      const query = createQuery()
      const malicious = "'; DROP TABLE test_table; --"
      const results = query('SELECT * FROM test_table WHERE name = ?', [malicious])
      expect(results).toEqual([])
      const check = query('SELECT * FROM test_table')
      expect(check).toHaveLength(1)
    })
  })

  describe('Unicode and special characters', () => {
    test('query with unicode in params', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', '中文🚀', 42])
      const query = createQuery()
      const results = query<{ name: string }>('SELECT * FROM test_table WHERE name = ?', ['中文🚀'])
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('中文🚀')
    })

    test('query returns unicode data correctly', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'émojis: 🎉🔥', 42])
      const query = createQuery()
      const results = query<{ name: string }>('SELECT * FROM test_table')
      expect(results[0].name).toBe('émojis: 🎉🔥')
    })
  })

  describe('Edge cases', () => {
    test('query with very long SQL string', () => {
      const longName = 'x'.repeat(1000)
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', longName, 42])
      const query = createQuery()
      const results = query<{ name: string }>('SELECT * FROM test_table WHERE name = ?', [longName])
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe(longName)
    })

    test('query with many parameters', () => {
      for (let i = 0; i < 10; i++) {
        db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', [`${i}`, `name${i}`, i])
      }
      const query = createQuery()
      const ids = ['0', '2', '4', '6', '8']
      const placeholders = ids.map(() => '?').join(',')
      const results = query(`SELECT * FROM test_table WHERE id IN (${placeholders})`, ids)
      expect(results).toHaveLength(5)
    })

    test('query with empty result set', () => {
      const query = createQuery()
      const results = query('SELECT * FROM test_table WHERE id = ?', ['nonexistent'])
      expect(results).toEqual([])
    })

    test('query with single result', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 42])
      const query = createQuery()
      const results = query('SELECT * FROM test_table')
      expect(results).toHaveLength(1)
    })

    test('query with many results', () => {
      for (let i = 0; i < 100; i++) {
        db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', [`${i}`, `name${i}`, i])
      }
      const query = createQuery()
      const results = query('SELECT * FROM test_table')
      expect(results).toHaveLength(100)
    })
  })
})
