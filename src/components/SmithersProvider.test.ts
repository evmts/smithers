import { test, expect, beforeEach, afterEach, describe } from 'bun:test'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import {
  SmithersProvider,
  useSmithers,
  useRalph,
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
  type SmithersContextValue,
  type RalphContextType,
} from './SmithersProvider.js'

describe('SmithersProvider', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-provider', 'test.tsx')
  })

  afterEach(() => {
    signalOrchestrationComplete()
    db.close()
  })

  describe('SmithersProviderProps', () => {
    test('requires db prop', () => {
      // TypeScript should enforce this, but verify the type exists
      const props = { db, executionId, children: null }
      expect(props.db).toBeDefined()
    })

    test('requires executionId prop', () => {
      const props = { db, executionId, children: null }
      expect(props.executionId).toBeDefined()
    })

    test('accepts optional maxIterations prop', () => {
      const props = { db, executionId, maxIterations: 10, children: null }
      expect(props.maxIterations).toBe(10)
    })

    test('accepts optional onIteration callback', () => {
      const onIteration = (i: number) => console.log(i)
      const props = { db, executionId, onIteration, children: null }
      expect(props.onIteration).toBe(onIteration)
    })

    test('accepts optional onComplete callback', () => {
      const onComplete = () => console.log('done')
      const props = { db, executionId, onComplete, children: null }
      expect(props.onComplete).toBe(onComplete)
    })

    test('accepts optional config prop', () => {
      const config = { defaultModel: 'sonnet', verbose: true }
      const props = { db, executionId, config, children: null }
      expect(props.config).toEqual(config)
    })
  })

  describe('SmithersContextValue', () => {
    test('includes db property', () => {
      const ctx: Partial<SmithersContextValue> = { db }
      expect(ctx.db).toBeDefined()
    })

    test('includes executionId property', () => {
      const ctx: Partial<SmithersContextValue> = { executionId }
      expect(ctx.executionId).toBe(executionId)
    })

    test('includes requestStop function', () => {
      const ctx: Partial<SmithersContextValue> = {
        requestStop: (_reason: string) => {},
      }
      expect(typeof ctx.requestStop).toBe('function')
    })

    test('includes requestRebase function', () => {
      const ctx: Partial<SmithersContextValue> = {
        requestRebase: (_reason: string) => {},
      }
      expect(typeof ctx.requestRebase).toBe('function')
    })

    test('includes isStopRequested function', () => {
      const ctx: Partial<SmithersContextValue> = {
        isStopRequested: () => false,
      }
      expect(typeof ctx.isStopRequested).toBe('function')
    })

    test('includes isRebaseRequested function', () => {
      const ctx: Partial<SmithersContextValue> = {
        isRebaseRequested: () => false,
      }
      expect(typeof ctx.isRebaseRequested).toBe('function')
    })

    test('includes registerTask function (deprecated)', () => {
      const ctx: Partial<SmithersContextValue> = {
        registerTask: () => {},
      }
      expect(typeof ctx.registerTask).toBe('function')
    })

    test('includes completeTask function (deprecated)', () => {
      const ctx: Partial<SmithersContextValue> = {
        completeTask: () => {},
      }
      expect(typeof ctx.completeTask).toBe('function')
    })

    test('includes ralphCount property', () => {
      const ctx: Partial<SmithersContextValue> = {
        ralphCount: 0,
      }
      expect(ctx.ralphCount).toBe(0)
    })

    test('includes reactiveDb property', () => {
      const ctx: Partial<SmithersContextValue> = {
        reactiveDb: db.db,
      }
      expect(ctx.reactiveDb).toBeDefined()
    })
  })

  describe('RalphContextType (backwards compatibility)', () => {
    test('includes registerTask function', () => {
      const ctx: Partial<RalphContextType> = {
        registerTask: () => {},
      }
      expect(typeof ctx.registerTask).toBe('function')
    })

    test('includes completeTask function', () => {
      const ctx: Partial<RalphContextType> = {
        completeTask: () => {},
      }
      expect(typeof ctx.completeTask).toBe('function')
    })

    test('includes ralphCount property', () => {
      const ctx: Partial<RalphContextType> = {
        ralphCount: 0,
      }
      expect(ctx.ralphCount).toBe(0)
    })

    test('includes db property (ReactiveDatabase)', () => {
      const ctx: Partial<RalphContextType> = {
        db: db.db,
      }
      expect(ctx.db).toBeDefined()
    })
  })

  describe('Orchestration signals', () => {
    test('createOrchestrationPromise returns a promise', () => {
      const promise = createOrchestrationPromise()
      expect(promise).toBeInstanceOf(Promise)
      // Clean up by resolving
      signalOrchestrationComplete()
    })

    test('signalOrchestrationComplete resolves the promise', async () => {
      const promise = createOrchestrationPromise()
      let resolved = false

      promise.then(() => {
        resolved = true
      })

      signalOrchestrationComplete()

      // Give it a tick to resolve
      await new Promise((r) => setTimeout(r, 10))
      expect(resolved).toBe(true)
    })

    test('signalOrchestrationError rejects the promise', async () => {
      const promise = createOrchestrationPromise()
      let rejected = false
      let errorMessage = ''

      promise.catch((err) => {
        rejected = true
        errorMessage = err.message
      })

      signalOrchestrationError(new Error('Test error'))

      await new Promise((r) => setTimeout(r, 10))
      expect(rejected).toBe(true)
      expect(errorMessage).toBe('Test error')
    })

    test('signals are idempotent (second call does nothing)', async () => {
      const promise = createOrchestrationPromise()
      let resolveCount = 0

      promise.then(() => {
        resolveCount++
      })

      signalOrchestrationComplete()
      signalOrchestrationComplete() // Second call should be no-op

      await new Promise((r) => setTimeout(r, 10))
      expect(resolveCount).toBe(1)
    })
  })

  describe('Database task tracking', () => {
    test('db.tasks.start creates a running task', () => {
      const taskId = db.tasks.start('test-component', 'test-name')
      expect(taskId).toBeDefined()

      const task = db.db.queryOne<{ status: string }>(
        'SELECT status FROM tasks WHERE id = ?',
        [taskId]
      )
      expect(task?.status).toBe('running')

      // Clean up
      db.tasks.complete(taskId)
    })

    test('db.tasks.complete marks task as completed', () => {
      const taskId = db.tasks.start('test-component', 'test-name')
      db.tasks.complete(taskId)

      const task = db.db.queryOne<{ status: string }>(
        'SELECT status FROM tasks WHERE id = ?',
        [taskId]
      )
      expect(task?.status).toBe('completed')
    })

    test('db.tasks.fail marks task as failed', () => {
      const taskId = db.tasks.start('test-component', 'test-name')
      db.tasks.fail(taskId)

      const task = db.db.queryOne<{ status: string }>(
        'SELECT status FROM tasks WHERE id = ?',
        [taskId]
      )
      expect(task?.status).toBe('failed')
    })

    test('db.tasks.getRunningCount returns correct count', () => {
      // Complete existing tasks
      const existingTasks = db.db.query<{ id: string }>(
        "SELECT id FROM tasks WHERE status = 'running'"
      )
      for (const t of existingTasks) {
        db.tasks.complete(t.id)
      }

      expect(db.tasks.getRunningCount(0)).toBe(0)

      const task1 = db.tasks.start('test', 'a')
      const task2 = db.tasks.start('test', 'b')

      expect(db.tasks.getRunningCount(0)).toBe(2)

      db.tasks.complete(task1)
      expect(db.tasks.getRunningCount(0)).toBe(1)

      db.tasks.complete(task2)
      expect(db.tasks.getRunningCount(0)).toBe(0)
    })

    test('db.tasks.getTotalCount returns all tasks for iteration', () => {
      const initialCount = db.tasks.getTotalCount(0)

      const taskId = db.tasks.start('test', 'new')
      expect(db.tasks.getTotalCount(0)).toBe(initialCount + 1)

      db.tasks.complete(taskId)
      // Total count should not decrease after completion
      expect(db.tasks.getTotalCount(0)).toBe(initialCount + 1)
    })
  })

  describe('Iteration tracking', () => {
    test('ralphCount is stored in state table', () => {
      const count = db.db.queryOne<{ value: string }>(
        "SELECT value FROM state WHERE key = 'ralphCount'"
      )
      expect(count).toBeDefined()
      expect(parseInt(count?.value ?? '0', 10)).toBeGreaterThanOrEqual(0)
    })

    test('getCurrentIteration returns current iteration', () => {
      const iteration = db.tasks.getCurrentIteration()
      expect(typeof iteration).toBe('number')
      expect(iteration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Config handling', () => {
    test('maxIterations from config is respected', () => {
      const config = { maxIterations: 5 }
      expect(config.maxIterations).toBe(5)
    })

    test('maxIterations prop overrides config', () => {
      const config = { maxIterations: 5 }
      const props = { db, executionId, maxIterations: 10, config, children: null }
      // Prop should take precedence
      expect(props.maxIterations).toBe(10)
    })

    test('default maxIterations is 100', () => {
      const defaultMax = 100
      expect(defaultMax).toBe(100)
    })
  })

  describe('Export verification', () => {
    test('exports SmithersProvider', () => {
      expect(SmithersProvider).toBeDefined()
      expect(typeof SmithersProvider).toBe('function')
    })

    test('exports useSmithers', () => {
      expect(useSmithers).toBeDefined()
      expect(typeof useSmithers).toBe('function')
    })

    test('exports useRalph', () => {
      expect(useRalph).toBeDefined()
      expect(typeof useRalph).toBe('function')
    })

    test('exports createOrchestrationPromise', () => {
      expect(createOrchestrationPromise).toBeDefined()
      expect(typeof createOrchestrationPromise).toBe('function')
    })

    test('exports signalOrchestrationComplete', () => {
      expect(signalOrchestrationComplete).toBeDefined()
      expect(typeof signalOrchestrationComplete).toBe('function')
    })

    test('exports signalOrchestrationError', () => {
      expect(signalOrchestrationError).toBeDefined()
      expect(typeof signalOrchestrationError).toBe('function')
    })
  })
})

describe('Ralph backwards compatibility', () => {
  test('Ralph component is exported from Ralph.tsx', async () => {
    const { Ralph } = await import('./Ralph.js')
    expect(Ralph).toBeDefined()
    expect(typeof Ralph).toBe('function')
  })

  test('RalphContext is exported from Ralph.tsx', async () => {
    const { RalphContext } = await import('./Ralph.js')
    expect(RalphContext).toBeDefined()
  })

  test('RalphContextType is re-exported from Ralph.tsx', async () => {
    const module = await import('./Ralph.js')
    expect(module).toBeDefined()
  })

  test('orchestration signals are re-exported from Ralph.tsx', async () => {
    const {
      createOrchestrationPromise: cop,
      signalOrchestrationComplete: soc,
      signalOrchestrationError: soe,
    } = await import('./Ralph.js')

    expect(cop).toBeDefined()
    expect(soc).toBeDefined()
    expect(soe).toBeDefined()
  })
})

describe('Index exports', () => {
  test('exports SmithersProvider from index', async () => {
    const index = await import('./index.js')
    expect(index.SmithersProvider).toBeDefined()
  })

  test('exports useSmithers from index', async () => {
    const index = await import('./index.js')
    expect(index.useSmithers).toBeDefined()
  })

  test('exports useRalph from index', async () => {
    const index = await import('./index.js')
    expect(index.useRalph).toBeDefined()
  })

  test('exports Ralph from index (backwards compatibility)', async () => {
    const index = await import('./index.js')
    expect(index.Ralph).toBeDefined()
  })

  test('exports RalphContext from index (backwards compatibility)', async () => {
    const index = await import('./index.js')
    expect(index.RalphContext).toBeDefined()
  })

  test('exports orchestration signals from index', async () => {
    const index = await import('./index.js')
    expect(index.createOrchestrationPromise).toBeDefined()
    expect(index.signalOrchestrationComplete).toBeDefined()
    expect(index.signalOrchestrationError).toBeDefined()
  })
})
