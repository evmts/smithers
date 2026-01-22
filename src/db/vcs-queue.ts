import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { now, parseJson } from './utils.js'

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

interface VCSQueueRow {
  id: number
  operation: string
  payload: string
  status: string
  created_at: string
}

function mapQueueItem(item: VCSQueueRow): VCSQueueItem {
  return {
    id: item.id,
    operation: item.operation,
    payload: parseJson<Record<string, unknown>>(item.payload, {}),
    status: item.status,
    created_at: item.created_at,
  }
}

export function createVCSQueueModule(ctx: VCSQueueModuleContext): VCSQueueModule {
  const { rdb, getCurrentExecutionId } = ctx

  return {
    enqueue(operation: string, payload: Record<string, unknown>): number {
      if (rdb.isClosed) return -1
      const executionId = getCurrentExecutionId()
      const result = rdb.run(
        `INSERT INTO vcs_queue (execution_id, operation, payload, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
        [executionId, operation, JSON.stringify(payload), now()]
      )
      return Number(result.lastInsertRowid)
    },

    dequeue(): VCSQueueItem | null {
      if (rdb.isClosed) return null

      return rdb.transaction(() => {
        const item = rdb.queryOne<VCSQueueRow>(
          "SELECT * FROM vcs_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
        )
        if (!item) return null

        const updated = rdb.run(
          "UPDATE vcs_queue SET status = 'processing', started_at = ? WHERE id = ? AND status = 'pending'",
          [now(), item.id]
        )

        if (updated.changes === 0) return null

        return mapQueueItem(item)
      })
    },

    complete(id: number, error?: string): void {
      if (rdb.isClosed) return
      rdb.run(
        `UPDATE vcs_queue SET status = ?, completed_at = ?, error = ? WHERE id = ?`,
        [error ? 'failed' : 'done', now(), error ?? null, id]
      )
    },

    getPending(): VCSQueueItem[] {
      if (rdb.isClosed) return []
      return rdb.query<VCSQueueRow>(
        `SELECT * FROM vcs_queue WHERE status = 'pending' ORDER BY id`
      ).map(mapQueueItem)
    }
  }
}
