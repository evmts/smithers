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

  describe('basic query operations', () => {
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
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'foo', 10])
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['2', 'bar', 20])
      
      const query = createQuery()
      const results = query<{ name: string }>('SELECT name FROM test_table WHERE value > ?', [15])
      
      expect(results).toEqual([{ name: 'bar' }])
    })

    test('query without params (undefined)', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 1])
      const query = createQuery()
      
      const results = query('SELECT COUNT(*) as count FROM test_table', undefined)
      expect(results[0]).toEqual({ count: 1 })
    })

    test('query without params (empty array)', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 1])
      const query = createQuery()
      
      const results = query('SELECT COUNT(*) as count FROM test_table', [])
      expect(results[0]).toEqual({ count: 1 })
    })
  })

  describe('type inference', () => {
    test('query returns typed objects', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'typed', 100])
      const query = createQuery()
      
      interface TestRow {
        id: string
        name: string
        value: number
      }
      
      const results = query<TestRow>('SELECT * FROM test_table WHERE id = ?', ['1'])
      const row = results[0]
      
      expect(row.id).toBe('1')
      expect(row.name).toBe('typed')
      expect(row.value).toBe(100)
    })
  })

  describe('error cases', () => {
    test('query with invalid SQL throws', () => {
      const query = createQuery()
      expect(() => query('INVALID SQL STATEMENT')).toThrow()
    })

    test('query with syntax error throws', () => {
      const query = createQuery()
      expect(() => query('SELECT * FORM test_table')).toThrow()
    })

    test('query on non-existent table throws', () => {
      const query = createQuery()
      expect(() => query('SELECT * FROM nonexistent_table')).toThrow()
    })
  })

  describe('parameter handling', () => {
    test('query with null parameter', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', null, 1])
      const query = createQuery()
      
      const results = query('SELECT * FROM test_table WHERE name IS ?', [null])
      expect(results).toHaveLength(1)
    })

    test('query with numeric parameters', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'test', 50])
      const query = createQuery()
      
      const results = query('SELECT * FROM test_table WHERE value BETWEEN ? AND ?', [40, 60])
      expect(results).toHaveLength(1)
    })

    test('query with string parameters', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'hello', 1])
      const query = createQuery()
      
      const results = query('SELECT * FROM test_table WHERE name = ?', ['hello'])
      expect(results).toHaveLength(1)
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
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'safe', 1])
      const query = createQuery()
      
      const maliciousInput = "'; DROP TABLE test_table; --"
      const results = query('SELECT * FROM test_table WHERE name = ?', [maliciousInput])
      
      expect(results).toEqual([])
      const tableExists = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'")
      expect(tableExists).toHaveLength(1)
    })
  })

  describe('unicode and special characters', () => {
    test('query with unicode in params', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', '你好世界', 1])
      const query = createQuery()
      
      const results = query('SELECT * FROM test_table WHERE name = ?', ['你好世界'])
      expect(results).toHaveLength(1)
    })

    test('query returns unicode data correctly', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', '🎉 emoji test 🚀', 1])
      const query = createQuery()
      
      const results = query<{ name: string }>('SELECT name FROM test_table WHERE id = ?', ['1'])
      expect(results[0].name).toBe('🎉 emoji test 🚀')
    })
  })

  describe('edge cases', () => {
    test('query with empty result set', () => {
      const query = createQuery()
      const results = query('SELECT * FROM test_table WHERE 1 = 0')
      expect(results).toEqual([])
    })

    test('query with single result', () => {
      db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', ['1', 'single', 1])
      const query = createQuery()
      
      const results = query('SELECT * FROM test_table')
      expect(results).toHaveLength(1)
    })

    test('query with many results', () => {
      for (let i = 0; i < 100; i++) {
        db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', [`id-${i}`, `name-${i}`, i])
      }
      const query = createQuery()
      
      const results = query('SELECT * FROM test_table')
      expect(results).toHaveLength(100)
    })

    test('query with many parameters', () => {
      for (let i = 0; i < 10; i++) {
        db.run('INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)', [`id-${i}`, `name-${i}`, i])
      }
      const query = createQuery()
      
      const placeholders = Array(5).fill('?').join(', ')
      const results = query(`SELECT * FROM test_table WHERE id IN (${placeholders})`, 
        ['id-0', 'id-2', 'id-4', 'id-6', 'id-8'])
      expect(results).toHaveLength(5)
    })
  })
})
