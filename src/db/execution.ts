// Execution tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite'
import type { Execution } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface ExecutionModule {
  start: (name: string, filePath: string, config?: Record<string, any>) => string
  complete: (id: string, result?: Record<string, any>) => void
  fail: (id: string, error: string) => void
  cancel: (id: string) => void
  current: () => Execution | null
  get: (id: string) => Execution | null
  list: (limit?: number) => Execution[]
  findIncomplete: () => Execution | null
}

export interface ExecutionModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
  setCurrentExecutionId: (id: string | null) => void
}

// Helper to map row to typed object with JSON parsing
const mapExecution = (row: any): Execution | null => {
  if (!row) return null
  return {
    ...row,
    config: parseJson(row.config, {}),
    result: parseJson(row.result, undefined),
  }
}

export function createExecutionModule(ctx: ExecutionModuleContext): ExecutionModule {
  const { rdb, getCurrentExecutionId, setCurrentExecutionId } = ctx

  const execution: ExecutionModule = {
    start: (name: string, filePath: string, config?: Record<string, any>): string => {
      const id = uuid()
      rdb.run(
        `INSERT INTO executions (id, name, file_path, status, config, started_at, created_at)
         VALUES (?, ?, ?, 'running', ?, ?, ?)`,
        [id, name, filePath, JSON.stringify(config ?? {}), now(), now()]
      )
      setCurrentExecutionId(id)
      return id
    },

    complete: (id: string, result?: Record<string, any>) => {
      rdb.run(
        `UPDATE executions SET status = 'completed', result = ?, completed_at = ? WHERE id = ?`,
        [result ? JSON.stringify(result) : null, now(), id]
      )
      if (getCurrentExecutionId() === id) setCurrentExecutionId(null)
    },

    fail: (id: string, error: string) => {
      rdb.run(
        `UPDATE executions SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
        [error, now(), id]
      )
      if (getCurrentExecutionId() === id) setCurrentExecutionId(null)
    },

    cancel: (id: string) => {
      rdb.run(
        `UPDATE executions SET status = 'cancelled', completed_at = ? WHERE id = ?`,
        [now(), id]
      )
      if (getCurrentExecutionId() === id) setCurrentExecutionId(null)
    },

    current: (): Execution | null => {
      const currentId = getCurrentExecutionId()
      if (!currentId) return null
      return mapExecution(rdb.queryOne('SELECT * FROM executions WHERE id = ?', [currentId]))
    },

    get: (id: string): Execution | null => {
      return mapExecution(rdb.queryOne('SELECT * FROM executions WHERE id = ?', [id]))
    },

    list: (limit: number = 20): Execution[] => {
      return rdb.query<any>('SELECT * FROM executions ORDER BY created_at DESC LIMIT ?', [limit])
        .map(mapExecution)
        .filter((e): e is Execution => e !== null)
    },

    findIncomplete: (): Execution | null => {
      return mapExecution(rdb.queryOne(
        "SELECT * FROM executions WHERE status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1"
      ))
    },
  }

  return execution
}
