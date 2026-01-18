// Step tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite'
import type { Step } from './types.js'
import { uuid, now } from './utils.js'

export interface StepsModule {
  start: (name?: string) => string
  complete: (id: string, vcsInfo?: { snapshot_before?: string; snapshot_after?: string; commit_created?: string }) => void
  fail: (id: string) => void
  current: () => Step | null
  list: (phaseId: string) => Step[]
  getByExecution: (executionId: string) => Step[]
}

export interface StepsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
  getCurrentPhaseId: () => string | null
  getCurrentStepId: () => string | null
  setCurrentStepId: (id: string | null) => void
}

export function createStepsModule(ctx: StepsModuleContext): StepsModule {
  const { rdb, getCurrentExecutionId, getCurrentPhaseId, getCurrentStepId, setCurrentStepId } = ctx

  const steps: StepsModule = {
    start: (name?: string): string => {
      const currentExecutionId = getCurrentExecutionId()
      const currentPhaseId = getCurrentPhaseId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO steps (id, execution_id, phase_id, name, status, started_at, created_at)
         VALUES (?, ?, ?, ?, 'running', ?, ?)`,
        [id, currentExecutionId, currentPhaseId, name ?? null, now(), now()]
      )
      setCurrentStepId(id)
      return id
    },

    complete: (id: string, vcsInfo?: { snapshot_before?: string; snapshot_after?: string; commit_created?: string }) => {
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM steps WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      rdb.run(
        `UPDATE steps SET status = 'completed', completed_at = ?, duration_ms = ?, snapshot_before = ?, snapshot_after = ?, commit_created = ? WHERE id = ?`,
        [now(), durationMs, vcsInfo?.snapshot_before ?? null, vcsInfo?.snapshot_after ?? null, vcsInfo?.commit_created ?? null, id]
      )
      if (getCurrentStepId() === id) setCurrentStepId(null)
    },

    fail: (id: string) => {
      rdb.run(`UPDATE steps SET status = 'failed', completed_at = ? WHERE id = ?`, [now(), id])
      if (getCurrentStepId() === id) setCurrentStepId(null)
    },

    current: (): Step | null => {
      const currentStepId = getCurrentStepId()
      if (!currentStepId) return null
      return rdb.queryOne('SELECT * FROM steps WHERE id = ?', [currentStepId])
    },

    list: (phaseId: string): Step[] => {
      return rdb.query('SELECT * FROM steps WHERE phase_id = ? ORDER BY created_at', [phaseId])
    },

    getByExecution: (executionId: string): Step[] => {
      return rdb.query('SELECT * FROM steps WHERE execution_id = ? ORDER BY created_at', [executionId])
    },
  }

  return steps
}
