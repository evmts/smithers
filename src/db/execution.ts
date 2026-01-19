// Execution tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
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

interface ExecutionRow {
  id: string
  name: string | null
  file_path: string
  status: string
  config: string | null
  result: string | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  total_iterations: number
  total_agents: number
  total_tool_calls: number
  total_tokens_used: number
}

const mapExecution = (row: ExecutionRow | null): Execution | null => {
  if (!row) return null
  return {
    id: row.id,
    name: row.name ?? undefined,
    file_path: row.file_path,
    status: row.status as Execution['status'],
    config: parseJson(row.config, {}),
    result: row.result ? parseJson(row.result, undefined) : undefined,
    error: row.error ?? undefined,
    started_at: row.started_at ? new Date(row.started_at) : undefined,
    completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
    created_at: new Date(row.created_at),
    total_iterations: row.total_iterations,
    total_agents: row.total_agents,
    total_tool_calls: row.total_tool_calls,
    total_tokens_used: row.total_tokens_used,
  }
}

export function createExecutionModule(ctx: ExecutionModuleContext): ExecutionModule {
  const { rdb, getCurrentExecutionId, setCurrentExecutionId } = ctx

  const execution: ExecutionModule = {
    start: (name: string, filePath: string, config?: Record<string, any>): string => {
      if (rdb.isClosed) return uuid()
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
      if (rdb.isClosed) return
      rdb.run(
        `UPDATE executions SET status = 'completed', result = ?, completed_at = ? WHERE id = ?`,
        [result ? JSON.stringify(result) : null, now(), id]
      )
      if (getCurrentExecutionId() === id) setCurrentExecutionId(null)
    },

    fail: (id: string, error: string) => {
      if (rdb.isClosed) return
      rdb.run(
        `UPDATE executions SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
        [error, now(), id]
      )
      if (getCurrentExecutionId() === id) setCurrentExecutionId(null)
    },

    cancel: (id: string) => {
      if (rdb.isClosed) return
      rdb.run(
        `UPDATE executions SET status = 'cancelled', completed_at = ? WHERE id = ?`,
        [now(), id]
      )
      if (getCurrentExecutionId() === id) setCurrentExecutionId(null)
    },

    current: (): Execution | null => {
      if (rdb.isClosed) return null
      const currentId = getCurrentExecutionId()
      if (!currentId) return null
      return mapExecution(rdb.queryOne('SELECT * FROM executions WHERE id = ?', [currentId]))
    },

    get: (id: string): Execution | null => {
      if (rdb.isClosed) return null
      return mapExecution(rdb.queryOne('SELECT * FROM executions WHERE id = ?', [id]))
    },

    list: (limit: number = 20): Execution[] => {
      if (rdb.isClosed) return []
      return rdb.query<any>('SELECT * FROM executions ORDER BY created_at DESC LIMIT ?', [limit])
        .map(mapExecution)
        .filter((e): e is Execution => e !== null)
    },

    findIncomplete: (): Execution | null => {
      if (rdb.isClosed) return null
      return mapExecution(rdb.queryOne(
        "SELECT * FROM executions WHERE status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1"
      ))
    },
  }

  return execution
}
