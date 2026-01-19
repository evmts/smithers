import { describe, test, expect } from 'bun:test'
import { clampSelectedIndex, clampScrollOffset, getVisibleItems } from './ScrollableList.js'

describe('ScrollableList helpers', () => {
  test('clampSelectedIndex clamps to valid range', () => {
    expect(clampSelectedIndex(5, 3)).toBe(2)
    expect(clampSelectedIndex(-1, 3)).toBe(0)
    expect(clampSelectedIndex(0, 0)).toBe(0)
  })

  test('clampScrollOffset clamps to list bounds', () => {
    expect(clampScrollOffset(5, 3, 2)).toBe(1)
    expect(clampScrollOffset(-2, 3, 2)).toBe(0)
    expect(clampScrollOffset(10, 0, 5)).toBe(0)
  })

  test('getVisibleItems slices by offset and height', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    expect(getVisibleItems(items, 1, 2)).toEqual(['b', 'c'])
    expect(getVisibleItems(items, 4, 3)).toEqual(['e'])
    expect(getVisibleItems([], 0, 3)).toEqual([])
  })
})
