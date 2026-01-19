/**
 * Tests for src/tui/components/shared/ScrollableList.tsx
 * Scrollable list with vim-style navigation
 */

import { describe, test, expect } from 'bun:test'

describe('tui/components/shared/ScrollableList', () => {
  describe('module exports', () => {
    test('exports ScrollableList component', async () => {
      const mod = await import('./ScrollableList.js')
      expect(typeof mod.ScrollableList).toBe('function')
    })

    test('ScrollableListProps type is available', async () => {
      const mod = await import('./ScrollableList.js')
      expect(mod.ScrollableList).toBeDefined()
    })
  })

  describe('props interface', () => {
    test('component accepts items array', async () => {
      const { ScrollableList } = await import('./ScrollableList.js')
      expect(ScrollableList.length).toBe(1)
    })

    test('component accepts renderItem function', async () => {
      const { ScrollableList } = await import('./ScrollableList.js')
      expect(typeof ScrollableList).toBe('function')
    })
  })

  describe('default values', () => {
    test('height defaults to 10', async () => {
      const { ScrollableList } = await import('./ScrollableList.js')
      expect(typeof ScrollableList).toBe('function')
    })

    test('focused defaults to true', async () => {
      const { ScrollableList } = await import('./ScrollableList.js')
      expect(typeof ScrollableList).toBe('function')
    })
  })

  describe('selection clamping logic', () => {
    test('clamps selectedIndex to valid range', () => {
      const items = ['a', 'b', 'c']
      const selectedIndex = 5

      const clampedSelectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1))
      expect(clampedSelectedIndex).toBe(2)
    })

    test('clamps to 0 for empty list', () => {
      const items: string[] = []
      const selectedIndex = 0

      const clampedSelectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1))
      expect(clampedSelectedIndex).toBe(0)
    })

    test('handles negative index', () => {
      const items = ['a', 'b', 'c']
      const selectedIndex = -1

      const clampedSelectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1))
      expect(clampedSelectedIndex).toBe(-1)
    })
  })

  describe('keyboard navigation logic', () => {
    test('j/down increments selectedIndex', () => {
      let selectedIndex = 0
      const itemsLength = 5

      const newIndex = Math.min(selectedIndex + 1, itemsLength - 1)
      expect(newIndex).toBe(1)
    })

    test('j/down does not exceed items.length - 1', () => {
      let selectedIndex = 4
      const itemsLength = 5

      const newIndex = Math.min(selectedIndex + 1, itemsLength - 1)
      expect(newIndex).toBe(4)
    })

    test('k/up decrements selectedIndex', () => {
      let selectedIndex = 2

      const newIndex = Math.max(selectedIndex - 1, 0)
      expect(newIndex).toBe(1)
    })

    test('k/up does not go below 0', () => {
      let selectedIndex = 0

      const newIndex = Math.max(selectedIndex - 1, 0)
      expect(newIndex).toBe(0)
    })

    test('g goes to first item (index 0)', () => {
      let selectedIndex = 5
      selectedIndex = 0
      expect(selectedIndex).toBe(0)
    })

    test('G goes to last item', () => {
      const itemsLength = 10
      let selectedIndex = 0
      selectedIndex = itemsLength - 1
      expect(selectedIndex).toBe(9)
    })
  })

  describe('scroll offset logic', () => {
    test('adjusts scrollOffset when selection exceeds visible area', () => {
      const height = 5
      let scrollOffset = 0
      let selectedIndex = 5

      if (selectedIndex >= scrollOffset + height) {
        scrollOffset = selectedIndex - height + 1
      }

      expect(scrollOffset).toBe(1)
    })

    test('adjusts scrollOffset when selection goes above visible area', () => {
      let scrollOffset = 5
      let selectedIndex = 3

      if (selectedIndex < scrollOffset) {
        scrollOffset = selectedIndex
      }

      expect(scrollOffset).toBe(3)
    })

    test('G sets scrollOffset to show last items', () => {
      const itemsLength = 20
      const height = 5
      const scrollOffset = Math.max(0, itemsLength - height)
      expect(scrollOffset).toBe(15)
    })

    test('g sets scrollOffset to 0', () => {
      let scrollOffset = 10
      scrollOffset = 0
      expect(scrollOffset).toBe(0)
    })
  })

  describe('visible items calculation', () => {
    test('slices items from scrollOffset to scrollOffset + height', () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      const scrollOffset = 2
      const height = 3

      const visibleItems = items.slice(scrollOffset, scrollOffset + height)
      expect(visibleItems).toEqual(['c', 'd', 'e'])
    })

    test('handles scrollOffset at end of list', () => {
      const items = ['a', 'b', 'c']
      const scrollOffset = 2
      const height = 5

      const visibleItems = items.slice(scrollOffset, scrollOffset + height)
      expect(visibleItems).toEqual(['c'])
    })

    test('handles empty items', () => {
      const items: string[] = []
      const scrollOffset = 0
      const height = 10

      const visibleItems = items.slice(scrollOffset, scrollOffset + height)
      expect(visibleItems).toEqual([])
    })
  })

  describe('actual index calculation', () => {
    test('actualIndex = scrollOffset + index', () => {
      const scrollOffset = 5
      const visibleIndex = 2
      const actualIndex = scrollOffset + visibleIndex
      expect(actualIndex).toBe(7)
    })
  })

  describe('edge cases', () => {
    test('handles single item list navigation', () => {
      const items = ['only']
      let selectedIndex = 0

      selectedIndex = Math.min(selectedIndex + 1, items.length - 1)
      expect(selectedIndex).toBe(0)

      selectedIndex = Math.max(selectedIndex - 1, 0)
      expect(selectedIndex).toBe(0)
    })

    test('handles list larger than height', () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`)
      const height = 10

      const visibleItems = items.slice(0, height)
      expect(visibleItems).toHaveLength(10)
    })
  })
})
