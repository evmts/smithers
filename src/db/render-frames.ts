// Render frames module for Smithers DB
// Stores snapshots of the SmithersNode tree for time-travel debugging

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, now } from './utils.js'

export interface RenderFrame {
  id: string
  execution_id: string
  sequence_number: number
  tree_xml: string
  ralph_count: number
  created_at: string
}

export interface RenderFramesModule {
  /**
   * Store a new render frame
   */
  store: (treeXml: string, ralphCount?: number) => string

  /**
   * Get a specific frame by ID
   */
  get: (id: string) => RenderFrame | null

  /**
   * Get frame by sequence number for current execution
   */
  getBySequence: (sequenceNumber: number) => RenderFrame | null

  /**
   * List all frames for current execution
   */
  list: () => RenderFrame[]

  /**
   * List frames for a specific execution
   */
  listForExecution: (executionId: string) => RenderFrame[]

  /**
   * Get the latest frame for current execution
   */
  latest: () => RenderFrame | null

  /**
   * Get frame count for current execution
   */
  count: () => number

  /**
   * Get next sequence number for current execution
   */
  nextSequence: () => number
}

export interface RenderFramesModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createRenderFramesModule(ctx: RenderFramesModuleContext): RenderFramesModule {
  const { rdb, getCurrentExecutionId } = ctx

  return {
    store: (treeXml: string, ralphCount: number = 0): string => {
      if (rdb.isClosed) return uuid()
      const executionId = getCurrentExecutionId()
      if (!executionId) throw new Error('No active execution')

      const id = uuid()
      const sequenceNumber = rdb.queryOne<{ next: number }>(
        'SELECT COALESCE(MAX(sequence_number), -1) + 1 as next FROM render_frames WHERE execution_id = ?',
        [executionId]
      )?.next ?? 0

      rdb.run(
        `INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, ralph_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, executionId, sequenceNumber, treeXml, ralphCount, now()]
      )
      return id
    },

    get: (id: string): RenderFrame | null => {
      if (rdb.isClosed) return null
      return rdb.queryOne<RenderFrame>('SELECT * FROM render_frames WHERE id = ?', [id])
    },

    getBySequence: (sequenceNumber: number): RenderFrame | null => {
      if (rdb.isClosed) return null
      const executionId = getCurrentExecutionId()
      if (!executionId) return null
      return rdb.queryOne<RenderFrame>(
        'SELECT * FROM render_frames WHERE execution_id = ? AND sequence_number = ?',
        [executionId, sequenceNumber]
      )
    },

    list: (): RenderFrame[] => {
      if (rdb.isClosed) return []
      const executionId = getCurrentExecutionId()
      if (!executionId) return []
      return rdb.query<RenderFrame>(
        'SELECT * FROM render_frames WHERE execution_id = ? ORDER BY sequence_number ASC',
        [executionId]
      )
    },

    listForExecution: (executionId: string): RenderFrame[] => {
      if (rdb.isClosed) return []
      return rdb.query<RenderFrame>(
        'SELECT * FROM render_frames WHERE execution_id = ? ORDER BY sequence_number ASC',
        [executionId]
      )
    },

    latest: (): RenderFrame | null => {
      if (rdb.isClosed) return null
      const executionId = getCurrentExecutionId()
      if (!executionId) return null
      return rdb.queryOne<RenderFrame>(
        'SELECT * FROM render_frames WHERE execution_id = ? ORDER BY sequence_number DESC LIMIT 1',
        [executionId]
      )
    },

    count: (): number => {
      if (rdb.isClosed) return 0
      const executionId = getCurrentExecutionId()
      if (!executionId) return 0
      return rdb.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM render_frames WHERE execution_id = ?',
        [executionId]
      )?.count ?? 0
    },

    nextSequence: (): number => {
      if (rdb.isClosed) return 0
      const executionId = getCurrentExecutionId()
      if (!executionId) return 0
      return rdb.queryOne<{ next: number }>(
        'SELECT COALESCE(MAX(sequence_number), -1) + 1 as next FROM render_frames WHERE execution_id = ?',
        [executionId]
      )?.next ?? 0
    }
  }
}
