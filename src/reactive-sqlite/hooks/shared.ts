/**
 * Shared utilities for reactive SQLite hooks
 */

import { useRef, useState, useCallback } from 'react'

/**
 * Hook for version tracking to force re-renders
 */
export function useVersionTracking() {
  const versionRef = useRef(0)
  const [, forceUpdate] = useState(0)

  const incrementVersion = useCallback(() => {
    versionRef.current++
  }, [])

  const invalidateAndUpdate = useCallback(() => {
    forceUpdate(v => v + 1)
  }, [])

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
