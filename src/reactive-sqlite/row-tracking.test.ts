/**
 * Tests for row-level tracking and invalidation
 */

import { describe, test, expect } from 'bun:test'
import { extractRowFilter } from './parser.js'

describe('extractRowFilter', () => {
  describe('simple WHERE id = ?', () => {
    test('extracts id from WHERE id = ?', () => {
      const result = extractRowFilter(
        'UPDATE users SET name = ? WHERE id = ?',
        ['Alice', 123]
      )
      expect(result).toEqual({
        table: 'users',
        column: 'id',
        value: 123
      })
    })

    test('extracts id from WHERE id = 123 (literal)', () => {
      const result = extractRowFilter(
        'UPDATE users SET name = ? WHERE id = 123',
        ['Alice']
      )
      expect(result).toEqual({
        table: 'users',
        column: 'id',
        value: 123
      })
    })

    test('extracts from DELETE statement', () => {
      const result = extractRowFilter(
        'DELETE FROM users WHERE id = ?',
        [456]
      )
      expect(result).toEqual({
        table: 'users',
        column: 'id',
        value: 456
      })
    })

    test('handles string id values', () => {
      const result = extractRowFilter(
        'UPDATE posts SET title = ? WHERE slug = ?',
        ['New Title', 'my-post']
      )
      expect(result).toEqual({
        table: 'posts',
        column: 'slug',
        value: 'my-post'
      })
    })
  })

  describe('complex WHERE clauses', () => {
    test('returns null for WHERE with OR', () => {
      const result = extractRowFilter(
        'UPDATE users SET name = ? WHERE id = ? OR email = ?',
        ['Alice', 1, 'alice@example.com']
      )
      expect(result).toBeNull()
    })

    test('handles WHERE with AND (first condition)', () => {
      // For AND, we can still extract the first simple condition
      const result = extractRowFilter(
        'UPDATE users SET status = ? WHERE id = ? AND active = ?',
        ['updated', 5, true]
      )
      // Should extract the id condition from AND clause
      expect(result).toEqual({
        table: 'users',
        column: 'id',
        value: 5
      })
    })

    test('returns null for subqueries', () => {
      const result = extractRowFilter(
        'UPDATE users SET name = ? WHERE id IN (SELECT user_id FROM admins)',
        ['Admin']
      )
      expect(result).toBeNull()
    })

    test('returns null for LIKE conditions', () => {
      const result = extractRowFilter(
        'DELETE FROM users WHERE name LIKE ?',
        ['%Alice%']
      )
      expect(result).toBeNull()
    })

    test('returns null for range conditions', () => {
      const result = extractRowFilter(
        'UPDATE users SET status = ? WHERE id > ?',
        ['archived', 100]
      )
      expect(result).toBeNull()
    })
  })

  describe('INSERT statements', () => {
    test('returns null for INSERT (no row filter possible)', () => {
      const result = extractRowFilter(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['Alice', 'alice@example.com']
      )
      expect(result).toBeNull()
    })
  })

  describe('SELECT statements', () => {
    test('extracts from simple SELECT WHERE', () => {
      const result = extractRowFilter(
        'SELECT * FROM users WHERE id = ?',
        [42]
      )
      expect(result).toEqual({
        table: 'users',
        column: 'id',
        value: 42
      })
    })
  })

  describe('edge cases', () => {
    test('handles table names with underscores', () => {
      const result = extractRowFilter(
        'UPDATE user_profiles SET bio = ? WHERE user_id = ?',
        ['Bio text', 99]
      )
      expect(result).toEqual({
        table: 'user_profiles',
        column: 'user_id',
        value: 99
      })
    })

    test('handles quoted identifiers', () => {
      const result = extractRowFilter(
        'UPDATE "users" SET name = ? WHERE "id" = ?',
        ['Alice', 1]
      )
      expect(result).toEqual({
        table: 'users',
        column: 'id',
        value: 1
      })
    })

    test('is case insensitive for keywords', () => {
      const result = extractRowFilter(
        'update USERS set NAME = ? where ID = ?',
        ['Alice', 1]
      )
      expect(result).toEqual({
        table: 'users',
        column: 'id',
        value: 1
      })
    })

    test('returns null when no WHERE clause', () => {
      const result = extractRowFilter(
        'UPDATE users SET active = ?',
        [false]
      )
      expect(result).toBeNull()
    })
  })
})
