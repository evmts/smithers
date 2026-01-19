/**
 * Tests for extract-text.ts - React node text extraction
 */

import { describe, test, expect } from 'bun:test'
import { createElement, Fragment } from 'react'
import { extractText } from './extract-text.js'

describe('extractText', () => {
  describe('primitive values', () => {
    test('returns empty string for null', () => {
      expect(extractText(null)).toBe('')
    })

    test('returns empty string for undefined', () => {
      expect(extractText(undefined)).toBe('')
    })

    test('returns string as-is', () => {
      expect(extractText('hello world')).toBe('hello world')
    })

    test('returns empty string for empty string', () => {
      expect(extractText('')).toBe('')
    })

    test('converts number to string', () => {
      expect(extractText(42)).toBe('42')
      expect(extractText(0)).toBe('0')
      expect(extractText(-123)).toBe('-123')
      expect(extractText(3.14)).toBe('3.14')
    })

    test('returns empty string for boolean', () => {
      expect(extractText(true)).toBe('')
      expect(extractText(false)).toBe('')
    })
  })

  describe('arrays', () => {
    test('joins array of strings', () => {
      expect(extractText(['a', 'b', 'c'])).toBe('abc')
    })

    test('joins array of mixed types', () => {
      expect(extractText(['hello', 42, ' world'])).toBe('hello42 world')
    })

    test('handles empty array', () => {
      expect(extractText([])).toBe('')
    })

    test('handles nested arrays', () => {
      expect(extractText([['a', 'b'], ['c', 'd']])).toBe('abcd')
    })

    test('filters out booleans and nulls from array', () => {
      expect(extractText([true, 'text', false, null, 'more'])).toBe('textmore')
    })
  })

  describe('React elements', () => {
    test('extracts text from simple element', () => {
      const element = createElement('div', null, 'Hello')
      expect(extractText(element)).toBe('Hello')
    })

    test('extracts text from element with multiple children', () => {
      const element = createElement('span', null, 'Hello', ' ', 'World')
      expect(extractText(element)).toBe('Hello World')
    })

    test('extracts text from nested elements', () => {
      const inner = createElement('span', null, 'inner')
      const outer = createElement('div', null, 'outer ', inner, ' text')
      expect(extractText(outer)).toBe('outer inner text')
    })

    test('extracts text from deeply nested elements', () => {
      const level3 = createElement('span', null, 'deep')
      const level2 = createElement('div', null, level3)
      const level1 = createElement('section', null, 'start ', level2, ' end')
      expect(extractText(level1)).toBe('start deep end')
    })

    test('extracts text from Fragment', () => {
      const fragment = createElement(Fragment, null, 'a', 'b', 'c')
      expect(extractText(fragment)).toBe('abc')
    })

    test('handles element with no children', () => {
      const element = createElement('br', null)
      expect(extractText(element)).toBe('')
    })

    test('handles element with null children', () => {
      const element = createElement('div', { children: null })
      expect(extractText(element)).toBe('')
    })
  })

  describe('edge cases', () => {
    test('handles mixed React elements and strings in array', () => {
      const element = createElement('span', null, 'inside')
      const mixed = ['before ', element, ' after']
      expect(extractText(mixed)).toBe('before inside after')
    })

    test('handles unicode text', () => {
      expect(extractText('日本語テスト')).toBe('日本語テスト')
      expect(extractText('emoji 🎉')).toBe('emoji 🎉')
    })

    test('handles whitespace-only strings', () => {
      expect(extractText('   ')).toBe('   ')
      expect(extractText('\n\t')).toBe('\n\t')
    })

    test('handles object that is not a React element', () => {
      const obj = { toString: () => 'custom' }
      expect(extractText(obj as any)).toBe('custom')
    })

    test('handles very long strings', () => {
      const long = 'a'.repeat(10000)
      expect(extractText(long)).toBe(long)
    })

    test('handles large arrays', () => {
      const arr = Array(100).fill('x')
      expect(extractText(arr)).toBe('x'.repeat(100))
    })
  })
})
