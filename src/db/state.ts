// State management module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, now, parseJson } from './utils.js'

export interface StateModule {
  get: <T>(key: string) => T | null
  set: <T>(key: string, value: T, trigger?: string) => void
  setMany: (updates: Record<string, any>, trigger?: string) => void
  getAll: () => Record<string, any>
  reset: () => void
  history: (key?: string, limit?: number) => any[]
}

export interface StateModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createStateModule(ctx: StateModuleContext): StateModule {
  const { rdb, getCurrentExecutionId } = ctx

  const state: StateModule = {
    get: <T>(key: string): T | null => {
      if (rdb.isClosed) return null
      const row = rdb.queryOne<{ value: string }>('SELECT value FROM state WHERE key = ?', [key])
      return row ? parseJson<T>(row.value, null as T) : null
    },

    set: <T>(key: string, value: T, trigger?: string) => {
      if (rdb.isClosed) return
      const oldValue = state.get(key)
      const jsonValue = JSON.stringify(value)
      rdb.run(
        'INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?',
        [key, jsonValue, now(), jsonValue, now()]
      )
      rdb.invalidate(['state'])
      // Log transition
      const currentExecutionId = getCurrentExecutionId()
      if (currentExecutionId) {
        rdb.run(
          'INSERT INTO transitions (id, execution_id, key, old_value, new_value, trigger, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuid(), currentExecutionId, key, JSON.stringify(oldValue), jsonValue, trigger ?? null, now()]
        )
      }
    },

    setMany: (updates: Record<string, any>, trigger?: string) => {
      if (rdb.isClosed) return
      for (const [key, value] of Object.entries(updates)) {
        state.set(key, value, trigger)
      }
    },

    getAll: (): Record<string, any> => {
      if (rdb.isClosed) return {}
      const rows = rdb.query<{ key: string; value: string }>('SELECT key, value FROM state')
      const result: Record<string, any> = {}
      for (const row of rows) {
        result[row.key] = parseJson(row.value, null)
      }
      return result
    },

    reset: () => {
      if (rdb.isClosed) return
      rdb.run('DELETE FROM state')
      rdb.run("INSERT INTO state (key, value) VALUES ('phase', '\"initial\"'), ('ralphCount', '0'), ('data', 'null')")
    },

    history: (key?: string, limit: number = 100): any[] => {
      if (rdb.isClosed) return []
      if (key) {
        return rdb.query(
          'SELECT * FROM transitions WHERE key = ? ORDER BY created_at DESC LIMIT ?',
          [key, limit]
        )
      }
      return rdb.query(
        'SELECT * FROM transitions ORDER BY created_at DESC LIMIT ?',
        [limit]
      )
    },
  }

  return state
}
