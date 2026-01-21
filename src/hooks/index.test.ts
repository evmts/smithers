// index.test.ts - Tests for hooks module exports
import { describe, test, expect } from 'bun:test'
import * as hooksIndex from './index.js'
import { useRalphCount } from './useRalphCount.js'
import { useHuman, type UseHumanResult, type AskOptions } from './useHuman.js'
import { useCaptureRenderFrame } from './useCaptureRenderFrame.js'
import { useCommitWithRetry } from './useCommitWithRetry.js'
import { useHumanInteractive } from './useHumanInteractive.js'
import { useClaude } from './useClaude.js'
import { useCodex } from './useCodex.js'
import { useAmp } from './useAmp.js'
import { useSmithersSubagent } from './useSmithersSubagent.js'
import { useReview } from './useReview.js'

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

    test('exports useCommitWithRetry', () => {
      expect(hooksIndex.useCommitWithRetry).toBeDefined()
      expect(typeof hooksIndex.useCommitWithRetry).toBe('function')
    })

    test('exports useHumanInteractive', () => {
      expect(hooksIndex.useHumanInteractive).toBeDefined()
      expect(typeof hooksIndex.useHumanInteractive).toBe('function')
    })

    test('exports useClaude', () => {
      expect(hooksIndex.useClaude).toBeDefined()
      expect(typeof hooksIndex.useClaude).toBe('function')
    })

    test('exports useCodex', () => {
      expect(hooksIndex.useCodex).toBeDefined()
      expect(typeof hooksIndex.useCodex).toBe('function')
    })

    test('exports useAmp', () => {
      expect(hooksIndex.useAmp).toBeDefined()
      expect(typeof hooksIndex.useAmp).toBe('function')
    })

    test('exports useSmithersSubagent', () => {
      expect(hooksIndex.useSmithersSubagent).toBeDefined()
      expect(typeof hooksIndex.useSmithersSubagent).toBe('function')
    })

    test('exports useReview', () => {
      expect(hooksIndex.useReview).toBeDefined()
      expect(typeof hooksIndex.useReview).toBe('function')
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

    test('useCommitWithRetry matches ./useCommitWithRetry export', () => {
      expect(hooksIndex.useCommitWithRetry).toBe(useCommitWithRetry)
    })

    test('useHumanInteractive matches ./useHumanInteractive export', () => {
      expect(hooksIndex.useHumanInteractive).toBe(useHumanInteractive)
    })

    test('useClaude matches ./useClaude export', () => {
      expect(hooksIndex.useClaude).toBe(useClaude)
    })

    test('useCodex matches ./useCodex export', () => {
      expect(hooksIndex.useCodex).toBe(useCodex)
    })

    test('useAmp matches ./useAmp export', () => {
      expect(hooksIndex.useAmp).toBe(useAmp)
    })

    test('useSmithersSubagent matches ./useSmithersSubagent export', () => {
      expect(hooksIndex.useSmithersSubagent).toBe(useSmithersSubagent)
    })

    test('useReview matches ./useReview export', () => {
      expect(hooksIndex.useReview).toBe(useReview)
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
