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

  test('extracts table from quoted SELECT', () => {
    expect(extractReadTables('SELECT * FROM "users"')).toEqual(['users'])
  })

  test('extracts table from schema-qualified SELECT', () => {
    expect(extractReadTables('SELECT * FROM main.users')).toEqual(['users'])
  })

  test('extracts table from quoted schema-qualified SELECT', () => {
    expect(extractReadTables('SELECT * FROM "main"."users"')).toEqual(['users'])
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

  // === NESTED SUBQUERIES ===
  test('extracts tables from nested subquery in FROM clause', () => {
    const sql = 'SELECT * FROM (SELECT * FROM inner_table) AS sub'
    const tables = extractReadTables(sql)
    expect(tables).toContain('inner_table')
  })

  test('extracts tables from deeply nested subqueries', () => {
    const sql = `
      SELECT * FROM (
        SELECT * FROM (
          SELECT * FROM deepest_table
        ) AS inner_sub
      ) AS outer_sub
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('deepest_table')
  })

  test('extracts tables from subquery with JOIN', () => {
    const sql = `
      SELECT * FROM (
        SELECT * FROM table_a JOIN table_b ON table_a.id = table_b.a_id
      ) AS combined
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('table_a')
    expect(tables).toContain('table_b')
  })

  // === CTE (WITH clause) ===
  test('extracts tables from CTE (WITH clause)', () => {
    const sql = `
      WITH cte AS (SELECT * FROM source_table)
      SELECT * FROM cte JOIN other_table ON cte.id = other_table.cte_id
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('source_table')
    expect(tables).toContain('cte')
    expect(tables).toContain('other_table')
  })

  test('extracts tables from multiple CTEs', () => {
    const sql = `
      WITH
        cte1 AS (SELECT * FROM table1),
        cte2 AS (SELECT * FROM table2)
      SELECT * FROM cte1 JOIN cte2 ON cte1.id = cte2.id
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('table1')
    expect(tables).toContain('table2')
    expect(tables).toContain('cte1')
    expect(tables).toContain('cte2')
  })

  test('extracts tables from recursive CTE', () => {
    const sql = `
      WITH RECURSIVE ancestors AS (
        SELECT * FROM nodes WHERE parent_id IS NULL
        UNION ALL
        SELECT n.* FROM nodes n JOIN ancestors a ON n.parent_id = a.id
      )
      SELECT * FROM ancestors
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('nodes')
    expect(tables).toContain('ancestors')
  })

  // === UNION/INTERSECT/EXCEPT ===
  test('extracts tables from UNION query', () => {
    const sql = 'SELECT * FROM users UNION SELECT * FROM admins'
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('admins')
  })

  test('extracts tables from UNION ALL query', () => {
    const sql = 'SELECT * FROM active_users UNION ALL SELECT * FROM inactive_users'
    const tables = extractReadTables(sql)
    expect(tables).toContain('active_users')
    expect(tables).toContain('inactive_users')
  })

  test('extracts tables from INTERSECT query', () => {
    const sql = 'SELECT id FROM users INTERSECT SELECT id FROM verified_users'
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('verified_users')
  })

  test('extracts tables from EXCEPT query', () => {
    const sql = 'SELECT id FROM all_users EXCEPT SELECT id FROM banned_users'
    const tables = extractReadTables(sql)
    expect(tables).toContain('all_users')
    expect(tables).toContain('banned_users')
  })

  test('extracts tables from multiple UNION queries', () => {
    const sql = `
      SELECT * FROM table1
      UNION
      SELECT * FROM table2
      UNION
      SELECT * FROM table3
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('table1')
    expect(tables).toContain('table2')
    expect(tables).toContain('table3')
  })

  // === TABLE-VALUED FUNCTIONS ===
  test('extracts tables when used with json_each (table-valued function)', () => {
    const sql = `
      SELECT value FROM users, json_each(users.tags)
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    // json_each is not a table, shouldn't be extracted
  })

  test('extracts table from json_tree usage', () => {
    const sql = 'SELECT * FROM documents, json_tree(documents.data)'
    const tables = extractReadTables(sql)
    expect(tables).toContain('documents')
  })

  // === SELF-JOINS ===
  test('handles self-join (same table multiple times)', () => {
    const sql = `
      SELECT e.name, m.name AS manager
      FROM employees e
      JOIN employees m ON e.manager_id = m.id
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('employees')
    // Should only appear once in the result
    expect(tables.filter(t => t === 'employees').length).toBe(1)
  })

  // === NATURAL JOIN ===
  test('extracts tables from NATURAL JOIN', () => {
    const sql = 'SELECT * FROM users NATURAL JOIN profiles'
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('profiles')
  })

  test('extracts tables from NATURAL LEFT JOIN', () => {
    const sql = 'SELECT * FROM orders NATURAL LEFT JOIN customers'
    const tables = extractReadTables(sql)
    expect(tables).toContain('orders')
    expect(tables).toContain('customers')
  })

  // === SUBQUERIES IN WHERE ===
  test('extracts tables from subquery in WHERE clause', () => {
    const sql = `
      SELECT * FROM users
      WHERE id IN (SELECT user_id FROM active_sessions)
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('active_sessions')
  })

  test('extracts tables from EXISTS subquery in WHERE', () => {
    const sql = `
      SELECT * FROM orders
      WHERE EXISTS (SELECT 1 FROM order_items WHERE order_items.order_id = orders.id)
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('orders')
    expect(tables).toContain('order_items')
  })

  test('extracts tables from scalar subquery in WHERE', () => {
    const sql = `
      SELECT * FROM products
      WHERE price > (SELECT AVG(price) FROM products)
    `
    const tables = extractReadTables(sql)
    expect(tables).toContain('products')
  })

  // === SCHEMA-QUALIFIED TABLE NAMES ===
  test('extracts table from schema-qualified name (main.users)', () => {
    const sql = 'SELECT * FROM main.users'
    const tables = extractReadTables(sql)
    expect(tables).toContain('users')
  })

  test('handles schema-qualified join', () => {
    const sql = 'SELECT * FROM schema1.table1 JOIN schema2.table2 ON schema1.table1.id = schema2.table2.id'
    const tables = extractReadTables(sql)
    expect(tables).toContain('table1')
    expect(tables).toContain('table2')
  })

  // === QUOTED IDENTIFIERS ===
  test('handles backtick quoted table names', () => {
    const sql = 'SELECT * FROM `my-table`'
    const tables = extractReadTables(sql)
    expect(tables).toEqual(['my-table'])
  })

  test('handles bracket quoted table names', () => {
    // SQL Server style brackets
    const sql = 'SELECT * FROM [my table]'
    const tables = extractReadTables(sql)
    expect(tables).toEqual(['my table'])
  })

  test('handles double-quoted table names', () => {
    // Double quotes in SQL are for identifiers
    const sql = 'SELECT * FROM "reserved_word_table"'
    const tables = extractReadTables(sql)
    expect(tables).toEqual(['reserved_word_table'])
  })

  // === EDGE CASES ===
  test('handles empty string', () => {
    expect(extractReadTables('')).toEqual([])
  })

  test('handles whitespace only', () => {
    expect(extractReadTables('   \n\t  ')).toEqual([])
  })

  test('handles FROM in string literal (should not extract)', () => {
    // Note: Current simple regex may incorrectly extract this
    const sql = "SELECT 'FROM fake_table' AS text FROM real_table"
    const tables = extractReadTables(sql)
    expect(tables).toContain('real_table')
    // May also incorrectly contain 'fake_table' due to simple regex
  })

  test('handles newlines and tabs', () => {
    const sql = "SELECT *\n\tFROM\n\t\tusers\n\tWHERE id = 1"
    expect(extractReadTables(sql)).toEqual(['users'])
  })

  test('extracts from LEFT OUTER JOIN', () => {
    const sql = 'SELECT * FROM a LEFT OUTER JOIN b ON a.id = b.a_id'
    const tables = extractReadTables(sql)
    expect(tables).toContain('a')
    expect(tables).toContain('b')
  })

  test('extracts from FULL OUTER JOIN', () => {
    const sql = 'SELECT * FROM a FULL OUTER JOIN b ON a.id = b.a_id'
    const tables = extractReadTables(sql)
    expect(tables).toContain('a')
    expect(tables).toContain('b')
  })
})

describe('extractWriteTables', () => {
  test('extracts table from INSERT INTO', () => {
    expect(extractWriteTables('INSERT INTO users (name) VALUES (?)')).toEqual(['users'])
  })

  test('extracts table from INSERT OR REPLACE INTO', () => {
    expect(extractWriteTables('INSERT OR REPLACE INTO users (id, name) VALUES (?, ?)')).toEqual(['users'])
  })

  test('extracts table from REPLACE INTO', () => {
    expect(extractWriteTables('REPLACE INTO users (id, name) VALUES (?, ?)')).toEqual(['users'])
  })

  test('extracts table from quoted INSERT', () => {
    expect(extractWriteTables('INSERT INTO "users" (name) VALUES (?)')).toEqual(['users'])
  })

  test('extracts table from schema-qualified UPDATE', () => {
    expect(extractWriteTables('UPDATE main.users SET name = ?')).toEqual(['users'])
  })

  test('extracts table from quoted schema-qualified DELETE', () => {
    expect(extractWriteTables('DELETE FROM "main"."users" WHERE id = ?')).toEqual(['users'])
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

  test('extracts table from quoted CREATE TABLE', () => {
    expect(extractWriteTables('CREATE TABLE "users" (id INTEGER PRIMARY KEY)')).toEqual(['users'])
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

  // === UPSERT (ON CONFLICT DO UPDATE) ===
  test('extracts table from UPSERT (ON CONFLICT DO UPDATE)', () => {
    const sql = `
      INSERT INTO users (id, name) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name
    `
    const tables = extractWriteTables(sql)
    expect(tables).toContain('users')
    // Note: current implementation may also extract 'set' due to regex matching "update set"
    // This documents the current behavior
  })

  test('extracts table from INSERT ... ON CONFLICT DO NOTHING', () => {
    const sql = 'INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT DO NOTHING'
    expect(extractWriteTables(sql)).toEqual(['users'])
  })

  // === INSERT WITH SUBQUERY ===
  test('extracts both tables from INSERT ... SELECT', () => {
    const sql = 'INSERT INTO archive_users SELECT * FROM users WHERE active = 0'
    const tables = extractWriteTables(sql)
    expect(tables).toContain('archive_users')
    // Note: extractWriteTables focuses on write targets; source tables come from extractReadTables
  })

  test('extracts table from INSERT with complex subquery', () => {
    const sql = `
      INSERT INTO summary (user_id, total)
      SELECT user_id, SUM(amount) FROM orders GROUP BY user_id
    `
    expect(extractWriteTables(sql)).toContain('summary')
  })

  // === UPDATE WITH FROM CLAUSE ===
  test('handles UPDATE with FROM clause (SQLite extension)', () => {
    // SQLite UPDATE FROM syntax
    const sql = `
      UPDATE users SET balance = users.balance + t.amount
      FROM transactions t WHERE users.id = t.user_id
    `
    const tables = extractWriteTables(sql)
    expect(tables).toContain('users')
    // FROM clause in UPDATE is for reading, not writing
  })

  // === RETURNING CLAUSE ===
  test('extracts table from INSERT with RETURNING', () => {
    const sql = 'INSERT INTO users (name) VALUES (?) RETURNING id, name'
    expect(extractWriteTables(sql)).toEqual(['users'])
  })

  test('extracts table from UPDATE with RETURNING', () => {
    const sql = 'UPDATE users SET name = ? WHERE id = ? RETURNING *'
    expect(extractWriteTables(sql)).toEqual(['users'])
  })

  test('extracts table from DELETE with RETURNING', () => {
    const sql = 'DELETE FROM users WHERE id = ? RETURNING id, name, email'
    expect(extractWriteTables(sql)).toEqual(['users'])
  })

  // === CREATE/DROP INDEX ===
  test('does not extract table from CREATE INDEX (current limitation)', () => {
    // CREATE INDEX doesn't modify table data directly
    const sql = 'CREATE INDEX idx_users_name ON users(name)'
    const tables = extractWriteTables(sql)
    // Current implementation doesn't extract index-related tables
    expect(tables).toEqual([])
  })

  test('does not extract table from CREATE UNIQUE INDEX', () => {
    const sql = 'CREATE UNIQUE INDEX idx_users_email ON users(email)'
    const tables = extractWriteTables(sql)
    expect(tables).toEqual([])
  })

  test('does not extract table from DROP INDEX', () => {
    const sql = 'DROP INDEX idx_users_name'
    const tables = extractWriteTables(sql)
    expect(tables).toEqual([])
  })

  test('does not extract table from DROP INDEX IF EXISTS', () => {
    const sql = 'DROP INDEX IF EXISTS idx_users_name'
    const tables = extractWriteTables(sql)
    expect(tables).toEqual([])
  })

  // === MULTIPLE SEMICOLON-SEPARATED STATEMENTS ===
  test('extracts tables from multiple INSERT statements', () => {
    const sql = `
      INSERT INTO users (name) VALUES ('Alice');
      INSERT INTO logs (action) VALUES ('user_created');
    `
    const tables = extractWriteTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('logs')
  })

  test('extracts tables from mixed DML statements', () => {
    const sql = `
      INSERT INTO users (name) VALUES ('Bob');
      UPDATE settings SET value = 'dark' WHERE key = 'theme';
      DELETE FROM sessions WHERE expired = 1;
    `
    const tables = extractWriteTables(sql)
    expect(tables).toContain('users')
    expect(tables).toContain('settings')
    expect(tables).toContain('sessions')
  })

  test('extracts tables from DDL and DML combined', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS temp_data (id INTEGER);
      INSERT INTO temp_data VALUES (1);
      DROP TABLE old_data;
    `
    const tables = extractWriteTables(sql)
    expect(tables).toContain('temp_data')
    expect(tables).toContain('old_data')
  })

  // === REPLACE INTO ===
  test('extracts table from REPLACE INTO', () => {
    expect(extractWriteTables('REPLACE INTO users (id, name) VALUES (1, "Bob")')).toEqual(['users'])
  })

  // === EDGE CASES ===
  test('handles empty string', () => {
    expect(extractWriteTables('')).toEqual([])
  })

  test('handles whitespace only', () => {
    expect(extractWriteTables('   \n\t  ')).toEqual([])
  })

  test('handles SELECT (no write tables)', () => {
    expect(extractWriteTables('SELECT * FROM users')).toEqual([])
  })

  test('handles INSERT OR ABORT INTO', () => {
    expect(extractWriteTables('INSERT OR ABORT INTO users (name) VALUES (?)')).toEqual(['users'])
  })

  test('handles INSERT OR ROLLBACK INTO', () => {
    expect(extractWriteTables('INSERT OR ROLLBACK INTO users (name) VALUES (?)')).toEqual(['users'])
  })

  test('handles INSERT OR FAIL INTO', () => {
    expect(extractWriteTables('INSERT OR FAIL INTO users (name) VALUES (?)')).toEqual(['users'])
  })

  test('handles UPDATE OR ABORT', () => {
    expect(extractWriteTables('UPDATE OR ABORT users SET name = ?')).toEqual(['users'])
  })

  test('handles UPDATE OR REPLACE', () => {
    expect(extractWriteTables('UPDATE OR REPLACE users SET name = ?')).toEqual(['users'])
  })

  test('handles UPDATE OR ROLLBACK', () => {
    expect(extractWriteTables('UPDATE OR ROLLBACK users SET name = ?')).toEqual(['users'])
  })

  test('handles UPDATE OR FAIL', () => {
    expect(extractWriteTables('UPDATE OR FAIL users SET name = ?')).toEqual(['users'])
  })

  test('handles ALTER TABLE RENAME', () => {
    expect(extractWriteTables('ALTER TABLE users RENAME TO customers')).toEqual(['users'])
  })

  test('handles ALTER TABLE RENAME COLUMN', () => {
    expect(extractWriteTables('ALTER TABLE users RENAME COLUMN name TO full_name')).toEqual(['users'])
  })

  test('handles ALTER TABLE DROP COLUMN', () => {
    expect(extractWriteTables('ALTER TABLE users DROP COLUMN old_field')).toEqual(['users'])
  })

  test('ignores multi-line comments', () => {
    const sql = `
      /* This is a comment
         INSERT INTO ignored_table */
      UPDATE users SET name = ?
    `
    expect(extractWriteTables(sql)).toEqual(['users'])
  })

  test('handles CREATE TABLE with complex schema', () => {
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `
    expect(extractWriteTables(sql)).toEqual(['users'])
  })

  test('handles CREATE TEMP TABLE IF NOT EXISTS', () => {
    expect(extractWriteTables('CREATE TEMP TABLE IF NOT EXISTS cache (key TEXT, value TEXT)')).toEqual(['cache'])
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

  // === WITH CLAUSE BEFORE DML ===
  test('returns false for WITH clause before SELECT (CTE is read)', () => {
    const sql = 'WITH cte AS (SELECT * FROM users) SELECT * FROM cte'
    // Current implementation checks startsWith, so WITH... returns false
    expect(isWriteOperation(sql)).toBe(false)
  })

  test('returns false for WITH clause before INSERT (current limitation)', () => {
    // WITH before INSERT should be a write, but current impl doesn't detect it
    const sql = `
      WITH source AS (SELECT * FROM old_data)
      INSERT INTO new_data SELECT * FROM source
    `
    // Current implementation only checks startsWith
    expect(isWriteOperation(sql)).toBe(false)
  })

  test('returns false for WITH clause before UPDATE (current limitation)', () => {
    const sql = `
      WITH updates AS (SELECT id, new_value FROM pending)
      UPDATE users SET value = (SELECT new_value FROM updates WHERE updates.id = users.id)
    `
    expect(isWriteOperation(sql)).toBe(false)
  })

  test('returns false for WITH clause before DELETE (current limitation)', () => {
    const sql = `
      WITH to_delete AS (SELECT id FROM inactive_users)
      DELETE FROM users WHERE id IN (SELECT id FROM to_delete)
    `
    expect(isWriteOperation(sql)).toBe(false)
  })

  // === VACUUM/ANALYZE/ATTACH/DETACH ===
  test('returns false for VACUUM (current limitation)', () => {
    // VACUUM is a maintenance operation that can modify database
    expect(isWriteOperation('VACUUM')).toBe(false)
  })

  test('returns false for VACUUM INTO (current limitation)', () => {
    expect(isWriteOperation("VACUUM INTO 'backup.db'")).toBe(false)
  })

  test('returns false for ANALYZE (current limitation)', () => {
    // ANALYZE updates internal statistics tables
    expect(isWriteOperation('ANALYZE')).toBe(false)
  })

  test('returns false for ANALYZE table (current limitation)', () => {
    expect(isWriteOperation('ANALYZE users')).toBe(false)
  })

  test('returns false for ATTACH (current limitation)', () => {
    expect(isWriteOperation("ATTACH DATABASE 'other.db' AS other")).toBe(false)
  })

  test('returns false for DETACH (current limitation)', () => {
    expect(isWriteOperation('DETACH DATABASE other')).toBe(false)
  })

  // === SAVEPOINT/RELEASE/ROLLBACK TO ===
  test('returns false for SAVEPOINT (current limitation)', () => {
    expect(isWriteOperation('SAVEPOINT my_savepoint')).toBe(false)
  })

  test('returns false for RELEASE SAVEPOINT (current limitation)', () => {
    expect(isWriteOperation('RELEASE SAVEPOINT my_savepoint')).toBe(false)
  })

  test('returns false for RELEASE (current limitation)', () => {
    expect(isWriteOperation('RELEASE my_savepoint')).toBe(false)
  })

  test('returns false for ROLLBACK TO SAVEPOINT (current limitation)', () => {
    expect(isWriteOperation('ROLLBACK TO SAVEPOINT my_savepoint')).toBe(false)
  })

  test('returns false for ROLLBACK TO (current limitation)', () => {
    expect(isWriteOperation('ROLLBACK TO my_savepoint')).toBe(false)
  })

  // === TRANSACTION MARKERS ===
  test('returns false for BEGIN (current limitation)', () => {
    expect(isWriteOperation('BEGIN')).toBe(false)
  })

  test('returns false for BEGIN TRANSACTION (current limitation)', () => {
    expect(isWriteOperation('BEGIN TRANSACTION')).toBe(false)
  })

  test('returns false for BEGIN IMMEDIATE (current limitation)', () => {
    expect(isWriteOperation('BEGIN IMMEDIATE')).toBe(false)
  })

  test('returns false for BEGIN EXCLUSIVE (current limitation)', () => {
    expect(isWriteOperation('BEGIN EXCLUSIVE')).toBe(false)
  })

  test('returns false for COMMIT (current limitation)', () => {
    expect(isWriteOperation('COMMIT')).toBe(false)
  })

  test('returns false for END (current limitation)', () => {
    expect(isWriteOperation('END')).toBe(false)
  })

  test('returns false for ROLLBACK (current limitation)', () => {
    expect(isWriteOperation('ROLLBACK')).toBe(false)
  })

  // === PRAGMA ===
  test('returns false for PRAGMA (current limitation)', () => {
    // Some PRAGMAs modify database state
    expect(isWriteOperation('PRAGMA foreign_keys = ON')).toBe(false)
  })

  test('returns false for PRAGMA query', () => {
    expect(isWriteOperation('PRAGMA table_info(users)')).toBe(false)
  })

  // === INDEX OPERATIONS ===
  test('returns true for CREATE INDEX (starts with CREATE)', () => {
    // CREATE INDEX starts with 'create', so isWriteOperation returns true
    expect(isWriteOperation('CREATE INDEX idx_name ON users(name)')).toBe(true)
  })

  test('returns true for CREATE UNIQUE INDEX (starts with CREATE)', () => {
    expect(isWriteOperation('CREATE UNIQUE INDEX idx_email ON users(email)')).toBe(true)
  })

  test('returns true for DROP INDEX (starts with DROP)', () => {
    expect(isWriteOperation('DROP INDEX idx_name')).toBe(true)
  })

  // === TRIGGER/VIEW OPERATIONS ===
  test('returns true for CREATE TRIGGER (starts with CREATE)', () => {
    const sql = 'CREATE TRIGGER update_timestamp AFTER UPDATE ON users BEGIN UPDATE users SET updated_at = datetime(); END'
    expect(isWriteOperation(sql)).toBe(true)
  })

  test('returns true for DROP TRIGGER', () => {
    expect(isWriteOperation('DROP TRIGGER update_timestamp')).toBe(true)
  })

  test('returns true for CREATE VIEW', () => {
    expect(isWriteOperation('CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1')).toBe(true)
  })

  test('returns true for DROP VIEW', () => {
    expect(isWriteOperation('DROP VIEW active_users')).toBe(true)
  })

  // === REINDEX ===
  test('returns false for REINDEX (current limitation)', () => {
    expect(isWriteOperation('REINDEX')).toBe(false)
  })

  test('returns false for REINDEX table (current limitation)', () => {
    expect(isWriteOperation('REINDEX users')).toBe(false)
  })

  // === EDGE CASES ===
  test('handles empty string', () => {
    expect(isWriteOperation('')).toBe(false)
  })

  test('handles whitespace only', () => {
    expect(isWriteOperation('   \n\t  ')).toBe(false)
  })

  test('returns true for INSERT OR variants', () => {
    expect(isWriteOperation('INSERT OR REPLACE INTO users VALUES (?)')).toBe(true)
    expect(isWriteOperation('INSERT OR IGNORE INTO users VALUES (?)')).toBe(true)
    expect(isWriteOperation('INSERT OR ABORT INTO users VALUES (?)')).toBe(true)
    expect(isWriteOperation('INSERT OR ROLLBACK INTO users VALUES (?)')).toBe(true)
    expect(isWriteOperation('INSERT OR FAIL INTO users VALUES (?)')).toBe(true)
  })

  test('returns true for UPDATE OR variants', () => {
    expect(isWriteOperation('UPDATE OR REPLACE users SET name = ?')).toBe(true)
    expect(isWriteOperation('UPDATE OR IGNORE users SET name = ?')).toBe(true)
    expect(isWriteOperation('UPDATE OR ABORT users SET name = ?')).toBe(true)
    expect(isWriteOperation('UPDATE OR ROLLBACK users SET name = ?')).toBe(true)
    expect(isWriteOperation('UPDATE OR FAIL users SET name = ?')).toBe(true)
  })

  test('returns true for CREATE variants', () => {
    expect(isWriteOperation('CREATE TABLE users (id INTEGER)')).toBe(true)
    expect(isWriteOperation('CREATE TEMP TABLE cache (k TEXT, v TEXT)')).toBe(true)
    expect(isWriteOperation('CREATE TEMPORARY TABLE cache (k TEXT, v TEXT)')).toBe(true)
    expect(isWriteOperation('CREATE TABLE IF NOT EXISTS users (id INTEGER)')).toBe(true)
    expect(isWriteOperation('CREATE VIRTUAL TABLE search USING fts5(content)')).toBe(true)
  })

  test('returns true for DROP variants', () => {
    expect(isWriteOperation('DROP TABLE users')).toBe(true)
    expect(isWriteOperation('DROP TABLE IF EXISTS users')).toBe(true)
    expect(isWriteOperation('DROP VIEW active_users')).toBe(true)
    expect(isWriteOperation('DROP TRIGGER on_insert')).toBe(true)
  })

  test('returns true for ALTER variants', () => {
    expect(isWriteOperation('ALTER TABLE users ADD COLUMN email TEXT')).toBe(true)
    expect(isWriteOperation('ALTER TABLE users RENAME TO customers')).toBe(true)
    expect(isWriteOperation('ALTER TABLE users RENAME COLUMN name TO full_name')).toBe(true)
    expect(isWriteOperation('ALTER TABLE users DROP COLUMN old_field')).toBe(true)
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

  test('extracts filter from WHERE rowid = ?', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE rowid = ?', [99])
    expect(result).toEqual({ table: 'users', column: 'rowid', value: 99 })
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

  test('prefers id when present in AND conditions', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ? AND name = ?', [1, 'Alice'])
    expect(result).toEqual({ table: 'users', column: 'id', value: 1 })
  })

  test('prefers id when it appears after other conditions', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE tenant_id = ? AND id = ?', [7, 2])
    expect(result).toEqual({ table: 'users', column: 'id', value: 2 })
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

  test('returns null for non-id columns even when quoted', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE "user_id" = ?', [42])
    expect(result).toBeNull()
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

  // === BETWEEN CONDITION ===
  test('returns null for BETWEEN condition (current limitation)', () => {
    // BETWEEN is a range condition, too complex for simple row filtering
    const result = extractRowFilter('SELECT * FROM users WHERE age BETWEEN ? AND ?', [18, 65])
    // Current implementation doesn't explicitly handle BETWEEN
    // It may or may not return null depending on regex behavior
    // The condition "age BETWEEN ? AND ?" won't match simple equality regex
    expect(result).toBeNull()
  })

  test('returns null for NOT BETWEEN condition', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE age NOT BETWEEN ? AND ?', [0, 18])
    expect(result).toBeNull()
  })

  // === IS NULL / IS NOT NULL ===
  test('returns null for IS NULL condition', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE deleted_at IS NULL', [])
    // IS NULL doesn't match equality pattern
    expect(result).toBeNull()
  })

  test('returns null for IS NOT NULL condition', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE email IS NOT NULL', [])
    expect(result).toBeNull()
  })

  // === NOT CONDITION ===
  test('returns null for NOT condition with equality', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE NOT id = ?', [1])
    // NOT prefix breaks the simple equality match
    expect(result).toBeNull()
  })

  test('returns null for != operator', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id != ?', [1])
    // != is <>, which is filtered out
    expect(result).toBeNull()
  })

  // === NESTED PARENTHESES ===
  test('handles simple parentheses around condition', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE (id = ?)', [42])
    // Parentheses may break the simple regex match
    expect(result).toBeNull()
  })

  test('returns null for nested parentheses with AND', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE (id = ? AND (status = ?))', [1, 'active'])
    expect(result).toBeNull()
  })

  test('returns null for nested OR in parentheses', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE (id = ? OR name = ?)', [1, 'Alice'])
    expect(result).toBeNull()
  })

  // === FUNCTIONS IN WHERE ===
  test('returns null for CAST in WHERE condition', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE CAST(age AS TEXT) = ?', ['25'])
    // Function call in column position breaks equality match
    expect(result).toBeNull()
  })

  test('returns null for lower() function in WHERE', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE lower(email) = ?', ['test@example.com'])
    expect(result).toBeNull()
  })

  test('returns null for upper() function in WHERE', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE upper(name) = ?', ['ALICE'])
    expect(result).toBeNull()
  })

  test('returns null for COALESCE in WHERE', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE COALESCE(nickname, name) = ?', ['Bob'])
    expect(result).toBeNull()
  })

  test('returns null for date function in WHERE', () => {
    const result = extractRowFilter("SELECT * FROM users WHERE date(created_at) = ?", ['2024-01-01'])
    expect(result).toBeNull()
  })

  // === JSON OPERATORS ===
  test('returns null for JSON extract operator (->)', () => {
    const result = extractRowFilter("SELECT * FROM users WHERE data->>'name' = ?", ['Alice'])
    expect(result).toBeNull()
  })

  test('returns null for json_extract function', () => {
    const result = extractRowFilter("SELECT * FROM users WHERE json_extract(data, '$.name') = ?", ['Bob'])
    expect(result).toBeNull()
  })

  // === NAMED/NUMBERED PARAMETERS ===
  test('treats named parameter :name as literal value', () => {
    // Named parameters like :id are treated as literal values by the parser
    const result = extractRowFilter('SELECT * FROM users WHERE id = :id', [42])
    // Current implementation treats :id as a literal string value
    expect(result).toEqual({ table: 'users', column: 'id', value: ':id' })
  })

  test('treats numbered parameter $1 as literal value', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = $1', [42])
    // Current implementation treats $1 as a literal string value
    expect(result).toEqual({ table: 'users', column: 'id', value: '$1' })
  })

  test('treats @param style parameter as literal value', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = @userId', [42])
    // Current implementation treats @userId as a literal string value
    expect(result).toEqual({ table: 'users', column: 'id', value: '@userId' })
  })

  // === ADDITIONAL EDGE CASES ===
  test('handles HAVING clause (should not be treated as WHERE)', () => {
    const result = extractRowFilter('SELECT status, COUNT(*) FROM users GROUP BY status HAVING COUNT(*) > ?', [5])
    // No WHERE clause, should return null
    expect(result).toBeNull()
  })

  test('extracts from WHERE before HAVING', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ? GROUP BY status HAVING COUNT(*) > 1', [42])
    expect(result).toEqual({ table: 'users', column: 'id', value: 42 })
  })

  test('handles WHERE clause with OFFSET suffix', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ? LIMIT 10 OFFSET 5', [42])
    expect(result).toEqual({ table: 'users', column: 'id', value: 42 })
  })

  test('handles string value with spaces', () => {
    const result = extractRowFilter("SELECT * FROM users WHERE name = 'John Doe'", [])
    expect(result).toBeNull()
  })

  test('handles negative numeric literal', () => {
    const result = extractRowFilter('SELECT * FROM accounts WHERE balance = -100', [])
    expect(result).toBeNull()
  })

  test('handles float numeric literal', () => {
    const result = extractRowFilter('SELECT * FROM products WHERE price = 19.99', [])
    expect(result).toBeNull()
  })

  test('handles column with underscore prefix', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE _internal_id = ?', [42])
    expect(result).toBeNull()
  })

  test('handles column with numbers', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE field2 = ?', ['value'])
    expect(result).toBeNull()
  })

  test('extracts value from boolean-like string', () => {
    const result = extractRowFilter("SELECT * FROM users WHERE active = 'true'", [])
    expect(result).toBeNull()
  })

  test('handles SQLite TRUE/FALSE keywords', () => {
    // SQLite treats TRUE as 1 and FALSE as 0
    const result = extractRowFilter('SELECT * FROM users WHERE active = TRUE', [])
    expect(result).toBeNull()
  })

  test('handles NULL literal in WHERE', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE deleted_at = NULL', [])
    expect(result).toBeNull()
  })

  test('handles multiple spaces around equals', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id   =   ?', [42])
    expect(result).toEqual({ table: 'users', column: 'id', value: 42 })
  })

  test('handles tab around equals', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id\t=\t?', [42])
    expect(result).toEqual({ table: 'users', column: 'id', value: 42 })
  })

  test('returns null for empty params with parameterized query', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ?', [])
    expect(result).toBeNull()
  })

  test('handles zero as parameter value', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id = ?', [0])
    expect(result).toEqual({ table: 'users', column: 'id', value: 0 })
  })

  test('handles empty string as parameter value', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE name = ?', [''])
    expect(result).toBeNull()
  })

  test('handles null as parameter value', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE data = ?', [null])
    expect(result).toBeNull()
  })

  test('handles undefined as parameter value', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE data = ?', [undefined])
    expect(result).toBeNull()
  })

  test('handles table-prefixed column in WHERE', () => {
    const sql = `
      SELECT u.*, p.name as profile_name
      FROM users u
      JOIN profiles p ON u.id = p.user_id
      WHERE u.id = ?
    `
    const result = extractRowFilter(sql, [42])
    expect(result).toEqual({ table: 'users', column: 'id', value: 42 })
  })

  test('extracts from SELECT with JOIN but simple column reference', () => {
    const sql = `
      SELECT u.*, p.name
      FROM users u
      JOIN profiles p ON u.id = p.user_id
      WHERE id = ?
    `
    const result = extractRowFilter(sql, [42])
    // Simple column reference works
    expect(result).toEqual({ table: 'users', column: 'id', value: 42 })
  })

  test('returns null for GLOB operator', () => {
    const result = extractRowFilter("SELECT * FROM files WHERE name GLOB '*.txt'", [])
    expect(result).toBeNull()
  })

  test('returns null for MATCH operator (FTS)', () => {
    const result = extractRowFilter("SELECT * FROM search WHERE content MATCH 'query'", [])
    expect(result).toBeNull()
  })

  test('returns null for IN with values list', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id IN (1, 2, 3)', [])
    expect(result).toBeNull()
  })

  test('returns null for NOT IN', () => {
    const result = extractRowFilter('SELECT * FROM users WHERE id NOT IN (?, ?, ?)', [1, 2, 3])
    expect(result).toBeNull()
  })

  test('handles quoted table names in SELECT', () => {
    const result = extractRowFilter('SELECT * FROM "user-data" WHERE id = ?', [42])
    expect(result).toEqual({ table: 'user-data', column: 'id', value: 42 })
  })
})
