/**
 * useMutation hook for reactive SQLite mutations
 */

import { useCallback, useState } from 'react'
import type { ReactiveDatabase } from '../database'
import type { UseMutationResult, UseMutationOptions } from '../types'

/**
 * Hook to execute mutations with automatic query invalidation
 *
 * @example
 * ```tsx
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
 * ```
 */
export function useMutation<TParams extends any[] = any[]>(
  db: ReactiveDatabase,
  sql: string,
  options: UseMutationOptions = {}
): UseMutationResult<TParams> {
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
