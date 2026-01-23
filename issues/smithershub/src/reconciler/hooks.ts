/**
 * Custom React hooks for smithers project
 * Provides alternatives to useEffect for specific use cases
 */

import { useEffect, useRef } from 'react'

/**
 * Hook that runs code once when component mounts
 * Alternative to useEffect(fn, [])
 */
export function useMount(fn: () => void | (() => void)): void {
  useEffect(() => {
    return fn()
  }, [])
}

/**
 * Hook that runs cleanup code when component unmounts
 * Alternative to useEffect(() => () => cleanup, [])
 * Avoids stale closure issues by using latest props/state
 */
export function useUnmount(fn: () => void): void {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    return () => fnRef.current()
  }, [])
}

/**
 * Hook for async operations that set state
 * Prevents "setState on unmounted component" warnings
 */
export function useMountedState(): () => boolean {
  const mountedRef = useRef(true)

  useUnmount(() => {
    mountedRef.current = false
  })

  return () => mountedRef.current
}