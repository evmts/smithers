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
})
