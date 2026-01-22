import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, now, calcDuration } from './utils.js'

export interface Task {
  id: string
  execution_id: string
  iteration: number
  scope_id: string | null
  component_type: string
  component_name: string | null
  status: 'running' | 'completed' | 'failed'
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

export interface TasksModule {
  start: (componentType: string, componentName?: string, options?: { scopeId?: string | null }) => string
  complete: (id: string) => void
  fail: (id: string) => void
  getRunningCount: (iteration: number) => number
  getTotalCount: (iteration: number) => number
  list: () => Task[]
  getCurrentIteration: () => number
  withTask: <T>(
    componentType: string,
    componentName: string | undefined,
    options: { scopeId?: string | null } | undefined,
    fn: () => T | Promise<T>
  ) => Promise<T>
}

export interface TasksModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createTasksModule(ctx: TasksModuleContext): TasksModule {
  const { rdb, getCurrentExecutionId } = ctx

  const tasks: TasksModule = {
    start: (componentType: string, componentName?: string, options?: { scopeId?: string | null }): string => {
      if (rdb.isClosed) {
        return uuid()
      }
      const executionId = getCurrentExecutionId()
      if (!executionId) throw new Error('No active execution')

      // Get current iteration from state
      const iteration = tasks.getCurrentIteration()
      const scopeId = options?.scopeId ?? null

      const id = uuid()
      rdb.run(
        `INSERT INTO tasks (id, execution_id, iteration, scope_id, component_type, component_name, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
        [id, executionId, iteration, scopeId, componentType, componentName ?? null, now()]
      )
      return id
    },

    complete: (id: string) => {
      if (rdb.isClosed) return
      const durationMs = calcDuration(rdb, 'tasks', 'id', id)
      rdb.run(
        `UPDATE tasks SET status = 'completed', completed_at = ?, duration_ms = ? WHERE id = ?`,
        [now(), durationMs, id]
      )
    },

    fail: (id: string) => {
      if (rdb.isClosed) return
      const durationMs = calcDuration(rdb, 'tasks', 'id', id)
      rdb.run(
        `UPDATE tasks SET status = 'failed', completed_at = ?, duration_ms = ? WHERE id = ?`,
        [now(), durationMs, id]
      )
    },

    getRunningCount: (iteration: number): number => {
      if (rdb.isClosed) return 0
      const executionId = getCurrentExecutionId()
      if (!executionId) return 0

      const result = rdb.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ? AND status = 'running'`,
        [executionId, iteration]
      )
      return result?.count ?? 0
    },

    getTotalCount: (iteration: number): number => {
      if (rdb.isClosed) return 0
      const executionId = getCurrentExecutionId()
      if (!executionId) return 0

      const result = rdb.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ?`,
        [executionId, iteration]
      )
      return result?.count ?? 0
    },

    list: (): Task[] => {
      if (rdb.isClosed) return []
      const executionId = getCurrentExecutionId()
      if (!executionId) return []

      return rdb.query<Task>(
        'SELECT * FROM tasks WHERE execution_id = ? ORDER BY started_at',
        [executionId]
      )
    },

    getCurrentIteration: (): number => {
      if (rdb.isClosed) return 0
      const result = rdb.queryOne<{ value: string }>(
        "SELECT value FROM state WHERE key = 'ralphCount'"
      )
      if (!result?.value) return 0
      try { return JSON.parse(result.value) } catch { return 0 }
    },

    withTask: async <T>(
      componentType: string,
      componentName: string | undefined,
      options: { scopeId?: string | null } | undefined,
      fn: () => T | Promise<T>
    ): Promise<T> => {
      const taskId = tasks.start(componentType, componentName, options)
      try {
        const result = await fn()
        tasks.complete(taskId)
        return result
      } catch (error) {
        tasks.fail(taskId)
        throw new Error(`Task ${taskId} failed`, { cause: error })
      }
    },
  }

  return tasks
}
