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
      expect(extractText('hello')).toBe('hello')
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
    test('joins array elements', () => {
      expect(extractText(['hello', ' ', 'world'])).toBe('hello world')
      expect(extractText([1, 2, 3])).toBe('123')
    })

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
    test('extracts text from React element', () => {
      const element = createElement('div', null, 'content')
      expect(extractText(element)).toBe('content')
    })

    test('extracts nested React element text', () => {
      const nested = createElement('span', null, 'inner')
      const outer = createElement('div', null, nested)
      expect(extractText(outer)).toBe('inner')
    })

    test('extracts text from element with array children', () => {
      const element = createElement('div', null, 'a', 'b', 'c')
      expect(extractText(element)).toBe('abc')
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

    test('handles deeply nested elements', () => {
      const deep = createElement('a', null, createElement('b', null, createElement('c', null, 'deep')))
      expect(extractText(deep)).toBe('deep')
    })

    test('extracts text from deeply nested elements with text', () => {
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
    test('handles mixed array with elements and primitives', () => {
      const span = createElement('span', null, 'X')
      expect(extractText(['before', span, 'after'])).toBe('beforeXafter')
    })

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
