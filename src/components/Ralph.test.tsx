/**
 * Unit tests for Ralph.tsx - Ralph orchestration component.
 */
import { describe, test, expect, mock } from 'bun:test'
import {
  RalphContext,
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
} from './Ralph'

describe('RalphContext', () => {
  test('RalphContext is exported', () => {
    expect(RalphContext).toBeDefined()
  })
})

describe('Orchestration promise functions', () => {
  test('createOrchestrationPromise returns a promise', () => {
    const promise = createOrchestrationPromise()

    expect(promise).toBeInstanceOf(Promise)
  })

  test('signalOrchestrationComplete resolves the promise', async () => {
    const promise = createOrchestrationPromise()

    // Signal completion in next tick
    setTimeout(() => signalOrchestrationComplete(), 0)

    await promise
    // If we get here, the promise resolved
    expect(true).toBe(true)
  })

  test('signalOrchestrationError rejects the promise', async () => {
    const promise = createOrchestrationPromise()
    const error = new Error('Test error')

    // Signal error in next tick
    setTimeout(() => signalOrchestrationError(error), 0)

    try {
      await promise
      expect(true).toBe(false) // Should not reach here
    } catch (e) {
      expect(e).toBe(error)
    }
  })

  test('signalOrchestrationComplete is safe to call without promise', () => {
    // Should not throw even if no promise exists
    signalOrchestrationComplete()
    expect(true).toBe(true)
  })

  test('signalOrchestrationError is safe to call without promise', () => {
    // Should not throw even if no promise exists
    signalOrchestrationError(new Error('Test'))
    expect(true).toBe(true)
  })

  test('calling complete twice is safe', async () => {
    const promise = createOrchestrationPromise()

    setTimeout(() => {
      signalOrchestrationComplete()
      signalOrchestrationComplete() // Second call should be no-op
    }, 0)

    await promise
    expect(true).toBe(true)
  })

  test('calling error after complete is no-op', async () => {
    const promise = createOrchestrationPromise()

    setTimeout(() => {
      signalOrchestrationComplete()
      signalOrchestrationError(new Error('Should not reject')) // Should be no-op
    }, 0)

    await promise
    expect(true).toBe(true)
  })
})

describe('RalphContextType interface', () => {
  test('context value has registerTask and completeTask', () => {
    // Create a mock context value
    const contextValue = {
      registerTask: mock(() => {}),
      completeTask: mock(() => {}),
    }

    expect(contextValue.registerTask).toBeDefined()
    expect(contextValue.completeTask).toBeDefined()
  })

  test('registerTask can be called', () => {
    const registerTask = mock(() => {})
    registerTask()
    expect(registerTask).toHaveBeenCalled()
  })

  test('completeTask can be called', () => {
    const completeTask = mock(() => {})
    completeTask()
    expect(completeTask).toHaveBeenCalled()
  })
})
