/**
 * useMutation hook for reactive SQLite mutations
 */

import { useCallback, useState } from 'react'
import type { ReactiveDatabase } from '../database.js'
import type { UseMutationResult, UseMutationOptions } from '../types.js'
import { useDatabaseOptional } from './context.js'

/**
 * Hook to execute mutations with automatic query invalidation
 *
 * @example
 * ```tsx
 * // With explicit db
 * function AddUser() {
 *   const { mutate, isLoading } = useMutation(
 *     db,
 *     'INSERT INTO users (name, email) VALUES (?, ?)'
 *   )
 *
 *   const handleAdd = () => {
 *     mutate('Alice', 'alice@example.com')
 *   }
 *
 *   return <button onClick={handleAdd} disabled={isLoading}>Add User</button>
 * }
 *
 * // With context (inside DatabaseProvider)
 * function AddUser() {
 *   const { mutate } = useMutation('INSERT INTO users (name, email) VALUES (?, ?)')
 *   return <button onClick={() => mutate('Alice', 'alice@example.com')}>Add User</button>
 * }
 * ```
 */
export function useMutation<TParams extends any[] = any[]>(
  sqlOrDb: ReactiveDatabase | string,
  sqlOrOptions?: string | UseMutationOptions,
  optionsOrDb?: UseMutationOptions | ReactiveDatabase
): UseMutationResult<TParams> {
  // Parse overloaded arguments
  const contextDb = useDatabaseOptional()

  let db: ReactiveDatabase
  let sql: string
  let options: UseMutationOptions

  if (typeof sqlOrDb === 'string') {
    // New signature: useMutation(sql, options?, explicitDb?)
    sql = sqlOrDb
    if (typeof sqlOrOptions === 'object' && sqlOrOptions !== null && !('query' in sqlOrOptions)) {
      // sqlOrOptions is UseMutationOptions
      options = sqlOrOptions as UseMutationOptions
      db = (optionsOrDb as ReactiveDatabase) ?? contextDb!
    } else {
      options = {}
      db = (sqlOrOptions as ReactiveDatabase) ?? contextDb!
    }

    if (!db) {
      throw new Error('useMutation requires either a DatabaseProvider or an explicit db argument')
    }
  } else {
    // Legacy signature: useMutation(db, sql, options?)
    db = sqlOrDb
    sql = sqlOrOptions as string
    options = (optionsOrDb as UseMutationOptions) ?? {}
  }

  const { invalidateTables, onSuccess, onError } = options
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = useCallback(
    (...params: TParams) => {
      setIsLoading(true)
      setError(null)

      try {
        db.run(sql, params)

        // Manual invalidation if specified
        if (invalidateTables) {
          db.invalidate(invalidateTables)
        }

        onSuccess?.()
      } catch (err) {
        const error = err as Error
        setError(error)
        onError?.(error)
      } finally {
        setIsLoading(false)
      }
    },
    [db, sql, invalidateTables, onSuccess, onError]
  )

  const mutateAsync = useCallback(
    async (...params: TParams): Promise<void> => {
      setIsLoading(true)
      setError(null)

      try {
        db.run(sql, params)

        if (invalidateTables) {
          db.invalidate(invalidateTables)
        }

        onSuccess?.()
      } catch (err) {
        const error = err as Error
        setError(error)
        onError?.(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [db, sql, invalidateTables, onSuccess, onError]
  )

  return {
    mutate,
    mutateAsync,
    isLoading,
    error,
  }
}
