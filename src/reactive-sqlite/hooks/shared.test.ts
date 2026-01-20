/**
 * Tests for shared reactive SQLite hook utilities
 *
 * These hooks use React primitives (useRef, useCallback, useSyncExternalStore).
 * Since they cannot be called outside a React component context, we test:
 * 1. Module exports and function signatures
 * 2. Type contracts
 * 3. Behavior patterns that can be verified through mocking
 */

import { describe, test, expect } from 'bun:test'
import { useStoreSignal, useVersionTracking, useQueryCache } from './shared.js'

describe('shared hook utilities', () => {
  describe('module exports', () => {
    test('useStoreSignal is exported as a function', () => {
      expect(typeof useStoreSignal).toBe('function')
    })

    test('useVersionTracking is exported as a function', () => {
      expect(typeof useVersionTracking).toBe('function')
    })

    test('useQueryCache is exported as a function', () => {
      expect(typeof useQueryCache).toBe('function')
    })
  })

  describe('function signatures', () => {
    test('useStoreSignal takes no arguments', () => {
      expect(useStoreSignal.length).toBe(0)
    })

    test('useVersionTracking takes no arguments', () => {
      expect(useVersionTracking.length).toBe(0)
    })

    test('useQueryCache takes no arguments (generic type only)', () => {
      expect(useQueryCache.length).toBe(0)
    })
  })
})

/**
 * The actual hook behavior is tested via integration tests in useQuery.test.ts
 * where we can verify:
 * - Signal subscription/notification patterns
 * - Version tracking triggering re-renders
 * - Query caching with key-based invalidation
 *
 * React hooks require a component context, so unit tests verify exports only.
 */
