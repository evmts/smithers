import { describe, test, expect } from 'bun:test'
import { truncate, truncateTilde, formatTimestamp, formatTime, formatValue } from './format.js'

describe('tui/utils/format', () => {
  describe('truncate', () => {
    test('returns string unchanged if shorter than maxLen', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })

    test('returns string unchanged if equal to maxLen', () => {
      expect(truncate('hello', 5)).toBe('hello')
    })

    test('truncates with ellipsis when longer than maxLen', () => {
      expect(truncate('hello world', 8)).toBe('hello...')
    })

    test('uses custom ellipsis', () => {
      expect(truncate('hello world', 8, '~')).toBe('hello w~')
    })

    test('handles empty string', () => {
      expect(truncate('', 10)).toBe('')
    })
  })

  describe('truncateTilde', () => {
    test('returns string unchanged if shorter than maxLen', () => {
      expect(truncateTilde('hello', 10)).toBe('hello')
    })

    test('truncates with tilde when longer than maxLen', () => {
      expect(truncateTilde('hello world', 8)).toBe('hello w~')
    })
  })

  describe('formatTimestamp', () => {
    test('formats valid timestamp', () => {
      const result = formatTimestamp('2024-01-15T10:30:00Z')
      expect(result).toContain('2024')
    })

    test('returns original on invalid timestamp', () => {
      expect(formatTimestamp('invalid')).toBe('invalid')
    })
  })

  describe('formatTime', () => {
    test('formats time portion of timestamp', () => {
      const result = formatTime('2024-01-15T14:30:45Z')
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    test('returns --:--:-- on invalid timestamp', () => {
      expect(formatTime('invalid')).toBe('--:--:--')
    })
  })

  describe('formatValue', () => {
    test('returns NULL for null', () => {
      expect(formatValue(null)).toBe('NULL')
    })

    test('returns NULL for undefined', () => {
      expect(formatValue(undefined)).toBe('NULL')
    })

    test('stringifies objects', () => {
      expect(formatValue({ a: 1 })).toBe('{"a":1}')
    })

    test('truncates long objects', () => {
      const result = formatValue({ very: 'long', object: 'value' })
      expect(result.length).toBeLessThanOrEqual(20)
    })

    test('converts primitives to string', () => {
      expect(formatValue(42)).toBe('42')
      expect(formatValue(true)).toBe('true')
      expect(formatValue('hello')).toBe('hello')
    })
  })
})
