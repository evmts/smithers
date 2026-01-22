/**
 * useMutation hook for reactive SQLite mutations
 */

import { useCallback, useRef } from 'react'
import { useVersionTracking, parseMutationArgs } from './shared.js'
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
  const contextDb = useDatabaseOptional()
  const { db, sql, options } = parseMutationArgs(
    contextDb,
    sqlOrDb,
    sqlOrOptions,
    optionsOrDb,
    'useMutation'
  )

  const { invalidateTables, onSuccess, onError } = options
  
  // Use refs for ephemeral state (per AGENTS.md: no useState)
  const isLoadingRef = useRef(false)
  const errorRef = useRef<Error | null>(null)
  const { invalidateAndUpdate } = useVersionTracking()

  const mutate = useCallback(
    (...params: TParams) => {
      isLoadingRef.current = true
      errorRef.current = null

      try {
        db.run(sql, params)

        // Manual invalidation if specified
        if (invalidateTables) {
          db.invalidate(invalidateTables)
        }

        onSuccess?.()
      } catch (err) {
        errorRef.current = err as Error
        onError?.(err as Error)
      } finally {
        isLoadingRef.current = false
        invalidateAndUpdate()
      }
    },
    [db, sql, invalidateTables, onSuccess, onError, invalidateAndUpdate]
  )

  const mutateAsync = useCallback(
    async (...params: TParams): Promise<void> => {
      isLoadingRef.current = true
      errorRef.current = null

      try {
        db.run(sql, params)

        if (invalidateTables) {
          db.invalidate(invalidateTables)
        }

        onSuccess?.()
      } catch (err) {
        errorRef.current = err as Error
        onError?.(err as Error)
        throw new Error(`Mutation failed`, { cause: err })
      } finally {
        isLoadingRef.current = false
        invalidateAndUpdate()
      }
    },
    [db, sql, invalidateTables, onSuccess, onError, invalidateAndUpdate]
  )

  return {
    mutate,
    mutateAsync,
    isLoading: isLoadingRef.current,
    error: errorRef.current,
  }
}
