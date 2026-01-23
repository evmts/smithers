/**
 * Unit tests for usePlannerResult hook
 * Tests planning execution state and error handling
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { usePlannerResult } from '../../src/hooks/usePlannerResult'

// Mock planning agent
class MockPlanningAgent {
  private shouldFail: boolean = false
  private delay: number = 100

  setShouldFail(fail: boolean) {
    this.shouldFail = fail
  }

  setDelay(ms: number) {
    this.delay = ms
  }

  async executePlan(plan: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, this.delay))

    if (this.shouldFail) {
      throw new Error('Planning execution failed')
    }

    return {
      id: `result-${Date.now()}`,
      status: 'completed',
      results: plan.tasks.map((task: any) => ({
        taskId: task.id,
        status: 'completed',
        output: `Completed ${task.title}`,
        executionTime: Math.floor(Math.random() * 1000) + 100
      })),
      summary: `Successfully executed ${plan.tasks.length} tasks`,
      metrics: {
        totalDuration: Math.floor(Math.random() * 5000) + 1000,
        tasksCompleted: plan.tasks.length,
        tasksError: 0,
        successRate: 1.0
      }
    }
  }
}

describe('usePlannerResult Hook', () => {
  let mockAgent: MockPlanningAgent

  beforeEach(() => {
    mockAgent = new MockPlanningAgent()
  })

  test('should initialize with idle state', () => {
    const hook = usePlannerResult()

    expect(hook.status).toBe('idle')
    expect(hook.result).toBeNull()
    expect(hook.error).toBeNull()
    expect(hook.isExecuting).toBe(false)
  })

  test('should execute planning successfully', async () => {
    const hook = usePlannerResult()

    const testPlan = {
      id: 'plan-1',
      title: 'Test Plan',
      tasks: [
        { id: 'task-1', title: 'First task', priority: 'high' },
        { id: 'task-2', title: 'Second task', priority: 'medium' }
      ]
    }

    const executionPromise = hook.executePlan(testPlan, {
      agent: mockAgent as any,
      timeout: 5000
    })

    expect(hook.status).toBe('executing')
    expect(hook.isExecuting).toBe(true)

    const result = await executionPromise

    expect(hook.status).toBe('completed')
    expect(hook.isExecuting).toBe(false)
    expect(result).toBeDefined()
    expect(result.status).toBe('completed')
    expect(result.results).toHaveLength(2)
  })

  test('should handle planning execution errors', async () => {
    const hook = usePlannerResult()
    mockAgent.setShouldFail(true)

    const testPlan = {
      id: 'plan-1',
      title: 'Failing Plan',
      tasks: [
        { id: 'task-1', title: 'Task that will fail', priority: 'high' }
      ]
    }

    await expect(hook.executePlan(testPlan, {
      agent: mockAgent as any,
      timeout: 5000
    })).rejects.toThrow('Planning execution failed')

    expect(hook.status).toBe('error')
    expect(hook.error).toContain('Planning execution failed')
    expect(hook.isExecuting).toBe(false)
  })

  test('should handle execution timeout', async () => {
    const hook = usePlannerResult()
    mockAgent.setDelay(3000) // 3 seconds delay

    const testPlan = {
      id: 'plan-1',
      title: 'Slow Plan',
      tasks: [
        { id: 'task-1', title: 'Slow task', priority: 'medium' }
      ]
    }

    await expect(hook.executePlan(testPlan, {
      agent: mockAgent as any,
      timeout: 1000 // 1 second timeout
    })).rejects.toThrow('Plan execution timeout')

    expect(hook.status).toBe('error')
    expect(hook.error).toContain('timeout')
  })

  test('should track execution progress', async () => {
    const hook = usePlannerResult()

    const testPlan = {
      id: 'plan-1',
      title: 'Progressive Plan',
      tasks: [
        { id: 'task-1', title: 'Task 1', priority: 'high' },
        { id: 'task-2', title: 'Task 2', priority: 'medium' },
        { id: 'task-3', title: 'Task 3', priority: 'low' }
      ]
    }

    const progressUpdates: any[] = []
    const executionPromise = hook.executePlan(testPlan, {
      agent: mockAgent as any,
      onProgress: (progress) => {
        progressUpdates.push(progress)
      }
    })

    expect(hook.progress.total).toBe(3)
    expect(hook.progress.completed).toBe(0)
    expect(hook.progress.current).toBeNull()

    await executionPromise

    expect(hook.progress.completed).toBe(3)
    expect(progressUpdates.length).toBeGreaterThan(0)
  })

  test('should support plan retry mechanism', async () => {
    const hook = usePlannerResult()
    let attemptCount = 0

    // Mock agent that fails first two times, succeeds third time
    const retryAgent = {
      async executePlan(plan: any) {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error(`Attempt ${attemptCount} failed`)
        }
        return mockAgent.executePlan(plan)
      }
    }

    const testPlan = {
      id: 'plan-1',
      title: 'Retry Plan',
      tasks: [
        { id: 'task-1', title: 'Retryable task', priority: 'high' }
      ]
    }

    const result = await hook.executePlan(testPlan, {
      agent: retryAgent as any,
      retries: 3,
      retryDelay: 100
    })

    expect(result.status).toBe('completed')
    expect(attemptCount).toBe(3)
    expect(hook.retryCount).toBe(2)
  })

  test('should validate plan before execution', async () => {
    const hook = usePlannerResult()

    // Invalid plan - no tasks
    const invalidPlan = {
      id: 'plan-1',
      title: 'Invalid Plan',
      tasks: []
    }

    await expect(hook.executePlan(invalidPlan, {
      agent: mockAgent as any
    })).rejects.toThrow('Plan must contain at least one task')

    expect(hook.status).toBe('error')
  })

  test('should handle concurrent executions', async () => {
    const hook = usePlannerResult()

    const plan1 = {
      id: 'plan-1',
      title: 'Plan 1',
      tasks: [{ id: 'task-1', title: 'Task 1', priority: 'high' }]
    }

    const plan2 = {
      id: 'plan-2',
      title: 'Plan 2',
      tasks: [{ id: 'task-2', title: 'Task 2', priority: 'medium' }]
    }

    // Start first execution
    const execution1Promise = hook.executePlan(plan1, {
      agent: mockAgent as any
    })

    // Try to start second execution while first is running
    await expect(hook.executePlan(plan2, {
      agent: mockAgent as any
    })).rejects.toThrow('Another plan execution is already in progress')

    await execution1Promise // Wait for first to complete
    expect(hook.status).toBe('completed')
  })

  test('should provide execution metrics', async () => {
    const hook = usePlannerResult()

    const testPlan = {
      id: 'plan-1',
      title: 'Metrics Plan',
      tasks: [
        { id: 'task-1', title: 'Task 1', priority: 'high' },
        { id: 'task-2', title: 'Task 2', priority: 'medium' },
        { id: 'task-3', title: 'Task 3', priority: 'low' }
      ]
    }

    const result = await hook.executePlan(testPlan, {
      agent: mockAgent as any,
      collectMetrics: true
    })

    expect(result.metrics).toBeDefined()
    expect(result.metrics.totalDuration).toBeGreaterThan(0)
    expect(result.metrics.tasksCompleted).toBe(3)
    expect(result.metrics.successRate).toBe(1.0)
  })

  test('should handle execution cancellation', async () => {
    const hook = usePlannerResult()
    mockAgent.setDelay(2000) // 2 second delay

    const testPlan = {
      id: 'plan-1',
      title: 'Cancellable Plan',
      tasks: [
        { id: 'task-1', title: 'Long running task', priority: 'medium' }
      ]
    }

    const executionPromise = hook.executePlan(testPlan, {
      agent: mockAgent as any
    })

    // Cancel after 100ms
    setTimeout(() => {
      hook.cancelExecution()
    }, 100)

    await expect(executionPromise).rejects.toThrow('Execution cancelled')
    expect(hook.status).toBe('cancelled')
  })

  test('should persist execution history', async () => {
    const hook = usePlannerResult()

    const testPlan = {
      id: 'plan-1',
      title: 'History Plan',
      tasks: [
        { id: 'task-1', title: 'Historical task', priority: 'medium' }
      ]
    }

    await hook.executePlan(testPlan, {
      agent: mockAgent as any,
      saveToHistory: true
    })

    const history = hook.getExecutionHistory()
    expect(history).toHaveLength(1)
    expect(history[0].planId).toBe('plan-1')
    expect(history[0].status).toBe('completed')
  })

  test('should handle partial execution failures', async () => {
    const hook = usePlannerResult()

    // Mock agent that fails on specific tasks
    const partialFailureAgent = {
      async executePlan(plan: any) {
        const results = plan.tasks.map((task: any, index: number) => ({
          taskId: task.id,
          status: index === 1 ? 'failed' : 'completed', // Fail second task
          output: index === 1 ? null : `Completed ${task.title}`,
          error: index === 1 ? 'Task execution failed' : null,
          executionTime: Math.floor(Math.random() * 1000) + 100
        }))

        return {
          id: `result-${Date.now()}`,
          status: 'partial_success',
          results,
          summary: 'Plan completed with some failures',
          metrics: {
            totalDuration: 2000,
            tasksCompleted: plan.tasks.length - 1,
            tasksError: 1,
            successRate: (plan.tasks.length - 1) / plan.tasks.length
          }
        }
      }
    }

    const testPlan = {
      id: 'plan-1',
      title: 'Partial Failure Plan',
      tasks: [
        { id: 'task-1', title: 'Task 1', priority: 'high' },
        { id: 'task-2', title: 'Failing Task', priority: 'medium' },
        { id: 'task-3', title: 'Task 3', priority: 'low' }
      ]
    }

    const result = await hook.executePlan(testPlan, {
      agent: partialFailureAgent as any,
      continueOnFailure: true
    })

    expect(result.status).toBe('partial_success')
    expect(result.metrics.tasksCompleted).toBe(2)
    expect(result.metrics.tasksError).toBe(1)
    expect(result.metrics.successRate).toBeCloseTo(0.67, 2)
  })

  test('should clean up resources on hook unmount', () => {
    const hook = usePlannerResult()

    // Mock cleanup
    const cleanupSpy = jest.fn()
    hook.onCleanup = cleanupSpy

    hook.cleanup?.()

    expect(cleanupSpy).toHaveBeenCalled()
  })
})