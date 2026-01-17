// State management layer - replaces Zustand
// ALL state lives in PGlite with full audit trail

import type { PGlite } from '@electric-sql/pglite'
import { QueryHelpers } from './live-query.js'
import type { StateEntry, Transition } from './types.js'

export class StateManager {
  private queries: QueryHelpers
  private currentExecutionId: string | null = null

  constructor(private pg: PGlite) {
    this.queries = new QueryHelpers(pg)
  }

  /**
   * Set the current execution ID for transition logging
   */
  setExecutionContext(executionId: string | null) {
    this.currentExecutionId = executionId
  }

  /**
   * Get a state value
   */
  async get<T>(key: string): Promise<T | null> {
    const result = await this.queries.queryOne<StateEntry>(
      `SELECT key, value, updated_at FROM state WHERE key = $1`,
      [key]
    )

    if (!result) return null

    // JSONB columns return already-parsed values, no need to JSON.parse
    return result.value as T
  }

  /**
   * Get all state as an object
   */
  async getAll(): Promise<Record<string, any>> {
    const rows = await this.queries.query<StateEntry>(
      `SELECT key, value FROM state`
    )

    const state: Record<string, any> = {}
    for (const row of rows) {
      // JSONB columns return already-parsed values
      state[row.key] = row.value
    }

    return state
  }

  /**
   * Set a state value with transition logging
   */
  async set<T>(
    key: string,
    value: T,
    trigger?: string,
    triggerAgentId?: string
  ): Promise<void> {
    // Get old value for transition log
    const oldValue = await this.get(key)

    // Update state
    await this.pg.query(
      `INSERT INTO state (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    )

    // Log transition
    await this.logTransition(
      key,
      oldValue,
      value,
      trigger,
      triggerAgentId
    )
  }

  /**
   * Update multiple state values atomically
   */
  async setMany(
    updates: Record<string, any>,
    trigger?: string,
    triggerAgentId?: string
  ): Promise<void> {
    // Use transaction for atomicity
    await this.pg.query('BEGIN')

    try {
      for (const [key, value] of Object.entries(updates)) {
        await this.set(key, value, trigger, triggerAgentId)
      }

      await this.pg.query('COMMIT')
    } catch (error) {
      await this.pg.query('ROLLBACK')
      throw error
    }
  }

  /**
   * Delete a state key
   */
  async delete(key: string, trigger?: string): Promise<void> {
    const oldValue = await this.get(key)

    await this.pg.query(
      `DELETE FROM state WHERE key = $1`,
      [key]
    )

    // Log deletion as transition to null
    await this.logTransition(key, oldValue, null, trigger)
  }

  /**
   * Reset all state to defaults
   */
  async reset(): Promise<void> {
    await this.pg.query('DELETE FROM state')

    // Reinitialize defaults
    await this.pg.query(`
      INSERT INTO state (key, value) VALUES
        ('phase', '"initial"'),
        ('iteration', '0'),
        ('data', 'null')
    `)
  }

  /**
   * Get transition history for a key
   */
  async getHistory(key: string, limit: number = 100): Promise<Transition[]> {
    return this.queries.query<Transition>(
      `SELECT *
       FROM transitions
       WHERE key = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [key, limit]
    )
  }

  /**
   * Get all recent transitions
   */
  async getRecentTransitions(limit: number = 100): Promise<Transition[]> {
    return this.queries.query<Transition>(
      `SELECT *
       FROM transitions
       WHERE execution_id = $1 OR execution_id IS NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [this.currentExecutionId, limit]
    )
  }

  /**
   * Log a state transition
   */
  private async logTransition(
    key: string,
    oldValue: any,
    newValue: any,
    trigger?: string,
    triggerAgentId?: string
  ): Promise<void> {
    await this.pg.query(
      `INSERT INTO transitions (
        execution_id,
        key,
        old_value,
        new_value,
        trigger,
        trigger_agent_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        this.currentExecutionId,
        key,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        trigger,
        triggerAgentId,
      ]
    )
  }

  /**
   * Replay state to a specific point in time
   * Useful for time-travel debugging
   */
  async replayTo(transitionId: string): Promise<void> {
    // Get all transitions up to that point
    const transitions = await this.queries.query<Transition>(
      `SELECT *
       FROM transitions
       WHERE created_at <= (SELECT created_at FROM transitions WHERE id = $1)
       ORDER BY created_at`,
      [transitionId]
    )

    // Reset state
    await this.pg.query('DELETE FROM state')

    // Replay transitions
    for (const t of transitions) {
      const value = typeof t.new_value === 'string'
        ? JSON.parse(t.new_value)
        : t.new_value

      await this.pg.query(
        `INSERT INTO state (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE
         SET value = $2`,
        [t.key, JSON.stringify(value)]
      )
    }
  }

  /**
   * Create a snapshot of current state
   */
  async snapshot(): Promise<Record<string, any>> {
    return this.getAll()
  }

  /**
   * Restore state from a snapshot
   */
  async restore(snapshot: Record<string, any>, trigger?: string): Promise<void> {
    await this.pg.query('BEGIN')

    try {
      await this.reset()

      for (const [key, value] of Object.entries(snapshot)) {
        await this.set(key, value, trigger || 'restore')
      }

      await this.pg.query('COMMIT')
    } catch (error) {
      await this.pg.query('ROLLBACK')
      throw error
    }
  }
}
