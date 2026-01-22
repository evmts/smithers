/**
 * useQueryValue hook for reactive SQLite single-value queries
 */

import type { ReactiveDatabase } from '../database.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'
import { useQuery } from './useQuery.js'
import { useDatabaseOptional } from './context.js'
import { parseQueryArgs } from './shared.js'

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
  const contextDb = useDatabaseOptional()
  const { db, sql, params, options } = parseQueryArgs(
    contextDb,
    sqlOrDb,
    sqlOrParams,
    paramsOrOptions,
    optionsOrDb,
    'useQueryValue'
  )

  const result = useQuery<Record<string, T>>(db, sql, params, options)
  const firstRow = result.data[0]
  const value = firstRow ? Object.values(firstRow)[0] ?? null : null

  return {
    ...result,
    data: value,
  }
}
