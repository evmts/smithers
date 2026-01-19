/**
 * useQuery hook for reactive SQLite queries
 */

import { useSyncExternalStore, useCallback, useMemo, useRef } from 'react'
import type { ReactiveDatabase } from '../database.js'
import { extractReadTables } from '../parser.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'
import { useQueryCache, useStoreSignal } from './shared.js'
import { useDatabaseOptional } from './context.js'
import { useEffectOnValueChange } from '../../reconciler/hooks.js'

/**
 * Hook to execute a reactive query
 *
 * The query will automatically re-run when relevant tables are mutated.
 *
 * @example
 * ```tsx
 * // With explicit db
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
 *
 * // With context (inside DatabaseProvider)
 * function UserList() {
 *   const { data: users } = useQuery('SELECT * FROM users')
 *   return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
 * }
 * ```
 */
export function useQuery<T = Record<string, unknown>>(
  sqlOrDb: ReactiveDatabase | string,
  sqlOrParams?: string | any[],
  paramsOrOptions?: any[] | UseQueryOptions,
  optionsOrDb?: UseQueryOptions | ReactiveDatabase
): UseQueryResult<T> {
  // Parse overloaded arguments
  const contextDb = useDatabaseOptional()

  let db: ReactiveDatabase
  let sql: string
  let params: any[]
  let options: UseQueryOptions

  if (typeof sqlOrDb === 'string') {
    // New signature: useQuery(sql, params?, options?, explicitDb?)
    sql = sqlOrDb
    params = Array.isArray(sqlOrParams) ? sqlOrParams : []
    options = (Array.isArray(sqlOrParams) ? paramsOrOptions : sqlOrParams) as UseQueryOptions ?? {}
    const explicitDb = Array.isArray(sqlOrParams) ? optionsOrDb : paramsOrOptions

    if (explicitDb && typeof explicitDb !== 'object') {
      throw new Error('Invalid arguments to useQuery')
    }

    db = (explicitDb as ReactiveDatabase) ?? contextDb!
    if (!db) {
      throw new Error('useQuery requires either a DatabaseProvider or an explicit db argument')
    }
  } else {
    // Legacy signature: useQuery(db, sql, params?, options?)
    db = sqlOrDb
    sql = sqlOrParams as string
    params = Array.isArray(paramsOrOptions) ? paramsOrOptions : []
    options = (optionsOrDb as UseQueryOptions) ?? {}
  }

  const { skip = false, deps = [] } = options

  const { cacheRef, invalidateCache } = useQueryCache<T>()
  const { subscribe: subscribeSignal, notify } = useStoreSignal()

  // Memoize the query key - include db identity to invalidate cache on db change
  // Use a ref counter that increments when db changes for stable identity tracking
  const dbIdRef = useRef({ db, id: 0 })
  if (dbIdRef.current.db !== db) {
    dbIdRef.current = { db, id: dbIdRef.current.id + 1 }
  }
  const dbId = dbIdRef.current.id
  
  const queryKey = useMemo(
    () => JSON.stringify({ sql, params, skip, dbId }),
    [sql, JSON.stringify(params), skip, dbId]
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
      const unsubscribeDb = db.subscribe(tables, () => {
        invalidateCache() // Clear cache so getSnapshot() recomputes
        onStoreChange()
      })
      const unsubscribeSignal = subscribeSignal(onStoreChange)
      return () => {
        unsubscribeDb()
        unsubscribeSignal()
      }
    },
    [db, sql, skip, invalidateCache, subscribeSignal]
  )

  // Get current snapshot
  const getSnapshot = useCallback(() => {
    if (!cacheRef.current || cacheRef.current.key !== queryKey) {
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

  const depsSignature = useMemo(() => deps, deps)

  // Re-fetch when deps change
  useEffectOnValueChange(depsSignature, () => {
    if (deps.length === 0) {
      return
    }
    invalidateCache()
    notify()
  })

  // Refetch function
  const refetch = useCallback(() => {
    invalidateCache()
    notify()
  }, [invalidateCache, notify])

  return {
    data: snapshot.data,
    isLoading: false, // SQLite queries are synchronous
    error: snapshot.error,
    refetch,
  }
}
