import { useCallback } from 'react'
import { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { useQueryValue } from '../reactive-sqlite/index.js'

const tuiDb = new ReactiveDatabase(':memory:')
tuiDb.exec('CREATE TABLE IF NOT EXISTS tui_state (key TEXT PRIMARY KEY, value TEXT)')

function parseValue<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function readTuiState<T>(key: string, fallback: T): T {
  const row = tuiDb.queryOne<{ value: string }>('SELECT value FROM tui_state WHERE key = ?', [key])
  return row ? parseValue<T>(row.value, fallback) : fallback
}

function writeTuiState<T>(key: string, value: T): void {
  const jsonValue = JSON.stringify(value)
  tuiDb.run(
    'INSERT INTO tui_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
    [key, jsonValue, jsonValue]
  )
}

export function useTuiState<T>(
  key: string,
  fallback: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const { data: raw } = useQueryValue<string>(
    tuiDb,
    'SELECT value FROM tui_state WHERE key = ?',
    [key]
  )
  const value = parseValue<T>(raw, fallback)

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === 'function'
        ? (next as (prev: T) => T)(readTuiState(key, fallback))
        : next
      writeTuiState(key, resolved)
    },
    [key, fallback]
  )

  return [value, setValue]
}

export function useTuiStateValue<T>(key: string, fallback: T): T {
  return useTuiState<T>(key, fallback)[0]
}
