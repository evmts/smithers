import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { extractText } from './extract-text'

describe('extractText', () => {
  test('returns empty string for null', () => {
    expect(extractText(null)).toBe('')
  })

  test('returns empty string for undefined', () => {
    expect(extractText(undefined)).toBe('')
  })

  test('returns string as-is', () => {
    expect(extractText('hello')).toBe('hello')
  })

  test('converts number to string', () => {
    expect(extractText(42)).toBe('42')
    expect(extractText(3.14)).toBe('3.14')
  })

  test('returns empty string for boolean', () => {
    expect(extractText(true)).toBe('')
    expect(extractText(false)).toBe('')
  })

  test('joins array elements', () => {
    expect(extractText(['hello', ' ', 'world'])).toBe('hello world')
    expect(extractText([1, 2, 3])).toBe('123')
  })

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

  test('handles mixed array with elements and primitives', () => {
    const span = createElement('span', null, 'X')
    expect(extractText(['before', span, 'after'])).toBe('beforeXafter')
  })

  test('handles deeply nested elements', () => {
    const deep = createElement('a', null, createElement('b', null, createElement('c', null, 'deep')))
    expect(extractText(deep)).toBe('deep')
  })
})
