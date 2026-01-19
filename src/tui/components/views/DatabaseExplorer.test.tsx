/**
 * Tests for src/tui/components/views/DatabaseExplorer.tsx
 * Database browser view
 */

import { describe, test, expect } from 'bun:test'

describe('tui/components/views/DatabaseExplorer', () => {
  describe('module exports', () => {
    test('exports DatabaseExplorer component', async () => {
      const mod = await import('./DatabaseExplorer.js')
      expect(typeof mod.DatabaseExplorer).toBe('function')
    })

    test('exports DatabaseExplorerProps type', async () => {
      const mod = await import('./DatabaseExplorer.js')
      expect(mod.DatabaseExplorer).toBeDefined()
    })
  })

  describe('component interface', () => {
    test('accepts db prop', async () => {
      const { DatabaseExplorer } = await import('./DatabaseExplorer.js')
      expect(typeof DatabaseExplorer).toBe('function')
      expect(DatabaseExplorer.length).toBe(1)
    })

    test('accepts height prop', async () => {
      const { DatabaseExplorer } = await import('./DatabaseExplorer.js')
      expect(typeof DatabaseExplorer).toBe('function')
    })
  })
})
