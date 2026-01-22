import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Phase } from './types.js'
import { uuid, now } from './utils.js'

export interface PhasesModule {
  start: (name: string, iteration?: number) => string
  complete: (id: string) => void
  fail: (id: string) => void
  current: () => Phase | null
  list: (executionId: string) => Phase[]
}

export interface PhasesModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
  getCurrentPhaseId: () => string | null
  setCurrentPhaseId: (id: string | null) => void
}

export function createPhasesModule(ctx: PhasesModuleContext): PhasesModule {
  const { rdb, getCurrentExecutionId, getCurrentPhaseId, setCurrentPhaseId } = ctx

  const phases: PhasesModule = {
    start: (name: string, iteration: number = 0): string => {
      if (rdb.isClosed) return uuid()
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO phases (id, execution_id, name, iteration, status, started_at, created_at)
         VALUES (?, ?, ?, ?, 'running', ?, ?)`,
        [id, currentExecutionId, name, iteration, now(), now()]
      )
      setCurrentPhaseId(id)
      return id
    },

    complete: (id: string) => {
      if (rdb.isClosed) return
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM phases WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      rdb.run(
        `UPDATE phases SET status = 'completed', completed_at = ?, duration_ms = ? WHERE id = ?`,
        [now(), durationMs, id]
      )
      if (getCurrentPhaseId() === id) setCurrentPhaseId(null)
    },

    fail: (id: string) => {
      if (rdb.isClosed) return
      rdb.run(`UPDATE phases SET status = 'failed', completed_at = ? WHERE id = ?`, [now(), id])
      if (getCurrentPhaseId() === id) setCurrentPhaseId(null)
    },

    current: (): Phase | null => {
      if (rdb.isClosed) return null
      const currentPhaseId = getCurrentPhaseId()
      if (!currentPhaseId) return null
      return rdb.queryOne('SELECT * FROM phases WHERE id = ?', [currentPhaseId])
    },

    list: (executionId: string): Phase[] => {
      if (rdb.isClosed) return []
      return rdb.query('SELECT * FROM phases WHERE execution_id = ? ORDER BY created_at', [executionId])
    },
  }

  return phases
}
