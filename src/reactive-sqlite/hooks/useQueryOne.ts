/**
 * useQueryOne hook for reactive SQLite single-row queries
 */

import type { ReactiveDatabase } from '../database.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'
import { useQuery } from './useQuery.js'
import { useDatabaseOptional } from './context.js'
import { parseQueryArgs } from './shared.js'

/**
 * Hook to get a single row from a query
 *
 * @example
 * ```tsx
 * // With explicit db
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
 *
 * // With context (inside DatabaseProvider)
 * function UserProfile({ userId }: { userId: number }) {
 *   const { data: user } = useQueryOne<User>(
 *     'SELECT * FROM users WHERE id = ?',
 *     [userId]
 *   )
 *   return user ? <div>{user.name}</div> : <div>User not found</div>
 * }
 * ```
 */
export function useQueryOne<T = Record<string, unknown>>(
  sqlOrDb: ReactiveDatabase | string,
  sqlOrParams?: string | any[],
  paramsOrOptions?: any[] | UseQueryOptions,
  optionsOrDb?: UseQueryOptions | ReactiveDatabase
): Omit<UseQueryResult<T>, 'data'> & { data: T | null } {
  const contextDb = useDatabaseOptional()
  const { db, sql, params, options } = parseQueryArgs(
    contextDb,
    sqlOrDb,
    sqlOrParams,
    paramsOrOptions,
    optionsOrDb,
    'useQueryOne'
  )

  const result = useQuery<T>(db, sql, params, options)
  return {
    ...result,
    data: result.data[0] ?? null,
  }
}
