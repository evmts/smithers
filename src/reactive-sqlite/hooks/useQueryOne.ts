/**
 * useQueryOne hook for reactive SQLite single-row queries
 */

import type { ReactiveDatabase } from '../database'
import type { UseQueryResult, UseQueryOptions } from '../types'
import { useQuery } from './useQuery'

/**
 * Hook to get a single row from a query
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }: { userId: number }) {
 *   const { data: user } = useQueryOne(
 *     db,
 *     'SELECT * FROM users WHERE id = ?',
 *     [userId]
 *   )
 *
 *   if (!user) return <div>User not found</div>
 *
 *   return <div>{user.name}</div>
 * }
 * ```
 */
export function useQueryOne<T = Record<string, unknown>>(
  db: ReactiveDatabase,
  sql: string,
  params: any[] = [],
  options: UseQueryOptions = {}
): Omit<UseQueryResult<T>, 'data'> & { data: T | null } {
  const result = useQuery<T>(db, sql, params, options)
  return {
    ...result,
    data: result.data[0] ?? null,
  }
}
