/**
 * Shared utilities for reactive SQLite hooks
 */

import { useRef, useCallback, useSyncExternalStore } from 'react'
import type { ReactiveDatabase } from '../database.js'

/**
 * Type guard to detect if an object is a ReactiveDatabase
 */
export function isReactiveDatabase(obj: unknown): obj is ReactiveDatabase {
  return obj !== null && typeof obj === 'object' && 'subscribe' in obj && typeof (obj as any).subscribe === 'function'
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
