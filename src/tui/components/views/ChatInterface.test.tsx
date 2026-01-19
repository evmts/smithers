/**
 * Tests for src/tui/components/views/ChatInterface.tsx
 * Claude-powered chat interface view
 */

import { describe, test, expect } from 'bun:test'

describe('tui/components/views/ChatInterface', () => {
  describe('module exports', () => {
    test('exports ChatInterface component', async () => {
      const mod = await import('./ChatInterface.js')
      expect(typeof mod.ChatInterface).toBe('function')
    })

    test('exports ChatInterfaceProps type', async () => {
      const mod = await import('./ChatInterface.js')
      expect(mod.ChatInterface).toBeDefined()
    })
  })

  describe('component interface', () => {
    test('accepts db prop', async () => {
      const { ChatInterface } = await import('./ChatInterface.js')
      expect(typeof ChatInterface).toBe('function')
      expect(ChatInterface.length).toBe(1)
    })

    test('accepts height prop', async () => {
      const { ChatInterface } = await import('./ChatInterface.js')
      expect(typeof ChatInterface).toBe('function')
    })
  })
})
