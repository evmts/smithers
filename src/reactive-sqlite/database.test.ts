/**
 * Tests for ReactiveDatabase row-level invalidation
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from './database.js'

describe('ReactiveDatabase', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER)')
    db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  describe('basic subscription', () => {
    test('subscribe triggers callback on table invalidation', () => {
      let callCount = 0
      db.subscribe(['users'], () => {
        callCount++
      })

      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(callCount).toBe(1)
    })

    test('subscribeQuery auto-detects tables', () => {
      let callCount = 0
      db.subscribeQuery('SELECT * FROM users WHERE active = 1', () => {
        callCount++
      })

      db.run('INSERT INTO users (name, active) VALUES (?, ?)', ['Bob', 1])
      expect(callCount).toBe(1)
    })
  })

  describe('row-level subscription', () => {
    test('subscribeWithRowFilter only triggers for matching rows', () => {
      // Insert some initial data
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let callCount = 0
      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [1],
        () => { callCount++ }
      )

      // Update a different row - should NOT trigger
      db.run('UPDATE users SET name = ? WHERE id = ?', ['Robert', 2])
      expect(callCount).toBe(0)

      // Update the matching row - SHOULD trigger
      db.run('UPDATE users SET name = ? WHERE id = ?', ['Alicia', 1])
      expect(callCount).toBe(1)
    })

    test('UPDATE with WHERE id = X only invalidates that subscription', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let user1CallCount = 0
      let user2CallCount = 0

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [1],
        () => { user1CallCount++ }
      )

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [2],
        () => { user2CallCount++ }
      )

      // Update user 1
      db.run('UPDATE users SET name = ? WHERE id = ?', ['Alicia', 1])

      expect(user1CallCount).toBe(1)
      expect(user2CallCount).toBe(0)
    })

    test('DELETE with WHERE id = X only invalidates matching subscriptions', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let user1CallCount = 0
      let user2CallCount = 0

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [1],
        () => { user1CallCount++ }
      )

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [2],
        () => { user2CallCount++ }
      )

      // Delete user 2
      db.run('DELETE FROM users WHERE id = ?', [2])

      expect(user1CallCount).toBe(0)
      expect(user2CallCount).toBe(1)
    })

    test('INSERT triggers table-level (all subscriptions)', () => {
      let user1CallCount = 0
      let user2CallCount = 0

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [1],
        () => { user1CallCount++ }
      )

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [2],
        () => { user2CallCount++ }
      )

      // INSERT can't be row-filtered - triggers all on the table
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [3, 'Charlie'])

      // Both subscriptions should be triggered since INSERT affects the whole table
      expect(user1CallCount).toBe(1)
      expect(user2CallCount).toBe(1)
    })

    test('fallback to table-level when row tracking not possible', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob'])

      let callCount = 0
      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [1],
        () => { callCount++ }
      )

      // Complex WHERE clause - can't extract row filter, falls back to table-level
      db.run('UPDATE users SET active = 0 WHERE name LIKE ?', ['%ob%'])

      // Should trigger because we fall back to table-level invalidation
      expect(callCount).toBe(1)
    })
  })

  describe('invalidateRows', () => {
    test('invalidates specific row subscriptions', () => {
      let user1CallCount = 0
      let user2CallCount = 0

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [1],
        () => { user1CallCount++ }
      )

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [2],
        () => { user2CallCount++ }
      )

      // Manually invalidate row with id = 1
      db.invalidateRows('users', 'id', [1])

      expect(user1CallCount).toBe(1)
      expect(user2CallCount).toBe(0)
    })

    test('invalidates multiple rows at once', () => {
      let user1CallCount = 0
      let user2CallCount = 0
      let user3CallCount = 0

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [1],
        () => { user1CallCount++ }
      )

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [2],
        () => { user2CallCount++ }
      )

      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [3],
        () => { user3CallCount++ }
      )

      // Invalidate rows 1 and 3
      db.invalidateRows('users', 'id', [1, 3])

      expect(user1CallCount).toBe(1)
      expect(user2CallCount).toBe(0)
      expect(user3CallCount).toBe(1)
    })
  })

  describe('mixed subscriptions', () => {
    test('table-level and row-level subscriptions coexist', () => {
      db.run('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice'])

      let tableCallCount = 0
      let rowCallCount = 0

      // Table-level subscription
      db.subscribe(['users'], () => {
        tableCallCount++
      })

      // Row-level subscription
      db.subscribeWithRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [1],
        () => { rowCallCount++ }
      )

      // Update row 1 - both should trigger
      db.run('UPDATE users SET name = ? WHERE id = ?', ['Alicia', 1])

      expect(tableCallCount).toBe(1)
      expect(rowCallCount).toBe(1)
    })
  })
})
