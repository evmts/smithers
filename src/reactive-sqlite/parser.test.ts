/**
 * Tests for SQL parser utilities
 */

import { describe, test, expect } from 'bun:test'
import {
  extractReadTables,
  extractWriteTables,
  isWriteOperation,
  extractAllTables,
  extractRowFilter,
} from './parser.js'

describe('extractReadTables', () => {
  test('extracts table from simple SELECT', () => {
    expect(extractReadTables('SELECT * FROM users')).toEqual(['users'])
  })

  test('extracts table with alias (FROM users AS u)', () => {
    expect(extractReadTables('SELECT u.name FROM users AS u')).toEqual(['users'])
  })

  test('extracts multiple tables from JOINs', () => {
    const sql = 'SELECT * FROM users JOIN posts ON users.id = posts.user_id'
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('posts')
  })

  test('extracts tables from LEFT JOIN', () => {
    const sql = 'SELECT * FROM users LEFT JOIN orders ON users.id = orders.user_id'
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('orders')
  })

  test('extracts tables from INNER JOIN', () => {
    const sql = 'SELECT * FROM users INNER JOIN profiles ON users.id = profiles.user_id'
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('profiles')
  })

  test('extracts tables from RIGHT JOIN', () => {
    const sql = 'SELECT * FROM users RIGHT JOIN departments ON users.dept_id = departments.id'
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('departments')
  })

  test('extracts tables from CROSS JOIN', () => {
    const sql = 'SELECT * FROM users CROSS JOIN roles'
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('roles')
  })

  test('extracts tables from multiple JOINs', () => {
    const sql = `
      SELECT * FROM users
      LEFT JOIN orders ON users.id = orders.user_id
      INNER JOIN products ON orders.product_id = products.id
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('orders')
    expect(tables).toContain('products')
  })

  test('ignores single-line comments (-- comment)', () => {
    const sql = `
      SELECT * FROM users -- this is a comment
      -- FROM ignored_table
      WHERE id = 1
    `
    expect(extractReadTables(sql)).toEqual(['users'])
  })

  test('ignores multi-line comments (/* ... */)', () => {
    const sql = `
      SELECT * FROM users
      /* FROM ignored_table
         JOIN another_ignored */
      WHERE id = 1
    `
    expect(extractReadTables(sql)).toEqual(['users'])
  })

  test('handles case insensitivity (FROM vs from vs FROM)', () => {
    expect(extractReadTables('select * FROM users')).toEqual(['users'])
    expect(extractReadTables('SELECT * from users')).toEqual(['users'])
    expect(extractReadTables('SELECT * From Users')).toEqual(['users'])
  })

  test('normalizes whitespace', () => {
    const sql = `SELECT    *    FROM    users    WHERE   id = 1`
    expect(extractReadTables(sql)).toEqual(['users'])
  })

  test('handles underscore in table names', () => {
    expect(extractReadTables('SELECT * FROM user_accounts')).toEqual(['user_accounts'])
  })

  test('handles numbers in table names', () => {
    expect(extractReadTables('SELECT * FROM users_v2')).toEqual(['users_v2'])
  })
})

describe('extractWriteTables', () => {
  test('extracts table from INSERT INTO', () => {
    expect(extractWriteTables('INSERT INTO users (name) VALUES (?)')).toEqual(['users'])
  })

  test('extracts table from INSERT OR REPLACE INTO', () => {
    expect(extractWriteTables('INSERT OR REPLACE INTO users (id, name) VALUES (?, ?)')).toEqual(['users'])
  })

  test('extracts table from INSERT OR IGNORE INTO', () => {
    expect(extractWriteTables('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)')).toEqual(['users'])
  })

  test('extracts table from UPDATE', () => {
    expect(extractWriteTables('UPDATE users SET name = ? WHERE id = ?')).toEqual(['users'])
  })

  test('extracts table from UPDATE with OR IGNORE', () => {
    expect(extractWriteTables('UPDATE OR IGNORE users SET name = ? WHERE id = ?')).toEqual(['users'])
  })

  test('extracts table from DELETE FROM', () => {
    expect(extractWriteTables('DELETE FROM users WHERE id = ?')).toEqual(['users'])
  })

  test('extracts table from CREATE TABLE', () => {
    expect(extractWriteTables('CREATE TABLE users (id INTEGER PRIMARY KEY)')).toEqual(['users'])
  })

  test('extracts table from CREATE TEMP TABLE', () => {
    expect(extractWriteTables('CREATE TEMP TABLE temp_users (id INTEGER)')).toEqual(['temp_users'])
  })

  test('extracts table from CREATE TEMPORARY TABLE', () => {
    expect(extractWriteTables('CREATE TEMPORARY TABLE temp_data (id INTEGER)')).toEqual(['temp_data'])
  })

  test('extracts table from CREATE TABLE IF NOT EXISTS', () => {
    expect(extractWriteTables('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY)')).toEqual(['users'])
  })

  test('extracts table from DROP TABLE', () => {
    expect(extractWriteTables('DROP TABLE users')).toEqual(['users'])
  })

  test('extracts table from DROP TABLE IF EXISTS', () => {
    expect(extractWriteTables('DROP TABLE IF EXISTS users')).toEqual(['users'])
  })

  test('extracts table from ALTER TABLE', () => {
    expect(extractWriteTables('ALTER TABLE users ADD COLUMN email TEXT')).toEqual(['users'])
  })

  test('handles case insensitivity', () => {
    expect(extractWriteTables('insert into users (name) values (?)')).toEqual(['users'])
    expect(extractWriteTables('DELETE from Users WHERE id = ?')).toEqual(['users'])
  })

  test('ignores comments', () => {
    const sql = `
      INSERT INTO users (name) VALUES (?)
      -- DELETE FROM ignored_table
    `
    expect(extractWriteTables(sql)).toEqual(['users'])
  })
})

describe('isWriteOperation', () => {
  test('returns true for INSERT', () => {
    expect(isWriteOperation('INSERT INTO users (name) VALUES (?)')).toBe(true)
  })

  test('returns true for UPDATE', () => {
    expect(isWriteOperation('UPDATE users SET name = ?')).toBe(true)
  })

  test('returns true for DELETE', () => {
    expect(isWriteOperation('DELETE FROM users WHERE id = ?')).toBe(true)
  })

  test('returns true for CREATE', () => {
    expect(isWriteOperation('CREATE TABLE users (id INTEGER)')).toBe(true)
  })

  test('returns true for DROP', () => {
    expect(isWriteOperation('DROP TABLE users')).toBe(true)
  })

  test('returns true for ALTER', () => {
    expect(isWriteOperation('ALTER TABLE users ADD COLUMN email TEXT')).toBe(true)
  })

  test('returns true for REPLACE', () => {
    expect(isWriteOperation('REPLACE INTO users (id, name) VALUES (?, ?)')).toBe(true)
  })

  test('returns false for SELECT', () => {
    expect(isWriteOperation('SELECT * FROM users')).toBe(false)
  })

  test('handles leading whitespace', () => {
    expect(isWriteOperation('  INSERT INTO users (name) VALUES (?)')).toBe(true)
    expect(isWriteOperation('\n\tUPDATE users SET name = ?')).toBe(true)
  })

  test('handles case insensitivity', () => {
    expect(isWriteOperation('insert INTO users (name) VALUES (?)')).toBe(true)
    expect(isWriteOperation('Update users SET name = ?')).toBe(true)
  })
})

describe('extractAllTables', () => {
  test('extracts both read and write tables', () => {
    const result = extractAllTables('INSERT INTO logs SELECT * FROM events')
    expect(result.write).toEqual(['logs'])
    expect(result.read).toContain('events')
  })

  test('returns empty arrays for simple queries', () => {
    const readResult = extractAllTables('SELECT * FROM users')
    expect(readResult.read).toEqual(['users'])
    expect(readResult.write).toEqual([])

    const writeResult = extractAllTables('INSERT INTO users (name) VALUES (?)')
    expect(writeResult.write).toEqual(['users'])
  })
})

describe('extractRowFilter', () => {
  test('extracts filter from simple WHERE id = ?', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ?', [42])
    expect(result).toEqual({ table: 'users', column: 'id', value: 42 })
  })

  test('extracts filter from WHERE id = numeric literal', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = 123', [])
    expect(result).toEqual({ table: 'users', column: 'id', value: 123 })
  })

  test('extracts filter from WHERE id = string literal', () => {
    const result = extractRowFilter("SELECT * FROM users WHERE id = 'abc'", [])
    expect(result).toEqual({ table: 'users', column: 'id', value: 'abc' })
  })

  test('extracts filter from WHERE id = double-quoted string literal', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = "test"', [])
    expect(result).toEqual({ table: 'users', column: 'id', value: 'test' })
  })

  test('takes first condition from AND conditions', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ? AND name = ?', [1, 'Alice'])
    expect(result).toEqual({ table: 'users', column: 'id', value: 1 })
  })

  test('returns null for OR conditions', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ? OR name = ?', [1, 'Alice'])
    expect(result).toBeNull()
  })

  test('returns null for IN subqueries', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id IN (SELECT user_id FROM admins)', [])
    expect(result).toBeNull()
  })

  test('returns null for EXISTS subqueries', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE EXISTS (SELECT 1 FROM admins WHERE admins.user_id = users.id)', [])
    expect(result).toBeNull()
  })

  test('returns null for LIKE conditions', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE name LIKE ?', ['%John%'])
    expect(result).toBeNull()
  })

  test('returns null for range operators (<)', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE age < ?', [18])
    expect(result).toBeNull()
  })

  test('returns null for range operators (>)', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE age > ?', [65])
    expect(result).toBeNull()
  })

  test('returns null for range operators (<=)', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE age <= ?', [18])
    expect(result).toBeNull()
  })

  test('returns null for range operators (>=)', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE age >= ?', [65])
    expect(result).toBeNull()
  })

  test('returns null for <> operator', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE status <> ?', ['inactive'])
    expect(result).toBeNull()
  })

  test('handles quoted identifiers ("column_name")', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE "user_id" = ?', [42])
    expect(result).toEqual({ table: 'users', column: 'user_id', value: 42 })
  })

  test('tracks parameter index with multiple ? before WHERE', () => {
    // SET clause has two params, so WHERE param is index 2
    const result = extractRowFilter('UPDATE users SET name = ?, email = ? WHERE id = ?', ['Alice', 'alice@example.com', 42])
    expect(result).toEqual({ table: 'users', column: 'id', value: 42 })
  })

  test('extracts filter from UPDATE ... WHERE', () => {
    const result = extractRowFilter('UPDATE users SET name = ? WHERE id = ?', ['Bob', 5])
    expect(result).toEqual({ table: 'users', column: 'id', value: 5 })
  })

  test('extracts filter from DELETE FROM ... WHERE', () => {
    const result = extractRowFilter('DELETE FROM users WHERE id = ?', [10])
    expect(result).toEqual({ table: 'users', column: 'id', value: 10 })
  })

  test('returns null for no WHERE clause', () => {
    const result = extractRowFilter('SELECT * FROM users', [])
    expect(result).toBeNull()
  })

  test('returns null for INSERT statements', () => {
    const result = extractRowFilter('INSERT INTO users (name) VALUES (?)', ['Alice'])
    expect(result).toBeNull()
  })

  test('ignores comments', () => {
    const sql = `
      SELECT * FROM users
      -- WHERE comment = 'ignored'
      WHERE id = ?
    `
    const result = extractRowFilter(sql, [42])
    expect(result).toEqual({ table: 'users', column: 'id', value: 42 })
  })

  test('handles multi-line comments', () => {
    const sql = `
      SELECT * FROM users
      /* WHERE old_column = 1 */
      WHERE id = ?
    `
    const result = extractRowFilter(sql, [100])
    expect(result).toEqual({ table: 'users', column: 'id', value: 100 })
  })

  test('returns null when param index exceeds params length', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ?', [])
    expect(result).toBeNull()
  })

  test('handles quoted table names in UPDATE', () => {
    const result = extractRowFilter('UPDATE "user_data" SET name = ? WHERE id = ?', ['Bob', 1])
    expect(result).toEqual({ table: 'user_data', column: 'id', value: 1 })
  })

  test('handles quoted table names in DELETE', () => {
    const result = extractRowFilter('DELETE FROM "my_table" WHERE id = ?', [1])
    expect(result).toEqual({ table: 'my_table', column: 'id', value: 1 })
  })

  test('handles WHERE clause with ORDER BY suffix', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ? ORDER BY name', [5])
    expect(result).toEqual({ table: 'users', column: 'id', value: 5 })
  })

  test('handles WHERE clause with LIMIT suffix', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ? LIMIT 10', [5])
    expect(result).toEqual({ table: 'users', column: 'id', value: 5 })
  })

  test('handles WHERE clause with GROUP BY suffix', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ? GROUP BY status', [5])
    expect(result).toEqual({ table: 'users', column: 'id', value: 5 })
  })
})
