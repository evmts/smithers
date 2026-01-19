// index.test.ts - Tests for hooks module exports
import { describe, test, expect } from 'bun:test'
import * as hooksIndex from './index.js'
import { useRalphCount } from './useRalphCount.js'
import { useHuman, type UseHumanResult, type AskOptions } from './useHuman.js'
import { useCaptureRenderFrame } from './useCaptureRenderFrame.js'

describe('hooks/index exports', () => {
  describe('named exports', () => {
    test('exports useRalphCount', () => {
      expect(hooksIndex.useRalphCount).toBeDefined()
      expect(typeof hooksIndex.useRalphCount).toBe('function')
    })

    test('exports useHuman', () => {
      expect(hooksIndex.useHuman).toBeDefined()
      expect(typeof hooksIndex.useHuman).toBe('function')
    })

    test('exports useCaptureRenderFrame', () => {
      expect(hooksIndex.useCaptureRenderFrame).toBeDefined()
      expect(typeof hooksIndex.useCaptureRenderFrame).toBe('function')
    })

    test('exports UseHumanResult type (type-only, verify via import)', () => {
      const typeCheck: UseHumanResult = {
        ask: async () => {},
        status: 'idle',
        requestId: null,
      }
      expect(typeCheck.status).toBe('idle')
    })

    test('exports AskOptions type (type-only, verify via import)', () => {
      const typeCheck: AskOptions = { options: ['yes', 'no'] }
      expect(typeCheck.options).toHaveLength(2)
    })
  })

  describe('re-exports match source modules', () => {
    test('useRalphCount matches ./useRalphCount export', () => {
      expect(hooksIndex.useRalphCount).toBe(useRalphCount)
    })

    test('useHuman matches ./useHuman export', () => {
      expect(hooksIndex.useHuman).toBe(useHuman)
    })

    test('useCaptureRenderFrame matches ./useCaptureRenderFrame export', () => {
      expect(hooksIndex.useCaptureRenderFrame).toBe(useCaptureRenderFrame)
    })
  })

  describe('module structure', () => {
    test('no default export', () => {
      expect((hooksIndex as any).default).toBeUndefined()
    })

    test('exported functions have correct arity', () => {
      expect(useRalphCount.length).toBe(0)
      expect(useHuman.length).toBe(0)
      expect(useCaptureRenderFrame.length).toBe(3)
    })
  })
})
