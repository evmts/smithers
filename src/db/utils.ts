import type { ReactiveDatabase } from '../reactive-sqlite/index.js'

export const uuid = () => crypto.randomUUID()

export const now = () => new Date().toISOString()

export const parseJson = <T>(str: string | null | undefined, defaultValue: T): T => {
  if (!str) return defaultValue
  try {
    return JSON.parse(str)
  } catch {
    return defaultValue
  }
}

export const calcDuration = (rdb: ReactiveDatabase, table: string, idColumn: string, id: string): number | null => {
  const row = rdb.queryOne<{ started_at: string }>(`SELECT started_at FROM ${table} WHERE ${idColumn} = ?`, [id])
  return row ? Date.now() - new Date(row.started_at).getTime() : null
}

export const withOpenDb = <T>(rdb: ReactiveDatabase, fallback: T, fn: () => T): T => {
  if (rdb.isClosed) return fallback
  return fn()
}

export const withOpenDbVoid = (rdb: ReactiveDatabase, fn: () => void): void => {
  if (rdb.isClosed) return
  fn()
}
