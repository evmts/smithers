/**
 * Tests for src/components/Smithers.tsx
 * Smithers subagent component
 */

import { describe, test, expect } from 'bun:test'

describe('components/Smithers', () => {
  describe('module exports', () => {
    test('exports Smithers component', async () => {
      const mod = await import('./Smithers.js')
      expect(typeof mod.Smithers).toBe('function')
    })

    test('exports SmithersProps type', async () => {
      const mod = await import('./Smithers.js')
      expect(mod.Smithers).toBeDefined()
    })

    test('exports SmithersResult type', async () => {
      const mod = await import('./Smithers.js')
      expect(mod.Smithers).toBeDefined()
    })

    test('exports executeSmithers function', async () => {
      const mod = await import('./Smithers.js')
      expect(typeof mod.executeSmithers).toBe('function')
    })
  })

  describe('SmithersProps interface', () => {
    test('children prop is required', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })

    test('plannerModel prop has default of sonnet', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })

    test('executionModel prop has default of sonnet', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })

    test('maxPlanningTurns prop has default of 5', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })

    test('timeout prop has default of 600000', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })

    test('reportingEnabled prop has default of true', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })

    test('keepScript prop has default of false', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })
  })

  describe('callback props', () => {
    test('onFinished callback prop is optional', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })

    test('onError callback prop is optional', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })

    test('onProgress callback prop is optional', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })

    test('onScriptGenerated callback prop is optional', async () => {
      const { Smithers } = await import('./Smithers.js')
      expect(typeof Smithers).toBe('function')
    })
  })
})
