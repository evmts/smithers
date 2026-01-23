import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createElement } from 'react'
import { renderHook, act, render, waitFor } from '@testing-library/react'
import { useIterationTimeout } from '../../src/hooks/useIterationTimeout.js'
import { IterationTimeout } from '../../src/components/IterationTimeout.js'
import { SmithersProvider } from '../../src/components/SmithersProvider.js'
import { SmithersDB } from '../../src/db/index.js'
import { clearIterationTimeout, createIterationTimeout } from '../../src/orchestrator/timeout.js'

// Mock SmithersDB with reactive SQLite functionality
const createMockDB = (): SmithersDB => {
  const state = new Map<string, any>()
  const subscribers = new Map<string, Set<() => void>>()

  const triggerUpdate = (key: string) => {
    const keySubscribers = subscribers.get(key)
    if (keySubscribers) {
      keySubscribers.forEach(callback => callback())
    }
  }

  return {
    state: {
      get: (key: string) => state.get(key),
      set: (key: string, value: any, source?: string) => {
        state.set(key, value)
        triggerUpdate(key)
      }
    },
    db: {
      prepare: (sql: string) => ({
        get: (params?: any[]) => {
          if (sql.includes('SELECT json_extract(value')) {
            const key = params?.[0]
            return state.has(key) ? { config: state.get(key) } : null
          }
          return null
        },
        all: () => []
      }),
      exec: () => {},
      run: () => ({ changes: 0, lastInsertRowid: 0 })
    },
    // Mock reactive functionality
    subscribe: (query: string, params: any[], callback: () => void) => {
      const key = params?.[0]
      if (key && query.includes('SELECT json_extract(value')) {
        if (!subscribers.has(key)) {
          subscribers.set(key, new Set())
        }
        subscribers.get(key)!.add(callback)
      }
      return () => {
        if (key && subscribers.has(key)) {
          subscribers.get(key)!.delete(callback)
        }
      }
    }
  } as any
}

const TestWrapper = ({ children, db }: { children: any, db: SmithersDB }) =>
  createElement(SmithersProvider, {
    db,
    executionId: 'integration-test-execution',
    config: { maxIterations: 10 }
  }, children)

describe('Integration: IterationTimeout System', () => {
  let mockDB: SmithersDB

  beforeEach(() => {
    mockDB = createMockDB()
    clearIterationTimeout()
  })

  afterEach(() => {
    clearIterationTimeout()
  })

  test('should integrate hook with component for timeout configuration', async () => {
    // Test that hook and component work together
    const TestComponent = () => {
      const timeout = useIterationTimeout({ timeoutMs: 100, enabled: true })

      return createElement(IterationTimeout, {
        config: timeout.config,
        onConfigUpdate: timeout.updateConfig,
        onTimeout: timeout.waitForTimeout
      })
    }

    const { container } = render(createElement(TestWrapper, {
      db: mockDB,
      children: createElement(TestComponent)
    }))

    expect(container).toBeTruthy()
  })

  test('should maintain timeout state across component updates', async () => {
    const { result, rerender } = renderHook(
      () => useIterationTimeout({ timeoutMs: 200, enabled: false }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    // Update config
    act(() => {
      result.current.updateConfig({ enabled: true, timeoutMs: 300 })
    })

    // Rerender and check persistence
    rerender()

    expect(result.current.config.enabled).toBe(true)
    expect(result.current.config.timeoutMs).toBe(300)
  })

  test('should handle rapid timeout configuration changes', async () => {
    const { result } = renderHook(
      () => useIterationTimeout({ timeoutMs: 50, enabled: true }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    // Rapidly change configuration multiple times
    act(() => {
      result.current.updateConfig({ timeoutMs: 100 })
      result.current.updateConfig({ timeoutMs: 150 })
      result.current.updateConfig({ enabled: false })
      result.current.updateConfig({ enabled: true, timeoutMs: 200 })
    })

    expect(result.current.config.timeoutMs).toBe(200)
    expect(result.current.config.enabled).toBe(true)
  })

  test('should coordinate multiple timeout instances', async () => {
    // Create two timeout hooks with different configs
    const { result: result1 } = renderHook(
      () => useIterationTimeout({ timeoutMs: 100, enabled: true, stateKey: 'timeout_1' }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    const { result: result2 } = renderHook(
      () => useIterationTimeout({ timeoutMs: 200, enabled: false, stateKey: 'timeout_2' }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    expect(result1.current.config.timeoutMs).toBe(100)
    expect(result1.current.config.enabled).toBe(true)
    expect(result2.current.config.timeoutMs).toBe(200)
    expect(result2.current.config.enabled).toBe(false)

    // Update one shouldn't affect the other
    act(() => {
      result1.current.updateConfig({ timeoutMs: 300 })
    })

    expect(result1.current.config.timeoutMs).toBe(300)
    expect(result2.current.config.timeoutMs).toBe(200)
  })

  test('should handle timeout cancellation during configuration updates', async () => {
    const { result } = renderHook(
      () => useIterationTimeout({ timeoutMs: 1000, enabled: true }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    // Start a long timeout
    const timeoutPromise = result.current.waitForTimeout()

    // Immediately disable
    act(() => {
      result.current.updateConfig({ enabled: false })
    })

    // The timeout should resolve quickly since it was cancelled
    const start = Date.now()
    await timeoutPromise
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(500)
  })

  test('should validate configuration during state updates', async () => {
    const { result } = renderHook(
      () => useIterationTimeout({ timeoutMs: 100, enabled: false }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    expect(() => {
      act(() => {
        result.current.updateConfig({ timeoutMs: -1 })
      })
    }).toThrow('Timeout must be non-negative')
  })

  test('should persist configuration across provider remounts', async () => {
    let hookResult: any

    // Initial render
    const { unmount: unmount1 } = renderHook(
      () => {
        hookResult = useIterationTimeout({ timeoutMs: 500, enabled: true })
        return hookResult
      },
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    // Update config
    act(() => {
      hookResult.updateConfig({ timeoutMs: 750 })
    })

    unmount1()

    // Re-render with same db
    const { result: result2 } = renderHook(
      () => useIterationTimeout({ timeoutMs: 100, enabled: false }), // Different initial config
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    // Should use stored config, not initial config
    expect(result2.current.config.timeoutMs).toBe(750)
    expect(result2.current.config.enabled).toBe(true)
  })

  test('should handle concurrent timeout operations', async () => {
    const { result } = renderHook(
      () => useIterationTimeout({ timeoutMs: 50, enabled: true }),
      {
        wrapper: ({ children }) => createElement(TestWrapper, { children, db: mockDB })
      }
    )

    // Start multiple timeouts concurrently
    const start = Date.now()

    await act(async () => {
      await Promise.all([
        result.current.waitForTimeout(),
        result.current.waitForTimeout(),
        result.current.waitForTimeout(),
        // Also test with direct timeout calls
        createIterationTimeout(result.current.config),
        createIterationTimeout(result.current.config)
      ])
    })

    const elapsed = Date.now() - start

    // Should complete in roughly one timeout period since they share state
    expect(elapsed).toBeGreaterThanOrEqual(40)
    expect(elapsed).toBeLessThan(100)
  })
})