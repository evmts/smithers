/**
 * useQueryValue hook for reactive SQLite single-value queries
 */

import type { ReactiveDatabase } from '../database.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'
import { useQuery } from './useQuery.js'
import { useDatabaseOptional } from './context.js'

/**
 * Hook to get a single value from a query
 *
 * @example
 * ```tsx
 * // With explicit db
 * function UserCount() {
 *   const { data: count } = useQueryValue<number>(
 *     db,
 *     'SELECT COUNT(*) as count FROM users'
 *   )
 *
 *   return <div>Total users: {count ?? 0}</div>
 * }
 *
 * // With context (inside DatabaseProvider)
 * function UserCount() {
 *   const { data: count } = useQueryValue<number>('SELECT COUNT(*) as count FROM users')
 *   return <div>Total users: {count ?? 0}</div>
 * }
 * ```
 */
export function useQueryValue<T = unknown>(
  sqlOrDb: ReactiveDatabase | string,
  sqlOrParams?: string | any[],
  paramsOrOptions?: any[] | UseQueryOptions,
  optionsOrDb?: UseQueryOptions | ReactiveDatabase
): Omit<UseQueryResult<Record<string, T>>, 'data'> & { data: T | null } {
  // Parse overloaded arguments
  const contextDb = useDatabaseOptional()

  let db: ReactiveDatabase
  let sql: string
  let params: any[]
  let options: UseQueryOptions

  if (typeof sqlOrDb === 'string') {
    // New signature: useQueryValue(sql, params?, options?, explicitDb?)
    sql = sqlOrDb
    params = Array.isArray(sqlOrParams) ? sqlOrParams : []
    options = (Array.isArray(sqlOrParams) ? paramsOrOptions : sqlOrParams) as UseQueryOptions ?? {}
    const explicitDb = Array.isArray(sqlOrParams) ? optionsOrDb : paramsOrOptions

    if (explicitDb && typeof explicitDb !== 'object') {
      throw new Error('Invalid arguments to useQueryValue')
    }

    db = (explicitDb as ReactiveDatabase) ?? contextDb!
    if (!db) {
      throw new Error('useQueryValue requires either a DatabaseProvider or an explicit db argument')
    }
  } else {
    // Legacy signature: useQueryValue(db, sql, params?, options?)
    db = sqlOrDb
    sql = sqlOrParams as string
    params = Array.isArray(paramsOrOptions) ? paramsOrOptions : []
    options = (optionsOrDb as UseQueryOptions) ?? {}
  }

  const result = useQuery<Record<string, T>>(db, sql, params, options)
  const firstRow = result.data[0]
  const value = firstRow ? Object.values(firstRow)[0] ?? null : null

  return {
    ...result,
    data: value,
  }
}
