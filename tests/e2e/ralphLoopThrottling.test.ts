import { describe, test, expect, beforeEach, afterEach, jest } from 'bun:test'
import { createElement } from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { useIterationTimeout } from '../../src/hooks/useIterationTimeout.js'
import { IterationTimeout } from '../../src/components/IterationTimeout.js'
import { SmithersProvider } from '../../src/components/SmithersProvider.js'
import { SmithersDB } from '../../src/db/index.js'
import { clearIterationTimeout } from '../../src/orchestrator/timeout.js'
import { sleep } from '../../src/utils/sleep.js'

// Mock a simplified Ralph loop execution environment
const createMockSmithersDB = (): SmithersDB => {
  const stateMap = new Map<string, any>()
  const agentsTable = new Map<string, any>()
  const tasksTable = new Map<string, any>()

  return {
    state: {
      get: (key: string) => stateMap.get(key),
      set: (key: string, value: any, source?: string) => {
        stateMap.set(key, value)
      }
    },
    agents: {
      insert: (agent: any) => {
        agentsTable.set(agent.id, agent)
        return agent.id
      },
      update: (id: string, updates: any) => {
        const agent = agentsTable.get(id)
        if (agent) {
          agentsTable.set(id, { ...agent, ...updates })
        }
      },
      get: (id: string) => agentsTable.get(id)
    },
    tasks: {
      insert: (task: any) => {
        tasksTable.set(task.id, task)
        return task.id
      },
      update: (id: string, updates: any) => {
        const task = tasksTable.get(id)
        if (task) {
          tasksTable.set(id, { ...task, ...updates })
        }
      },
      get: (id: string) => tasksTable.get(id)
    },
    db: {
      prepare: (sql: string) => ({
        get: (params?: any[]) => {
          if (sql.includes('SELECT json_extract(value')) {
            const key = params?.[0]
            return stateMap.has(key) ? { config: stateMap.get(key) } : null
          }
          return null
        },
        all: () => []
      }),
      exec: () => {},
      run: () => ({ changes: 1, lastInsertRowid: 1 })
    }
  } as any
}

// Simulate a Ralph loop with multiple iterations
async function simulateRalphLoop(
  iterationTimeout: ReturnType<typeof useIterationTimeout>,
  maxIterations: number = 5,
  taskPerIteration: () => Promise<void> = async () => sleep(10)
): Promise<{
  totalTime: number,
  iterations: number,
  averageIterationTime: number,
  timeoutOverhead: number
}> {
  const start = Date.now()
  let iterations = 0

  for (let i = 0; i < maxIterations; i++) {
    const iterationStart = Date.now()

    // Simulate Ralph work
    await taskPerIteration()

    // Apply iteration timeout (this is what Ralph would do)
    if (iterationTimeout.isEnabled) {
      await iterationTimeout.waitForTimeout()
    }

    iterations++
    const iterationTime = Date.now() - iterationStart

    // Log iteration metrics for debugging
    console.log(`Iteration ${i + 1}: ${iterationTime}ms`)
  }

  const totalTime = Date.now() - start
  const averageIterationTime = totalTime / iterations
  const expectedBaseTime = maxIterations * 10 // 10ms per task
  const timeoutOverhead = totalTime - expectedBaseTime

  return {
    totalTime,
    iterations,
    averageIterationTime,
    timeoutOverhead
  }
}

const TestWrapper = ({ children, db }: { children: any, db: SmithersDB }) =>
  createElement(SmithersProvider, {
    db,
    executionId: 'e2e-ralph-execution',
    config: { maxIterations: 100 }
  }, children)

describe('E2E: Ralph Loop Throttling', () => {
  let mockDB: SmithersDB

  beforeEach(() => {
    mockDB = createMockSmithersDB()
    clearIterationTimeout()
  })

  afterEach(() => {
    clearIterationTimeout()
  })

  test('should throttle Ralph loop iterations with enabled timeout', async () => {
    const RalphComponent = () => {
      const timeout = useIterationTimeout({
        timeoutMs: 100,
        enabled: true,
        autoApplyOnRalph: true
      })

      return createElement(IterationTimeout, {
        config: timeout.config,
        onConfigUpdate: timeout.updateConfig,
        onTimeout: timeout.waitForTimeout
      })
    }

    render(createElement(TestWrapper, {
      db: mockDB,
      children: createElement(RalphComponent)
    }))

    // Get the timeout hook for testing
    let timeoutHook: ReturnType<typeof useIterationTimeout>

    const { result } = await act(async () => {
      return render(createElement(() => {
        timeoutHook = useIterationTimeout({
          timeoutMs: 100,
          enabled: true
        })
        return null
      }, {}))
    })

    const metrics = await simulateRalphLoop(timeoutHook!, 3)

    // Should have significant timeout overhead due to throttling
    expect(metrics.timeoutOverhead).toBeGreaterThan(250) // 3 * 100ms - some tolerance
    expect(metrics.averageIterationTime).toBeGreaterThan(100)
    expect(metrics.iterations).toBe(3)
  })

  test('should not throttle when timeout is disabled', async () => {
    let timeoutHook: ReturnType<typeof useIterationTimeout>

    await act(async () => {
      render(createElement(() => {
        timeoutHook = useIterationTimeout({
          timeoutMs: 100,
          enabled: false
        })
        return null
      }, {}))
    })

    const metrics = await simulateRalphLoop(timeoutHook!, 5)

    // Should have minimal overhead when disabled
    expect(metrics.timeoutOverhead).toBeLessThan(50)
    expect(metrics.averageIterationTime).toBeLessThan(30)
    expect(metrics.iterations).toBe(5)
  })

  test('should allow dynamic timeout adjustment during Ralph execution', async () => {
    let timeoutHook: ReturnType<typeof useIterationTimeout>

    await act(async () => {
      render(createElement(() => {
        timeoutHook = useIterationTimeout({
          timeoutMs: 50,
          enabled: true
        })
        return null
      }, {}))
    })

    // Start with short timeout
    const phase1Start = Date.now()
    await act(async () => {
      await simulateRalphLoop(timeoutHook!, 2)
    })
    const phase1Time = Date.now() - phase1Start

    // Change to longer timeout mid-execution
    await act(async () => {
      timeoutHook!.updateConfig({ timeoutMs: 150 })
    })

    const phase2Start = Date.now()
    await act(async () => {
      await simulateRalphLoop(timeoutHook!, 2)
    })
    const phase2Time = Date.now() - phase2Start

    // Phase 2 should take longer due to increased timeout
    expect(phase2Time).toBeGreaterThan(phase1Time * 2.5) // 150ms vs 50ms timeout
  })

  test('should handle Ralph loop interruption and cleanup', async () => {
    let timeoutHook: ReturnType<typeof useIterationTimeout>

    await act(async () => {
      render(createElement(() => {
        timeoutHook = useIterationTimeout({
          timeoutMs: 200,
          enabled: true
        })
        return null
      }, {}))
    })

    // Start a Ralph loop and interrupt it mid-execution
    const abortController = new AbortController()
    let interrupted = false

    const loopPromise = (async () => {
      try {
        for (let i = 0; i < 10; i++) {
          if (abortController.signal.aborted) {
            interrupted = true
            break
          }

          // Simulate work
          await sleep(10)

          // Apply timeout
          await timeoutHook!.waitForTimeout()
        }
      } catch (error) {
        // Handle abortion gracefully
        interrupted = true
      }
    })()

    // Let a couple iterations run, then interrupt
    await sleep(250) // Allow ~1 iteration
    abortController.abort()
    clearIterationTimeout() // Simulate cleanup

    await loopPromise

    expect(interrupted).toBe(true)
  })

  test('should maintain performance under high frequency Ralph operations', async () => {
    let timeoutHook: ReturnType<typeof useIterationTimeout>

    await act(async () => {
      render(createElement(() => {
        timeoutHook = useIterationTimeout({
          timeoutMs: 10, // Very short timeout for high frequency
          enabled: true
        })
        return null
      }, {}))
    })

    // Test high frequency iterations
    const highFrequencyMetrics = await simulateRalphLoop(
      timeoutHook!,
      20,
      async () => sleep(1) // Very fast work
    )

    expect(highFrequencyMetrics.iterations).toBe(20)
    expect(highFrequencyMetrics.totalTime).toBeLessThan(1000) // Should complete within 1 second
    expect(highFrequencyMetrics.averageIterationTime).toBeGreaterThan(10) // At least timeout duration
  })

  test('should prevent runaway costs with escalating timeout', async () => {
    let timeoutHook: ReturnType<typeof useIterationTimeout>

    await act(async () => {
      render(createElement(() => {
        timeoutHook = useIterationTimeout({
          timeoutMs: 50,
          enabled: true
        })
        return null
      }, {}))
    })

    // Simulate escalating timeout for runaway prevention
    const escalatingLoop = async () => {
      const maxIterations = 5
      let currentTimeout = 50

      for (let i = 0; i < maxIterations; i++) {
        // Update timeout with escalation
        await act(async () => {
          timeoutHook!.updateConfig({
            timeoutMs: currentTimeout,
            enabled: true
          })
        })

        const iterationStart = Date.now()

        // Simulate Ralph work
        await sleep(10)

        // Apply current timeout
        await timeoutHook!.waitForTimeout()

        const iterationTime = Date.now() - iterationStart
        expect(iterationTime).toBeGreaterThanOrEqual(currentTimeout - 10)

        // Escalate timeout for next iteration
        currentTimeout *= 2 // Double the timeout each time
      }
    }

    await escalatingLoop()

    // Final timeout should be significantly increased
    expect(timeoutHook!.config.timeoutMs).toBe(800) // 50 * 2^4
  })

  test('should integrate with component UI for real-time configuration', async () => {
    let timeoutHook: ReturnType<typeof useIterationTimeout>

    const RalphControlPanel = () => {
      timeoutHook = useIterationTimeout({
        timeoutMs: 100,
        enabled: false
      })

      return createElement(IterationTimeout, {
        config: timeoutHook.config,
        onConfigUpdate: timeoutHook.updateConfig,
        onTimeout: timeoutHook.waitForTimeout,
        showControls: true // Enable UI controls
      })
    }

    const { container } = render(createElement(TestWrapper, {
      db: mockDB,
      children: createElement(RalphControlPanel)
    }))

    // Initially disabled - should be fast
    const disabledMetrics = await simulateRalphLoop(timeoutHook!, 3)
    expect(disabledMetrics.timeoutOverhead).toBeLessThan(50)

    // Enable through component (simulate user interaction)
    await act(async () => {
      timeoutHook!.updateConfig({ enabled: true, timeoutMs: 120 })
    })

    // Now should be throttled
    const enabledMetrics = await simulateRalphLoop(timeoutHook!, 3)
    expect(enabledMetrics.timeoutOverhead).toBeGreaterThan(300) // 3 * 120ms - tolerance

    expect(container).toBeTruthy() // Component rendered successfully
  })
})