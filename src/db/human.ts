// Human interaction module
// Handles requests for human input/confirmation

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, now } from './utils.js'

export type HumanInteractionType =
  | 'confirmation'
  | 'select'
  | 'input'
  | 'text'
  | 'interactive_session'

export type HumanInteractionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'timeout'
  | 'cancelled'
  | 'completed'
  | 'failed'

export interface InteractiveOutcomeSchema {
  type: 'approval' | 'selection' | 'freeform' | 'structured'
  options?: string[]
  jsonSchema?: Record<string, unknown>
}

export interface InteractiveSessionConfig {
  systemPrompt?: string
  context?: Record<string, unknown>
  model?: string
  cwd?: string
  mcpConfig?: string
  timeout?: number
  outcomeSchema?: InteractiveOutcomeSchema
  captureTranscript?: boolean
  blockOrchestration?: boolean
}

/** Raw database row (JSON fields are strings). */
export interface HumanInteractionRow {
  id: string
  execution_id: string
  type: HumanInteractionType
  prompt: string
  options: string | null
  status: HumanInteractionStatus
  response: string | null
  created_at: string
  resolved_at: string | null
  session_config: string | null
  session_transcript: string | null
  session_duration: number | null
  error: string | null
}

export interface HumanInteraction {
  id: string
  execution_id: string
  type: HumanInteractionType
  prompt: string
  options: string[] | null
  status: HumanInteractionStatus
  response: any | null
  created_at: string
  resolved_at: string | null
  session_config?: InteractiveSessionConfig | null
  session_transcript?: string | null
  session_duration?: number | null
  error?: string | null
}

export interface HumanModule {
  /**
   * Request human interaction
   */
  request: (type: HumanInteractionType, prompt: string, options?: string[]) => string

  /**
   * Request an interactive Claude session
   */
  requestInteractive: (prompt: string, config: InteractiveSessionConfig) => string

  /**
   * Resolve a request (called by external harness)
   */
  resolve: (id: string, status: 'approved' | 'rejected', response?: unknown) => void

  /**
   * Complete an interactive session with lifecycle outcome
   */
  completeInteractive: (
    id: string,
    outcome: 'completed' | 'cancelled' | 'timeout' | 'failed',
    response: unknown,
    options?: {
      transcript?: string
      duration?: number
      error?: string
    }
  ) => void

  /**
   * Cancel a pending interactive session
   */
  cancelInteractive: (id: string) => void

  /**
   * Get a request by ID
   */
  get: (id: string) => HumanInteraction | null

  /**
   * List pending requests
   */
  listPending: (executionId?: string) => HumanInteraction[]
}

export interface HumanModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function parseHumanInteraction(row: HumanInteractionRow): HumanInteraction {
  return {
    ...row,
    options: row.options ? JSON.parse(row.options) : null,
    response: row.response ? JSON.parse(row.response) : null,
    session_config: row.session_config ? JSON.parse(row.session_config) : null,
  }
}

export function createHumanModule(ctx: HumanModuleContext): HumanModule {
  const { rdb, getCurrentExecutionId } = ctx

  return {
    request: (type: HumanInteractionType, prompt: string, options: string[] = []): string => {
      if (rdb.isClosed) return uuid()
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

    requestInteractive: (prompt: string, config: InteractiveSessionConfig): string => {
      if (rdb.isClosed) return uuid()
      const executionId = getCurrentExecutionId()
      if (!executionId) throw new Error('No active execution')

      const id = uuid()
      rdb.run(
        `INSERT INTO human_interactions
         (id, execution_id, type, prompt, options, status, session_config, created_at)
         VALUES (?, ?, 'interactive_session', ?, ?, 'pending', ?, ?)`,
        [id, executionId, prompt, null, JSON.stringify(config), now()]
      )
      return id
    },

    resolve: (id: string, status: 'approved' | 'rejected', response: unknown = null) => {
      if (rdb.isClosed) return
      rdb.run(
        `UPDATE human_interactions
         SET status = ?, response = ?, resolved_at = ?
         WHERE id = ?`,
        [status, JSON.stringify(response), now(), id]
      )
    },

    completeInteractive: (
      id: string,
      outcome: 'completed' | 'cancelled' | 'timeout' | 'failed',
      response: unknown,
      options?: {
        transcript?: string
        duration?: number
        error?: string
      }
    ) => {
      if (rdb.isClosed) return
      rdb.run(
        `UPDATE human_interactions
         SET status = ?, response = ?, session_transcript = ?,
             session_duration = ?, error = ?, resolved_at = ?
         WHERE id = ?`,
        [
          outcome,
          JSON.stringify(response),
          options?.transcript ?? null,
          options?.duration ?? null,
          options?.error ?? null,
          now(),
          id,
        ]
      )
    },

    cancelInteractive: (id: string) => {
      if (rdb.isClosed) return
      rdb.run(
        `UPDATE human_interactions
         SET status = 'cancelled', resolved_at = ?
         WHERE id = ? AND status = 'pending'`,
        [now(), id]
      )
    },

    get: (id: string): HumanInteraction | null => {
      if (rdb.isClosed) return null
      const row = rdb.queryOne<HumanInteractionRow>('SELECT * FROM human_interactions WHERE id = ?', [id])
      if (!row) return null
      return parseHumanInteraction(row)
    },

    listPending: (executionId?: string): HumanInteraction[] => {
      if (rdb.isClosed) return []
      const scopedExecutionId = executionId ?? getCurrentExecutionId()
      if (!scopedExecutionId) return []
      const rows = scopedExecutionId === '*'
        ? rdb.query<HumanInteractionRow>(
          "SELECT * FROM human_interactions WHERE status = 'pending'"
        )
        : rdb.query<HumanInteractionRow>(
          "SELECT * FROM human_interactions WHERE execution_id = ? AND status = 'pending'",
          [scopedExecutionId]
        )
      return rows.map((row) => parseHumanInteraction(row))
    }
  }
}
