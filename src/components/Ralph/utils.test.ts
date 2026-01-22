/**
 * Tests for Ralph orchestration utilities
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
} from './utils.js'

describe('orchestration utilities', () => {
  describe('createOrchestrationPromise', () => {
    test('returns a promise', () => {
      const promise = createOrchestrationPromise()
      expect(promise).toBeInstanceOf(Promise)
    })

    test('promise resolves when signalOrchestrationComplete is called', async () => {
      const promise = createOrchestrationPromise()
      
      // Signal completion after a short delay
      setTimeout(() => signalOrchestrationComplete(), 10)
      
      await expect(promise).resolves.toBeUndefined()
    })

    test('promise rejects when signalOrchestrationError is called', async () => {
      const promise = createOrchestrationPromise()
      const error = new Error('Test orchestration error')
      
      // Signal error after a short delay
      setTimeout(() => signalOrchestrationError(error), 10)
      
      await expect(promise).rejects.toThrow('Test orchestration error')
    })
  })

  describe('signalOrchestrationComplete', () => {
    test('is idempotent when called multiple times', () => {
      createOrchestrationPromise()
      
      // Should not throw when called multiple times
      signalOrchestrationComplete()
      signalOrchestrationComplete()
      signalOrchestrationComplete()
    })

    test('does nothing when no promise exists', () => {
      // Clean state - signalOrchestrationComplete was called in previous test
      // Just ensure no error is thrown
      signalOrchestrationComplete()
    })
  })

  describe('signalOrchestrationError', () => {
    test('is idempotent when called multiple times', () => {
      createOrchestrationPromise().catch(() => {}) // Suppress unhandled rejection
      
      const error = new Error('Test error')
      
      // Should not throw when called multiple times
      signalOrchestrationError(error)
      signalOrchestrationError(error)
    })

    test('does nothing when no promise exists', () => {
      // Clean state
      const error = new Error('Test error')
      // Should not throw
      signalOrchestrationError(error)
    })
  })

  describe('state isolation', () => {
    test('new promise overwrites previous unresolved promise', async () => {
      // Create first promise (don't resolve it)
      const promise1 = createOrchestrationPromise()
      
      // Create second promise (overwrites the first)
      const promise2 = createOrchestrationPromise()
      
      // Signal completion - only the second promise should resolve
      signalOrchestrationComplete()
      
      await expect(promise2).resolves.toBeUndefined()
      
      // First promise will never resolve (orphaned)
      // We can't easily test this without timeouts, so just verify no errors
    })
  })
})
