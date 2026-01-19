import type { ReactiveDatabase } from '../reactive-sqlite/index.js'

export interface VCSQueueItem {
  id: number
  operation: string
  payload: Record<string, unknown>
  status: string
  created_at: string
}

export interface VCSQueueModule {
  enqueue: (operation: string, payload: Record<string, unknown>) => number
  dequeue: () => VCSQueueItem | null
  complete: (id: number, error?: string) => void
  getPending: () => VCSQueueItem[]
}

interface VCSQueueModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createVCSQueueModule(ctx: VCSQueueModuleContext): VCSQueueModule {
  const { rdb, getCurrentExecutionId } = ctx

  return {
    enqueue(operation: string, payload: Record<string, unknown>): number {
      const executionId = getCurrentExecutionId()
      const result = rdb.run(
        `INSERT INTO vcs_queue (execution_id, operation, payload, status) VALUES (?, ?, ?, 'pending')`,
        [executionId, operation, JSON.stringify(payload)]
      )
      return Number(result.lastInsertRowid)
    },

    dequeue(): VCSQueueItem | null {
      const item = rdb.queryOne<{ id: number; operation: string; payload: string; status: string; created_at: string }>(
        `SELECT * FROM vcs_queue WHERE status = 'pending' ORDER BY id LIMIT 1`
      )
      if (!item) return null

      rdb.run(
        `UPDATE vcs_queue SET status = 'running', started_at = datetime('now') WHERE id = ?`,
        [item.id]
      )

      return {
        ...item,
        payload: JSON.parse(item.payload) as Record<string, unknown>
      }
    },

    complete(id: number, error?: string): void {
      rdb.run(
        `UPDATE vcs_queue SET status = ?, completed_at = datetime('now'), error = ? WHERE id = ?`,
        [error ? 'failed' : 'done', error ?? null, id]
      )
    },

    getPending(): VCSQueueItem[] {
      return rdb.query<{ id: number; operation: string; payload: string; status: string; created_at: string }>(
        `SELECT * FROM vcs_queue WHERE status = 'pending' ORDER BY id`
      ).map(item => ({ ...item, payload: JSON.parse(item.payload) as Record<string, unknown> }))
    }
  }
}
