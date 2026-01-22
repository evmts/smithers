/**
 * Shared utilities for reactive SQLite hooks
 */

import { useRef, useCallback, useSyncExternalStore } from 'react'
import type { ReactiveDatabase } from '../database.js'
import type { UseQueryOptions, UseMutationOptions } from '../types.js'

/**
 * Type guard to detect if an object is a ReactiveDatabase
 */
export function isReactiveDatabase(obj: unknown): obj is ReactiveDatabase {
  return obj !== null && typeof obj === 'object' && 'subscribe' in obj && typeof (obj as any).subscribe === 'function'
}

export interface ParsedQueryArgs {
  db: ReactiveDatabase
  sql: string
  params: any[]
  options: UseQueryOptions
}

export interface ParsedMutationArgs {
  db: ReactiveDatabase
  sql: string
  options: UseMutationOptions
}

/**
 * Parse overloaded query hook arguments (useQuery, useQueryOne, useQueryValue)
 * Supports both legacy (db, sql, params?, options?) and new (sql, params?, options?, db?) signatures
 */
export function parseQueryArgs(
  contextDb: ReactiveDatabase | null,
  sqlOrDb: ReactiveDatabase | string,
  sqlOrParams?: string | any[],
  paramsOrOptions?: any[] | UseQueryOptions,
  optionsOrDb?: UseQueryOptions | ReactiveDatabase,
  hookName = 'useQuery'
): ParsedQueryArgs {
  let db: ReactiveDatabase
  let sql: string
  let params: any[]
  let options: UseQueryOptions

  if (typeof sqlOrDb === 'string') {
    sql = sqlOrDb

    if (Array.isArray(sqlOrParams)) {
      params = sqlOrParams
      if (isReactiveDatabase(paramsOrOptions)) {
        options = {}
        db = paramsOrOptions
      } else {
        options = (paramsOrOptions as UseQueryOptions) ?? {}
        db = isReactiveDatabase(optionsOrDb) ? optionsOrDb : contextDb!
      }
    } else {
      params = []
      if (isReactiveDatabase(sqlOrParams)) {
        options = {}
        db = sqlOrParams
      } else {
        options = (sqlOrParams as UseQueryOptions) ?? {}
        db = isReactiveDatabase(paramsOrOptions) ? (paramsOrOptions as ReactiveDatabase) : contextDb!
      }
    }

    if (!db) {
      throw new Error(`${hookName} requires either a DatabaseProvider or an explicit db argument`)
    }
  } else {
    db = sqlOrDb
    sql = sqlOrParams as string
    params = Array.isArray(paramsOrOptions) ? paramsOrOptions : []
    options = (optionsOrDb as UseQueryOptions) ?? {}
  }

  return { db, sql, params, options }
}

/**
 * Parse overloaded mutation hook arguments
 * Supports both legacy (db, sql, options?) and new (sql, options?, db?) signatures
 */
export function parseMutationArgs(
  contextDb: ReactiveDatabase | null,
  sqlOrDb: ReactiveDatabase | string,
  sqlOrOptions?: string | UseMutationOptions,
  optionsOrDb?: UseMutationOptions | ReactiveDatabase,
  hookName = 'useMutation'
): ParsedMutationArgs {
  let db: ReactiveDatabase
  let sql: string
  let options: UseMutationOptions

  if (typeof sqlOrDb === 'string') {
    sql = sqlOrDb
    if (typeof sqlOrOptions === 'object' && sqlOrOptions !== null && !('query' in sqlOrOptions)) {
      options = sqlOrOptions as UseMutationOptions
      db = (optionsOrDb as ReactiveDatabase) ?? contextDb!
    } else {
      options = {}
      db = (sqlOrOptions as ReactiveDatabase) ?? contextDb!
    }

    if (!db) {
      throw new Error(`${hookName} requires either a DatabaseProvider or an explicit db argument`)
    }
  } else {
    db = sqlOrDb
    sql = sqlOrOptions as string
    options = (optionsOrDb as UseMutationOptions) ?? {}
  }

  return { db, sql, options }
}

/**
 * Hook for a simple in-memory signal store.
 * Allows manual invalidation without useState.
 */
export function useStoreSignal() {
  const listenersRef = useRef(new Set<() => void>())

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [])

  return { subscribe, notify }
}

/**
 * Hook for version tracking to force re-renders without useState.
 */
export function useVersionTracking() {
  const versionRef = useRef(0)
  const updateRef = useRef(0)
  const { subscribe, notify } = useStoreSignal()

  useSyncExternalStore(
    subscribe,
    () => updateRef.current,
    () => updateRef.current
  )

  const incrementVersion = useCallback(() => {
    versionRef.current += 1
  }, [])

  const invalidateAndUpdate = useCallback(() => {
    updateRef.current += 1
    notify()
  }, [notify])

  return {
    versionRef,
    incrementVersion,
    invalidateAndUpdate,
  }
}

/**
 * Hook for managing query cache
 */
export function useQueryCache<T>() {
  const cacheRef = useRef<{ key: string; data: T[]; error: Error | null } | null>(null)

  const invalidateCache = useCallback(() => {
    cacheRef.current = null
  }, [])

  const updateCache = useCallback((key: string, data: T[], error: Error | null) => {
    cacheRef.current = { key, data, error }
  }, [])

  return {
    cacheRef,
    invalidateCache,
    updateCache,
  }
}
