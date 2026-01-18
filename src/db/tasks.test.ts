import { test, expect, beforeAll, afterAll, describe } from 'bun:test'
import { createSmithersDB, type SmithersDB } from './index'

describe('Tasks module', () => {
  let db: SmithersDB
  let executionId: string

  beforeAll(async () => {
    db = await createSmithersDB({ reset: true })
    // Start an execution to work with
    executionId = await db.execution.start('test-execution', 'test.tsx')
  })

  afterAll(() => {
    db.close()
  })

  test('start() creates a task and returns an ID', () => {
    const taskId = db.tasks.start('claude', 'sonnet')
    expect(taskId).toBeDefined()
    expect(typeof taskId).toBe('string')
    expect(taskId.length).toBeGreaterThan(0)
  })

  test('start() creates a task with correct status and iteration', () => {
    const taskId = db.tasks.start('step', 'test-step')

    // Query the task directly
    const task = db.db.queryOne<{
      id: string
      status: string
      component_type: string
      component_name: string
      iteration: number
    }>('SELECT id, status, component_type, component_name, iteration FROM tasks WHERE id = ?', [taskId])

    expect(task).toBeDefined()
    expect(task!.status).toBe('running')
    expect(task!.component_type).toBe('step')
    expect(task!.component_name).toBe('test-step')
    expect(task!.iteration).toBe(0) // ralphCount defaults to 0
  })

  test('complete() marks task as completed', () => {
    const taskId = db.tasks.start('claude', 'opus')
    db.tasks.complete(taskId)

    const task = db.db.queryOne<{
      status: string
      completed_at: string | null
    }>('SELECT status, completed_at FROM tasks WHERE id = ?', [taskId])

    expect(task!.status).toBe('completed')
    expect(task!.completed_at).not.toBeNull()
  })

  test('fail() marks task as failed', () => {
    const taskId = db.tasks.start('claude', 'haiku')
    db.tasks.fail(taskId)

    const task = db.db.queryOne<{
      status: string
      completed_at: string | null
    }>('SELECT status, completed_at FROM tasks WHERE id = ?', [taskId])

    expect(task!.status).toBe('failed')
    expect(task!.completed_at).not.toBeNull()
  })

  test('getRunningCount() returns count of running tasks', () => {
    // Complete all existing running tasks first
    const runningTasks = db.db.query<{ id: string }>("SELECT id FROM tasks WHERE status = 'running'")
    for (const t of runningTasks) {
      db.tasks.complete(t.id)
    }

    const initialCount = db.tasks.getRunningCount(0)
    expect(initialCount).toBe(0)

    // Start some new tasks
    db.tasks.start('test', 'a')
    db.tasks.start('test', 'b')
    const taskC = db.tasks.start('test', 'c')

    expect(db.tasks.getRunningCount(0)).toBe(3)

    // Complete one
    db.tasks.complete(taskC)
    expect(db.tasks.getRunningCount(0)).toBe(2)
  })

  test('getTotalCount() returns total tasks for iteration', () => {
    const initialCount = db.tasks.getTotalCount(0)

    db.tasks.start('new-task', 'x')

    expect(db.tasks.getTotalCount(0)).toBe(initialCount + 1)
  })

  test('list() returns all tasks for current execution', () => {
    const tasks = db.tasks.list()
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)

    // Check structure
    const task = tasks[0]
    expect(task).toHaveProperty('id')
    expect(task).toHaveProperty('status')
    expect(task).toHaveProperty('component_type')
    expect(task).toHaveProperty('iteration')
  })

  test('getCurrentIteration() returns current ralph count', () => {
    // Initially should be 0
    const iteration = db.tasks.getCurrentIteration()
    expect(typeof iteration).toBe('number')
    expect(iteration).toBeGreaterThanOrEqual(0)
  })
})
