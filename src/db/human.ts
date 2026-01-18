// Human interaction module
// Handles requests for human input/confirmation

import type { ReactiveDatabase } from '../reactive-sqlite'
import { uuid, now } from './utils.js'

export interface HumanInteraction {
  id: string
  execution_id: string
  type: string
  prompt: string
  options: string[] | null
  status: 'pending' | 'approved' | 'rejected' | 'timeout'
  response: any | null
  created_at: string
  resolved_at: string | null
}

export interface HumanModule {
  /**
   * Request human interaction
   */
  request: (type: string, prompt: string, options?: string[]) => string

  /**
   * Resolve a request (called by external harness)
   */
  resolve: (id: string, status: 'approved' | 'rejected', response?: unknown) => void

  /**
   * Get a request by ID
   */
  get: (id: string) => HumanInteraction | null

  /**
   * List pending requests
   */
  listPending: () => HumanInteraction[]
}

export interface HumanModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createHumanModule(ctx: HumanModuleContext): HumanModule {
  const { rdb, getCurrentExecutionId } = ctx

  return {
    request: (type: string, prompt: string, options: string[] = []): string => {
      const executionId = getCurrentExecutionId()
      if (!executionId) throw new Error('No active execution')

      const id = uuid()
      rdb.run(
        `INSERT INTO human_interactions (id, execution_id, type, prompt, options, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [id, executionId, type, prompt, JSON.stringify(options), now()]
      )
      return id
    },

    resolve: (id: string, status: 'approved' | 'rejected', response: unknown = null) => {
      rdb.run(
        `UPDATE human_interactions
         SET status = ?, response = ?, resolved_at = ?
         WHERE id = ?`,
        [status, JSON.stringify(response), now(), id]
      )
    },

    get: (id: string): HumanInteraction | null => {
      const row = rdb.queryOne<any>('SELECT * FROM human_interactions WHERE id = ?', [id])
      if (!row) return null
      return {
        ...row,
        options: row.options ? JSON.parse(row.options) : null,
        response: row.response ? JSON.parse(row.response) : null
      }
    },

    listPending: (): HumanInteraction[] => {
       const executionId = getCurrentExecutionId()
       if (!executionId) return []
       const rows = rdb.query<any>(
         "SELECT * FROM human_interactions WHERE execution_id = ? AND status = 'pending'",
         [executionId]
       )
       return rows.map(row => ({
         ...row,
          options: row.options ? JSON.parse(row.options) : null,
          response: row.response ? JSON.parse(row.response) : null
       }))
    }
  }
}
