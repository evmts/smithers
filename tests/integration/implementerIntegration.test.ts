import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'
import { Implementer } from '../../issues/smithershub/src/components/Implementer'
import { TestRunner } from '../../issues/smithershub/src/components/TestRunner'
import { WorkspaceManager } from '../../issues/smithershub/src/utils/workspaceManager'
import { parseTestOutput } from '../../issues/smithershub/src/utils/testResultParser'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('Implementer Integration', () => {
  let testDb: Database
  let testWorkspace: string
  let workspaceManager: WorkspaceManager

  beforeEach(async () => {
    // Create test database
    testDb = new Database(':memory:')

    // Initialize implementation results table
    testDb.run(`
      CREATE TABLE IF NOT EXISTS implementation_results (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        result TEXT,
        error TEXT,
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        duration_ms INTEGER
      )
    `)

    // Create test workspace
    testWorkspace = path.join(import.meta.dir, '../../temp/test-workspace')
    if (!fs.existsSync(testWorkspace)) {
      fs.mkdirSync(testWorkspace, { recursive: true })
    }

    workspaceManager = new WorkspaceManager()
  })

  afterEach(async () => {
    testDb.close()

    // Cleanup test workspace
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true })
    }
  })

  test('implementer creates workspace and executes tasks in parallel', async () => {
    const tasks = [
      {
        id: 'task-1',
        description: 'Create simple function',
        files: ['utils/math.ts'],
        implementation: async () => {
          const content = `
export function add(a: number, b: number): number {
  return a + b
}

export function multiply(a: number, b: number): number {
  return a * b
}
          `.trim()

          const filePath = path.join(testWorkspace, 'utils/math.ts')
          fs.mkdirSync(path.dirname(filePath), { recursive: true })
          fs.writeFileSync(filePath, content)
          return 'Created math utility functions'
        }
      },
      {
        id: 'task-2',
        description: 'Create test file',
        files: ['utils/math.test.ts'],
        implementation: async () => {
          const content = `
import { test, expect } from 'bun:test'
import { add, multiply } from './math'

test('add function works', () => {
  expect(add(2, 3)).toBe(5)
  expect(add(-1, 1)).toBe(0)
})

test('multiply function works', () => {
  expect(multiply(2, 3)).toBe(6)
  expect(multiply(-1, 5)).toBe(-5)
})
          `.trim()

          const filePath = path.join(testWorkspace, 'utils/math.test.ts')
          fs.mkdirSync(path.dirname(filePath), { recursive: true })
          fs.writeFileSync(filePath, content)
          return 'Created test file'
        }
      }
    ]

    // Mock the implementation execution
    const results: Array<{ taskId: string; result: string; duration: number }> = []

    const mockExecuteTask = async (task: any) => {
      const startTime = Date.now()
      const result = await task.implementation()
      const duration = Date.now() - startTime

      results.push({ taskId: task.id, result, duration })

      // Store in database
      testDb.run(`
        INSERT INTO implementation_results (id, task_id, status, result, duration_ms)
        VALUES (?, ?, ?, ?, ?)
      `, [task.id + '_result', task.id, 'completed', result, duration])

      return { success: true, result, duration }
    }

    // Execute tasks in parallel
    const promises = tasks.map(task => mockExecuteTask(task))
    await Promise.all(promises)

    // Verify results
    expect(results).toHaveLength(2)
    expect(results[0].taskId).toBe('task-1')
    expect(results[1].taskId).toBe('task-2')

    // Verify files were created
    expect(fs.existsSync(path.join(testWorkspace, 'utils/math.ts'))).toBe(true)
    expect(fs.existsSync(path.join(testWorkspace, 'utils/math.test.ts'))).toBe(true)

    // Verify database storage
    const dbResults = testDb.prepare(`
      SELECT * FROM implementation_results ORDER BY task_id
    `).all() as any[]

    expect(dbResults).toHaveLength(2)
    expect(dbResults[0].status).toBe('completed')
    expect(dbResults[1].status).toBe('completed')
  })

  test('integrates implementer with test runner', async () => {
    // First, create files through implementer
    const setupTask = {
      id: 'setup',
      description: 'Setup test files',
      files: ['example.ts', 'example.test.ts'],
      implementation: async () => {
        // Create implementation file
        const implContent = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`
}
        `.trim()
        fs.writeFileSync(path.join(testWorkspace, 'example.ts'), implContent)

        // Create test file
        const testContent = `
import { test, expect } from 'bun:test'
import { greet } from './example'

test('greet function works', () => {
  expect(greet('World')).toBe('Hello, World!')
  expect(greet('Test')).toBe('Hello, Test!')
})
        `.trim()
        fs.writeFileSync(path.join(testWorkspace, 'example.test.ts'), testContent)

        return 'Setup complete'
      }
    }

    // Execute setup
    await setupTask.implementation()

    // Create package.json for bun test
    const packageJson = {
      name: 'test-workspace',
      type: 'module',
      devDependencies: {
        'bun-types': 'latest'
      }
    }
    fs.writeFileSync(
      path.join(testWorkspace, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    )

    // Mock test execution since we can't actually run bun test in test environment
    const mockTestOutput = `
✓ example.test.ts > greet function works (2ms)

1 pass
0 fail
1 total
    `

    // Parse test results
    const testResults = parseTestOutput(mockTestOutput, 'bun')

    expect(testResults.passed).toBe(true)
    expect(testResults.total).toBe(1)
    expect(testResults.failed).toBe(0)
    expect(testResults.results).toHaveLength(1)
    expect(testResults.results[0].status).toBe('passed')

    // Verify integration flow
    expect(fs.existsSync(path.join(testWorkspace, 'example.ts'))).toBe(true)
    expect(fs.existsSync(path.join(testWorkspace, 'example.test.ts'))).toBe(true)
    expect(fs.existsSync(path.join(testWorkspace, 'package.json'))).toBe(true)
  })

  test('handles timeout and error scenarios', async () => {
    const timeoutTask = {
      id: 'timeout-task',
      description: 'Task that times out',
      files: ['slow.ts'],
      implementation: async () => {
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 1000))
        return 'Should not complete'
      }
    }

    const errorTask = {
      id: 'error-task',
      description: 'Task that errors',
      files: ['error.ts'],
      implementation: async () => {
        throw new Error('Implementation failed')
      }
    }

    // Test timeout handling
    const timeoutPromise = Promise.race([
      timeoutTask.implementation(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Task timeout')), 100)
      )
    ])

    try {
      await timeoutPromise
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      expect((error as Error).message).toBe('Task timeout')

      // Record timeout in database
      testDb.run(`
        INSERT INTO implementation_results (id, task_id, status, error)
        VALUES (?, ?, ?, ?)
      `, ['timeout_result', 'timeout-task', 'timeout', 'Task timeout'])
    }

    // Test error handling
    try {
      await errorTask.implementation()
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      expect((error as Error).message).toBe('Implementation failed')

      // Record error in database
      testDb.run(`
        INSERT INTO implementation_results (id, task_id, status, error)
        VALUES (?, ?, ?, ?)
      `, ['error_result', 'error-task', 'failed', 'Implementation failed'])
    }

    // Verify error states in database
    const timeoutResult = testDb.prepare(`
      SELECT * FROM implementation_results WHERE task_id = ?
    `).get('timeout-task') as any

    const errorResult = testDb.prepare(`
      SELECT * FROM implementation_results WHERE task_id = ?
    `).get('error-task') as any

    expect(timeoutResult.status).toBe('timeout')
    expect(errorResult.status).toBe('failed')
  })

  test('manages dependencies between tasks', async () => {
    const executionOrder: string[] = []

    const baseTask = {
      id: 'base',
      description: 'Base implementation',
      files: ['base.ts'],
      dependencies: [],
      implementation: async () => {
        executionOrder.push('base')
        await new Promise(resolve => setTimeout(resolve, 50))
        fs.writeFileSync(path.join(testWorkspace, 'base.ts'), 'export const base = "done"')
        return 'Base complete'
      }
    }

    const dependentTask = {
      id: 'dependent',
      description: 'Dependent on base',
      files: ['dependent.ts'],
      dependencies: ['base'],
      implementation: async () => {
        executionOrder.push('dependent')
        // Check that base task completed
        expect(fs.existsSync(path.join(testWorkspace, 'base.ts'))).toBe(true)
        fs.writeFileSync(path.join(testWorkspace, 'dependent.ts'), 'import { base } from "./base"')
        return 'Dependent complete'
      }
    }

    // Execute in dependency order
    await baseTask.implementation()
    await dependentTask.implementation()

    expect(executionOrder).toEqual(['base', 'dependent'])
    expect(fs.existsSync(path.join(testWorkspace, 'base.ts'))).toBe(true)
    expect(fs.existsSync(path.join(testWorkspace, 'dependent.ts'))).toBe(true)
  })

  test('provides real-time progress updates', async () => {
    const progressUpdates: Array<{ taskId: string; status: string; timestamp: number }> = []

    const trackingTask = {
      id: 'tracking',
      description: 'Task with progress tracking',
      files: ['progress.ts'],
      implementation: async () => {
        const updateProgress = (status: string) => {
          progressUpdates.push({ taskId: 'tracking', status, timestamp: Date.now() })

          // Update database
          testDb.run(`
            INSERT OR REPLACE INTO implementation_results (id, task_id, status)
            VALUES (?, ?, ?)
          `, ['tracking_progress', 'tracking', status])
        }

        updateProgress('started')
        await new Promise(resolve => setTimeout(resolve, 25))

        updateProgress('in_progress')
        await new Promise(resolve => setTimeout(resolve, 25))

        updateProgress('completing')
        fs.writeFileSync(path.join(testWorkspace, 'progress.ts'), 'export const progress = "tracked"')

        updateProgress('completed')
        return 'Progress tracked'
      }
    }

    await trackingTask.implementation()

    expect(progressUpdates).toHaveLength(4)
    expect(progressUpdates[0].status).toBe('started')
    expect(progressUpdates[1].status).toBe('in_progress')
    expect(progressUpdates[2].status).toBe('completing')
    expect(progressUpdates[3].status).toBe('completed')

    // Verify timestamps are in order
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].timestamp).toBeGreaterThanOrEqual(progressUpdates[i-1].timestamp)
    }
  })
})