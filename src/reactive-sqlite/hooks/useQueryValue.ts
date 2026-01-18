/**
 * useQueryValue hook for reactive SQLite single-value queries
 */

import type { ReactiveDatabase } from '../database.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'
import { useQuery } from './useQuery.js'

/**
 * Hook to get a single value from a query
 *
 * @example
 * ```tsx
 * function UserCount() {
 *   const { data: count } = useQueryValue<number>(
 *     db,
 *     'SELECT COUNT(*) as count FROM users'
 *   )
 *
 *   return <div>Total users: {count ?? 0}</div>
 * }
 * ```
 */
export function useQueryValue<T = unknown>(
  db: ReactiveDatabase,
  sql: string,
  params: any[] = [],
  options: UseQueryOptions = {}
): Omit<UseQueryResult<Record<string, T>>, 'data'> & { data: T | null } {
  const result = useQuery<Record<string, T>>(db, sql, params, options)
  const firstRow = result.data[0]
  const value = firstRow ? Object.values(firstRow)[0] ?? null : null

  return {
    ...result,
    data: value,
  }
}
