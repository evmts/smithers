/**
 * useQueryOne hook for reactive SQLite single-row queries
 */

import type { ReactiveDatabase } from '../database.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'
import { useQuery } from './useQuery.js'
import { useDatabaseOptional } from './context.js'

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
  // Parse overloaded arguments
  const contextDb = useDatabaseOptional()

  let db: ReactiveDatabase
  let sql: string
  let params: any[]
  let options: UseQueryOptions

  if (typeof sqlOrDb === 'string') {
    // New signature: useQueryOne(sql, params?, optionsOrDb?, db?)
    sql = sqlOrDb

    // Helper to detect ReactiveDatabase (has subscribe method)
    const isDb = (obj: unknown): obj is ReactiveDatabase =>
      obj !== null && typeof obj === 'object' && 'subscribe' in obj && typeof (obj as any).subscribe === 'function'

    if (Array.isArray(sqlOrParams)) {
      // useQueryOne(sql, params, ...) - 3rd arg could be options or db
      params = sqlOrParams
      if (isDb(paramsOrOptions)) {
        options = {}
        db = paramsOrOptions
      } else {
        options = (paramsOrOptions as UseQueryOptions) ?? {}
        db = isDb(optionsOrDb) ? optionsOrDb : contextDb!
      }
    } else {
      // useQueryOne(sql) or useQueryOne(sql, options) or useQueryOne(sql, db)
      params = []
      if (isDb(sqlOrParams)) {
        options = {}
        db = sqlOrParams
      } else {
        options = (sqlOrParams as UseQueryOptions) ?? {}
        db = isDb(paramsOrOptions) ? (paramsOrOptions as ReactiveDatabase) : contextDb!
      }
    }

    if (!db) {
      throw new Error('useQueryOne requires either a DatabaseProvider or an explicit db argument')
    }
  } else {
    // Legacy signature: useQueryOne(db, sql, params?, options?)
    db = sqlOrDb
    sql = sqlOrParams as string
    params = Array.isArray(paramsOrOptions) ? paramsOrOptions : []
    options = (optionsOrDb as UseQueryOptions) ?? {}
  }

  const result = useQuery<T>(db, sql, params, options)
  return {
    ...result,
    data: result.data[0] ?? null,
  }
}
