// Task tracking module for Ralph iteration management
// Replaces React state-based task tracking with database-backed tracking

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, now, parseJson } from './utils.js'

export interface Task {
  id: string
  execution_id: string
  iteration: number
  component_type: string
  component_name: string | null
  status: 'running' | 'completed' | 'failed'
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

export interface TasksModule {
  /**
   * Start a new task and return its ID.
   * Replaces registerTask() in RalphContext.
   */
  start: (componentType: string, componentName?: string) => string

  /**
   * Complete a task by ID.
   * Replaces completeTask() in RalphContext.
   */
  complete: (id: string) => void

  /**
   * Mark a task as failed.
   */
  fail: (id: string) => void

  /**
   * Get count of running tasks for a specific iteration.
   */
  getRunningCount: (iteration: number) => number

  /**
   * Get count of all tasks for a specific iteration.
   */
  getTotalCount: (iteration: number) => number

  /**
   * Get all tasks for the current execution.
   */
  list: () => Task[]

  /**
   * Get current iteration from the state table.
   */
  getCurrentIteration: () => number
}

export interface TasksModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createTasksModule(ctx: TasksModuleContext): TasksModule {
  const { rdb, getCurrentExecutionId } = ctx

  const tasks: TasksModule = {
    start: (componentType: string, componentName?: string): string => {
      if (rdb.isClosed) {
        return uuid()
      }
      const executionId = getCurrentExecutionId()
      if (!executionId) throw new Error('No active execution')

      // Get current iteration from state
      const iteration = tasks.getCurrentIteration()

      const id = uuid()
      rdb.run(
        `INSERT INTO tasks (id, execution_id, iteration, component_type, component_name, status, started_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?)`,
        [id, executionId, iteration, componentType, componentName ?? null, now()]
      )
      return id
    },

    complete: (id: string) => {
      if (rdb.isClosed) return
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM tasks WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      rdb.run(
        `UPDATE tasks SET status = 'completed', completed_at = ?, duration_ms = ? WHERE id = ?`,
        [now(), durationMs, id]
      )
    },

    fail: (id: string) => {
      if (rdb.isClosed) return
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM tasks WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
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
      return parseJson(result?.value, 0)
    },
  }

  return tasks
}
