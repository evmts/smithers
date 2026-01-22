import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Transition } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface StateModule {
  get: <T>(key: string) => T | null
  set: <T>(key: string, value: T, trigger?: string) => void
  setMany: (updates: Record<string, unknown>, trigger?: string) => void
  getAll: () => Record<string, unknown>
  reset: () => void
  history: (key?: string, limit?: number) => Transition[]
  has: (key: string) => boolean
  delete: (key: string, trigger?: string) => void
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

    setMany: (updates: Record<string, unknown>, trigger?: string) => {
      if (rdb.isClosed) return
      rdb.transaction(() => {
        for (const [key, value] of Object.entries(updates)) {
          state.set(key, value, trigger)
        }
      })
    },

    getAll: (): Record<string, unknown> => {
      if (rdb.isClosed) return {}
      const rows = rdb.query<{ key: string; value: string }>('SELECT key, value FROM state')
      const result: Record<string, unknown> = {}
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

    history: (key?: string, limit: number = 100): Transition[] => {
      if (rdb.isClosed) return []
      if (key) {
        return rdb.query<Transition>(
          'SELECT * FROM transitions WHERE key = ? ORDER BY created_at DESC LIMIT ?',
          [key, limit]
        )
      }
      return rdb.query<Transition>(
        'SELECT * FROM transitions ORDER BY created_at DESC LIMIT ?',
        [limit]
      )
    },

    has: (key: string): boolean => {
      if (rdb.isClosed) return false
      const row = rdb.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM state WHERE key = ?', [key])
      return (row?.count ?? 0) > 0
    },

    delete: (key: string, trigger?: string): void => {
      if (rdb.isClosed) return
      const oldRow = rdb.queryOne<{ value: string }>('SELECT value FROM state WHERE key = ?', [key])
      if (!oldRow) return // Key doesn't exist

      rdb.run('DELETE FROM state WHERE key = ?', [key])
      rdb.invalidate(['state'])

      const currentExecutionId = getCurrentExecutionId()
      if (currentExecutionId) {
        rdb.run(
          'INSERT INTO transitions (id, execution_id, key, old_value, new_value, trigger, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuid(), currentExecutionId, key, oldRow.value, 'null', trigger ?? 'delete', now()]
        )
      }
    },
  }

  return state
}
