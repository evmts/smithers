import { test, expect, beforeAll, afterAll, beforeEach, afterEach, describe } from 'bun:test'
import { createSmithersDB, type SmithersDB } from './index.js'

describe('Tasks module', () => {
  let db: SmithersDB
  let executionId: string

  beforeAll(async () => {
    db = await createSmithersDB({ reset: true })
    executionId = await db.execution.start('test-execution', 'test.tsx')
  })

  afterAll(() => {
    db.close()
  })

  describe('start()', () => {
    test('creates a task and returns an ID', () => {
      const taskId = db.tasks.start('claude', 'sonnet')
      expect(taskId).toBeDefined()
      expect(typeof taskId).toBe('string')
      expect(taskId.length).toBeGreaterThan(0)
    })

    test('returns unique IDs for multiple tasks', () => {
      const id1 = db.tasks.start('claude', 'a')
      const id2 = db.tasks.start('claude', 'b')
      const id3 = db.tasks.start('claude', 'c')
      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })

    test('creates task with running status', () => {
      const taskId = db.tasks.start('step', 'test-step')
      const task = db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId])
      expect(task!.status).toBe('running')
    })

    test('stores component_type correctly', () => {
      const taskId = db.tasks.start('my-component-type', 'name')
      const task = db.db.queryOne<{ component_type: string }>('SELECT component_type FROM tasks WHERE id = ?', [taskId])
      expect(task!.component_type).toBe('my-component-type')
    })

    test('stores component_name correctly', () => {
      const taskId = db.tasks.start('type', 'my-component-name')
      const task = db.db.queryOne<{ component_name: string }>('SELECT component_name FROM tasks WHERE id = ?', [taskId])
      expect(task!.component_name).toBe('my-component-name')
    })

    test('handles undefined component_name (stores null)', () => {
      const taskId = db.tasks.start('type-only')
      const task = db.db.queryOne<{ component_name: string | null }>('SELECT component_name FROM tasks WHERE id = ?', [taskId])
      expect(task!.component_name).toBeNull()
    })

    test('sets started_at timestamp', () => {
      const before = new Date().toISOString()
      const taskId = db.tasks.start('timed', 'task')
      const after = new Date().toISOString()
      const task = db.db.queryOne<{ started_at: string }>('SELECT started_at FROM tasks WHERE id = ?', [taskId])
      expect(task!.started_at).toBeDefined()
      expect(task!.started_at >= before.slice(0, 19)).toBe(true)
      expect(task!.started_at <= after.slice(0, 19) || task!.started_at.slice(0, 19) === after.slice(0, 19)).toBe(true)
    })

    test('associates task with current execution', () => {
      const taskId = db.tasks.start('exec-test', 'task')
      const task = db.db.queryOne<{ execution_id: string }>('SELECT execution_id FROM tasks WHERE id = ?', [taskId])
      expect(task!.execution_id).toBe(executionId)
    })

    test('uses current iteration from state', () => {
      db.state.set('ralphCount', 5)
      const taskId = db.tasks.start('iter-test', 'task')
      const task = db.db.queryOne<{ iteration: number }>('SELECT iteration FROM tasks WHERE id = ?', [taskId])
      expect(task!.iteration).toBe(5)
      db.state.set('ralphCount', 0)
    })

    test('completed_at is null on new task', () => {
      const taskId = db.tasks.start('new', 'task')
      const task = db.db.queryOne<{ completed_at: string | null }>('SELECT completed_at FROM tasks WHERE id = ?', [taskId])
      expect(task!.completed_at).toBeNull()
    })

    test('duration_ms is null on new task', () => {
      const taskId = db.tasks.start('new', 'dur')
      const task = db.db.queryOne<{ duration_ms: number | null }>('SELECT duration_ms FROM tasks WHERE id = ?', [taskId])
      expect(task!.duration_ms).toBeNull()
    })
  })

  describe('complete()', () => {
    test('marks task as completed', () => {
      const taskId = db.tasks.start('claude', 'opus')
      db.tasks.complete(taskId)
      const task = db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId])
      expect(task!.status).toBe('completed')
    })

    test('sets completed_at timestamp', () => {
      const taskId = db.tasks.start('comp', 'ts')
      db.tasks.complete(taskId)
      const task = db.db.queryOne<{ completed_at: string | null }>('SELECT completed_at FROM tasks WHERE id = ?', [taskId])
      expect(task!.completed_at).not.toBeNull()
    })

    test('calculates duration_ms', async () => {
      const taskId = db.tasks.start('duration', 'test')
      await Bun.sleep(50)
      db.tasks.complete(taskId)
      const task = db.db.queryOne<{ duration_ms: number | null }>('SELECT duration_ms FROM tasks WHERE id = ?', [taskId])
      expect(task!.duration_ms).not.toBeNull()
      expect(task!.duration_ms!).toBeGreaterThanOrEqual(40)
    })

    test('on non-existent task does not throw', () => {
      expect(() => db.tasks.complete('non-existent-id')).not.toThrow()
    })

    test('on non-existent task does not create a record', () => {
      db.tasks.complete('fake-id-1234')
      const task = db.db.queryOne<{ id: string }>('SELECT id FROM tasks WHERE id = ?', ['fake-id-1234'])
      expect(task).toBeNull()
    })

    test('re-completing already completed task updates timestamp', async () => {
      const taskId = db.tasks.start('recomp', 'test')
      db.tasks.complete(taskId)
      const first = db.db.queryOne<{ completed_at: string }>('SELECT completed_at FROM tasks WHERE id = ?', [taskId])
      await Bun.sleep(10)
      db.tasks.complete(taskId)
      const second = db.db.queryOne<{ completed_at: string }>('SELECT completed_at FROM tasks WHERE id = ?', [taskId])
      expect(second!.completed_at).not.toBe(first!.completed_at)
    })

    test('completing a failed task changes status to completed', () => {
      const taskId = db.tasks.start('fail-then-comp', 'test')
      db.tasks.fail(taskId)
      db.tasks.complete(taskId)
      const task = db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId])
      expect(task!.status).toBe('completed')
    })
  })

  describe('fail()', () => {
    test('marks task as failed', () => {
      const taskId = db.tasks.start('claude', 'haiku')
      db.tasks.fail(taskId)
      const task = db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId])
      expect(task!.status).toBe('failed')
    })

    test('sets completed_at timestamp', () => {
      const taskId = db.tasks.start('fail', 'ts')
      db.tasks.fail(taskId)
      const task = db.db.queryOne<{ completed_at: string | null }>('SELECT completed_at FROM tasks WHERE id = ?', [taskId])
      expect(task!.completed_at).not.toBeNull()
    })

    test('calculates duration_ms', async () => {
      const taskId = db.tasks.start('fail-dur', 'test')
      await Bun.sleep(50)
      db.tasks.fail(taskId)
      const task = db.db.queryOne<{ duration_ms: number | null }>('SELECT duration_ms FROM tasks WHERE id = ?', [taskId])
      expect(task!.duration_ms).not.toBeNull()
      expect(task!.duration_ms!).toBeGreaterThanOrEqual(40)
    })

    test('on non-existent task does not throw', () => {
      expect(() => db.tasks.fail('non-existent-fail-id')).not.toThrow()
    })

    test('re-failing already failed task updates timestamp', async () => {
      const taskId = db.tasks.start('refail', 'test')
      db.tasks.fail(taskId)
      const first = db.db.queryOne<{ completed_at: string }>('SELECT completed_at FROM tasks WHERE id = ?', [taskId])
      await Bun.sleep(10)
      db.tasks.fail(taskId)
      const second = db.db.queryOne<{ completed_at: string }>('SELECT completed_at FROM tasks WHERE id = ?', [taskId])
      expect(second!.completed_at).not.toBe(first!.completed_at)
    })

    test('failing a completed task changes status to failed', () => {
      const taskId = db.tasks.start('comp-then-fail', 'test')
      db.tasks.complete(taskId)
      db.tasks.fail(taskId)
      const task = db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId])
      expect(task!.status).toBe('failed')
    })
  })

  describe('getRunningCount()', () => {
    test('returns 0 when no running tasks for iteration', () => {
      const count = db.tasks.getRunningCount(999)
      expect(count).toBe(0)
    })

    test('counts only running tasks', () => {
      db.state.set('ralphCount', 100)
      const id1 = db.tasks.start('run', 'a')
      db.tasks.start('run', 'b')
      db.tasks.start('run', 'c')
      db.tasks.complete(id1)
      const count = db.tasks.getRunningCount(100)
      expect(count).toBe(2)
      db.state.set('ralphCount', 0)
    })

    test('filters by iteration', () => {
      db.state.set('ralphCount', 200)
      db.tasks.start('iter200', 'a')
      db.state.set('ralphCount', 201)
      db.tasks.start('iter201', 'b')
      expect(db.tasks.getRunningCount(200)).toBe(1)
      expect(db.tasks.getRunningCount(201)).toBe(1)
      db.state.set('ralphCount', 0)
    })

    test('excludes completed tasks', () => {
      db.state.set('ralphCount', 300)
      const id = db.tasks.start('excl', 'a')
      expect(db.tasks.getRunningCount(300)).toBe(1)
      db.tasks.complete(id)
      expect(db.tasks.getRunningCount(300)).toBe(0)
      db.state.set('ralphCount', 0)
    })

    test('excludes failed tasks', () => {
      db.state.set('ralphCount', 301)
      const id = db.tasks.start('excl-fail', 'a')
      expect(db.tasks.getRunningCount(301)).toBe(1)
      db.tasks.fail(id)
      expect(db.tasks.getRunningCount(301)).toBe(0)
      db.state.set('ralphCount', 0)
    })
  })

  describe('getTotalCount()', () => {
    test('returns 0 for iteration with no tasks', () => {
      const count = db.tasks.getTotalCount(888)
      expect(count).toBe(0)
    })

    test('counts all tasks regardless of status', () => {
      db.state.set('ralphCount', 400)
      const id1 = db.tasks.start('tot', 'a')
      const id2 = db.tasks.start('tot', 'b')
      db.tasks.start('tot', 'c')
      db.tasks.complete(id1)
      db.tasks.fail(id2)
      const count = db.tasks.getTotalCount(400)
      expect(count).toBe(3)
      db.state.set('ralphCount', 0)
    })

    test('filters by iteration', () => {
      db.state.set('ralphCount', 500)
      db.tasks.start('tot500', 'a')
      db.tasks.start('tot500', 'b')
      db.state.set('ralphCount', 501)
      db.tasks.start('tot501', 'c')
      expect(db.tasks.getTotalCount(500)).toBe(2)
      expect(db.tasks.getTotalCount(501)).toBe(1)
      db.state.set('ralphCount', 0)
    })
  })

  describe('list()', () => {
    test('returns array', () => {
      const tasks = db.tasks.list()
      expect(Array.isArray(tasks)).toBe(true)
    })

    test('returns tasks for current execution only', () => {
      const tasks = db.tasks.list()
      for (const t of tasks) {
        expect(t.execution_id).toBe(executionId)
      }
    })

    test('includes all required fields', () => {
      db.tasks.start('list-test', 'field-check')
      const tasks = db.tasks.list()
      const task = tasks.find(t => t.component_type === 'list-test')
      expect(task).toBeDefined()
      expect(task).toHaveProperty('id')
      expect(task).toHaveProperty('execution_id')
      expect(task).toHaveProperty('iteration')
      expect(task).toHaveProperty('component_type')
      expect(task).toHaveProperty('component_name')
      expect(task).toHaveProperty('status')
      expect(task).toHaveProperty('started_at')
      expect(task).toHaveProperty('completed_at')
      expect(task).toHaveProperty('duration_ms')
    })

    test('orders by started_at', () => {
      const tasks = db.tasks.list()
      for (let i = 1; i < tasks.length; i++) {
        expect(tasks[i].started_at >= tasks[i - 1].started_at).toBe(true)
      }
    })

    test('includes running, completed, and failed tasks', () => {
      const runId = db.tasks.start('list-mix', 'running')
      const compId = db.tasks.start('list-mix', 'completed')
      const failId = db.tasks.start('list-mix', 'failed')
      db.tasks.complete(compId)
      db.tasks.fail(failId)
      const tasks = db.tasks.list()
      const running = tasks.find(t => t.id === runId)
      const completed = tasks.find(t => t.id === compId)
      const failed = tasks.find(t => t.id === failId)
      expect(running?.status).toBe('running')
      expect(completed?.status).toBe('completed')
      expect(failed?.status).toBe('failed')
    })
  })

  describe('getCurrentIteration()', () => {
    test('returns number', () => {
      const iteration = db.tasks.getCurrentIteration()
      expect(typeof iteration).toBe('number')
    })

    test('returns 0 when ralphCount not set', () => {
      db.db.run("DELETE FROM state WHERE key = 'ralphCount'")
      const iteration = db.tasks.getCurrentIteration()
      expect(iteration).toBe(0)
      db.state.set('ralphCount', 0)
    })

    test('reflects state changes', () => {
      db.state.set('ralphCount', 42)
      expect(db.tasks.getCurrentIteration()).toBe(42)
      db.state.set('ralphCount', 100)
      expect(db.tasks.getCurrentIteration()).toBe(100)
      db.state.set('ralphCount', 0)
    })
  })

  describe('Task duration calculation', () => {
    test('duration_ms is difference between completed_at and started_at', async () => {
      const taskId = db.tasks.start('dur-calc', 'test')
      await Bun.sleep(100)
      db.tasks.complete(taskId)
      const task = db.db.queryOne<{ duration_ms: number }>('SELECT duration_ms FROM tasks WHERE id = ?', [taskId])
      expect(task!.duration_ms).toBeGreaterThanOrEqual(90)
      expect(task!.duration_ms).toBeLessThan(500)
    })

    test('fail() also calculates duration', async () => {
      const taskId = db.tasks.start('dur-fail', 'test')
      await Bun.sleep(100)
      db.tasks.fail(taskId)
      const task = db.db.queryOne<{ duration_ms: number }>('SELECT duration_ms FROM tasks WHERE id = ?', [taskId])
      expect(task!.duration_ms).toBeGreaterThanOrEqual(90)
      expect(task!.duration_ms).toBeLessThan(500)
    })
  })

  describe('Concurrent task operations', () => {
    test('multiple tasks can run concurrently', () => {
      const ids = []
      for (let i = 0; i < 10; i++) {
        ids.push(db.tasks.start('concurrent', `task-${i}`))
      }
      const running = db.db.query<{ id: string }>("SELECT id FROM tasks WHERE component_type = 'concurrent' AND status = 'running'")
      expect(running.length).toBe(10)
      for (const id of ids) {
        db.tasks.complete(id)
      }
    })

    test('completing tasks in different order', () => {
      const id1 = db.tasks.start('order', 'first')
      const id2 = db.tasks.start('order', 'second')
      const id3 = db.tasks.start('order', 'third')
      db.tasks.complete(id2)
      db.tasks.complete(id3)
      db.tasks.complete(id1)
      const tasks = db.db.query<{ id: string; status: string }>("SELECT id, status FROM tasks WHERE component_type = 'order'")
      for (const t of tasks) {
        expect(t.status).toBe('completed')
      }
    })

    test('mixed complete and fail on concurrent tasks', () => {
      const id1 = db.tasks.start('mixed', 'a')
      const id2 = db.tasks.start('mixed', 'b')
      const id3 = db.tasks.start('mixed', 'c')
      db.tasks.complete(id1)
      db.tasks.fail(id2)
      const t1 = db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [id1])
      const t2 = db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [id2])
      const t3 = db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [id3])
      expect(t1!.status).toBe('completed')
      expect(t2!.status).toBe('failed')
      expect(t3!.status).toBe('running')
    })
  })

  describe('Task lifecycle transitions', () => {
    test('running -> completed', () => {
      const id = db.tasks.start('lc', 'rc')
      expect(db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [id])!.status).toBe('running')
      db.tasks.complete(id)
      expect(db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [id])!.status).toBe('completed')
    })

    test('running -> failed', () => {
      const id = db.tasks.start('lc', 'rf')
      expect(db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [id])!.status).toBe('running')
      db.tasks.fail(id)
      expect(db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [id])!.status).toBe('failed')
    })

    test('completed -> failed', () => {
      const id = db.tasks.start('lc', 'cf')
      db.tasks.complete(id)
      db.tasks.fail(id)
      expect(db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [id])!.status).toBe('failed')
    })

    test('failed -> completed', () => {
      const id = db.tasks.start('lc', 'fc')
      db.tasks.fail(id)
      db.tasks.complete(id)
      expect(db.db.queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [id])!.status).toBe('completed')
    })
  })

  describe('Edge cases', () => {
    test('empty component_type', () => {
      const id = db.tasks.start('', 'name')
      const task = db.db.queryOne<{ component_type: string }>('SELECT component_type FROM tasks WHERE id = ?', [id])
      expect(task!.component_type).toBe('')
    })

    test('empty component_name', () => {
      const id = db.tasks.start('type', '')
      const task = db.db.queryOne<{ component_name: string }>('SELECT component_name FROM tasks WHERE id = ?', [id])
      expect(task!.component_name).toBe('')
    })

    test('special characters in component_type', () => {
      const id = db.tasks.start('type-with-<>-&-"quotes"', 'name')
      const task = db.db.queryOne<{ component_type: string }>('SELECT component_type FROM tasks WHERE id = ?', [id])
      expect(task!.component_type).toBe('type-with-<>-&-"quotes"')
    })

    test('special characters in component_name', () => {
      const id = db.tasks.start('type', 'name-with-<>-&-"quotes"')
      const task = db.db.queryOne<{ component_name: string }>('SELECT component_name FROM tasks WHERE id = ?', [id])
      expect(task!.component_name).toBe('name-with-<>-&-"quotes"')
    })

    test('unicode in component_type', () => {
      const id = db.tasks.start('型式🚀', 'name')
      const task = db.db.queryOne<{ component_type: string }>('SELECT component_type FROM tasks WHERE id = ?', [id])
      expect(task!.component_type).toBe('型式🚀')
    })

    test('unicode in component_name', () => {
      const id = db.tasks.start('type', '名前🎉')
      const task = db.db.queryOne<{ component_name: string }>('SELECT component_name FROM tasks WHERE id = ?', [id])
      expect(task!.component_name).toBe('名前🎉')
    })

    test('very long component_type', () => {
      const longType = 'x'.repeat(10000)
      const id = db.tasks.start(longType, 'name')
      const task = db.db.queryOne<{ component_type: string }>('SELECT component_type FROM tasks WHERE id = ?', [id])
      expect(task!.component_type).toBe(longType)
    })

    test('very long component_name', () => {
      const longName = 'y'.repeat(10000)
      const id = db.tasks.start('type', longName)
      const task = db.db.queryOne<{ component_name: string }>('SELECT component_name FROM tasks WHERE id = ?', [id])
      expect(task!.component_name).toBe(longName)
    })
  })
})

describe('Tasks module - no execution context', () => {
  test('start() throws when no active execution', () => {
    const db = createSmithersDB({ reset: true })
    expect(() => db.tasks.start('test', 'task')).toThrow('No active execution')
    db.close()
  })

  test('getRunningCount() returns 0 when no active execution', () => {
    const db = createSmithersDB({ reset: true })
    expect(db.tasks.getRunningCount(0)).toBe(0)
    db.close()
  })

  test('getTotalCount() returns 0 when no active execution', () => {
    const db = createSmithersDB({ reset: true })
    expect(db.tasks.getTotalCount(0)).toBe(0)
    db.close()
  })

  test('list() returns empty array when no active execution', () => {
    const db = createSmithersDB({ reset: true })
    expect(db.tasks.list()).toEqual([])
    db.close()
  })
})

describe('Tasks module - closed database', () => {
  test('start() returns uuid when db closed', () => {
    const db = createSmithersDB({ reset: true })
    db.execution.start('exec', 'file.tsx')
    db.close()
    const id = db.tasks.start('test', 'task')
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  test('complete() does not throw when db closed', () => {
    const db = createSmithersDB({ reset: true })
    db.close()
    expect(() => db.tasks.complete('id')).not.toThrow()
  })

  test('fail() does not throw when db closed', () => {
    const db = createSmithersDB({ reset: true })
    db.close()
    expect(() => db.tasks.fail('id')).not.toThrow()
  })

  test('getRunningCount() returns 0 when db closed', () => {
    const db = createSmithersDB({ reset: true })
    db.close()
    expect(db.tasks.getRunningCount(0)).toBe(0)
  })

  test('getTotalCount() returns 0 when db closed', () => {
    const db = createSmithersDB({ reset: true })
    db.close()
    expect(db.tasks.getTotalCount(0)).toBe(0)
  })

  test('list() returns empty array when db closed', () => {
    const db = createSmithersDB({ reset: true })
    db.close()
    expect(db.tasks.list()).toEqual([])
  })

  test('getCurrentIteration() returns 0 when db closed', () => {
    const db = createSmithersDB({ reset: true })
    db.close()
    expect(db.tasks.getCurrentIteration()).toBe(0)
  })
})

describe('Tasks module - multiple executions', () => {
  test('tasks are scoped to their execution', () => {
    const db = createSmithersDB({ reset: true })
    const execId1 = db.execution.start('exec-1', 'file1.tsx')
    const id1 = db.tasks.start('type1', 'name1')
    const execId2 = db.execution.start('exec-2', 'file2.tsx')
    const id2 = db.tasks.start('type2', 'name2')
    const t1 = db.db.queryOne<{ execution_id: string }>('SELECT execution_id FROM tasks WHERE id = ?', [id1])
    const t2 = db.db.queryOne<{ execution_id: string }>('SELECT execution_id FROM tasks WHERE id = ?', [id2])
    expect(t1!.execution_id).toBe(execId1)
    expect(t2!.execution_id).toBe(execId2)
    const listed = db.tasks.list()
    expect(listed.every(t => t.execution_id === execId2)).toBe(true)
    db.close()
  })

  test('getRunningCount filters by current execution', () => {
    const db = createSmithersDB({ reset: true })
    db.execution.start('exec-a', 'a.tsx')
    db.tasks.start('type', 'a1')
    db.tasks.start('type', 'a2')
    db.execution.start('exec-b', 'b.tsx')
    db.tasks.start('type', 'b1')
    expect(db.tasks.getRunningCount(0)).toBe(1)
    db.close()
  })

  test('getTotalCount filters by current execution', () => {
    const db = createSmithersDB({ reset: true })
    db.execution.start('exec-x', 'x.tsx')
    db.tasks.start('type', 'x1')
    db.tasks.start('type', 'x2')
    db.tasks.start('type', 'x3')
    db.execution.start('exec-y', 'y.tsx')
    db.tasks.start('type', 'y1')
    expect(db.tasks.getTotalCount(0)).toBe(1)
    db.close()
  })
})
