/**
 * useQuery hook for reactive SQLite queries
 */

import { useSyncExternalStore, useCallback, useMemo, useEffect } from 'react'
import type { ReactiveDatabase } from '../database'
import { extractReadTables } from '../parser'
import type { UseQueryResult, UseQueryOptions } from '../types'
import { useVersionTracking, useQueryCache } from './shared'

/**
 * Hook to execute a reactive query
 *
 * The query will automatically re-run when relevant tables are mutated.
 *
 * @example
 * ```tsx
 * function UserList() {
 *   const { data: users, isLoading } = useQuery(
 *     db,
 *     'SELECT * FROM users WHERE active = ?',
 *     [true]
 *   )
 *
 *   if (isLoading) return <div>Loading...</div>
 *
 *   return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
 * }
 * ```
 */
export function useQuery<T = Record<string, unknown>>(
  db: ReactiveDatabase,
  sql: string,
  params: any[] = [],
  options: UseQueryOptions = {}
): UseQueryResult<T> {
  const { skip = false, deps = [] } = options

  // Track version for forcing re-renders
  const { incrementVersion, invalidateAndUpdate } = useVersionTracking()
  const { cacheRef, invalidateCache } = useQueryCache<T>()

  // Memoize the query key
  const queryKey = useMemo(
    () => JSON.stringify({ sql, params, skip }),
    [sql, JSON.stringify(params), skip]
  )

  // Execute query and update cache
  const executeQuery = useCallback(() => {
    if (skip) {
      return { data: [] as T[], error: null }
    }

    try {
      const data = db.query<T>(sql, params)
      return { data, error: null }
    } catch (error) {
      return { data: [] as T[], error: error as Error }
    }
  }, [db, sql, JSON.stringify(params), skip])

  // Subscribe to database changes
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (skip) {
        return () => {}
      }

      const tables = extractReadTables(sql)
      return db.subscribe(tables, () => {
        incrementVersion()
        onStoreChange()
      })
    },
    [db, sql, skip, incrementVersion]
  )

  // Get current snapshot
  const getSnapshot = useCallback(() => {
    if (cacheRef.current.key !== queryKey) {
      const result = executeQuery()
      cacheRef.current = {
        key: queryKey,
        data: result.data,
        error: result.error,
      }
    }
    return cacheRef.current
  }, [queryKey, executeQuery, cacheRef])

  // Use useSyncExternalStore for React 18+ concurrent mode support
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot // Server snapshot (same as client for SQLite)
  )

  // Re-fetch when deps change
  useEffect(() => {
    if (deps.length > 0) {
      invalidateCache()
      invalidateAndUpdate()
    }
  }, deps)

  // Refetch function
  const refetch = useCallback(() => {
    invalidateCache()
    invalidateAndUpdate()
  }, [invalidateCache, invalidateAndUpdate])

  return {
    data: snapshot.data,
    isLoading: false, // SQLite queries are synchronous
    error: snapshot.error,
    refetch,
  }
}
