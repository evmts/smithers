import { useRef } from 'react'
import { useExecutionMount, useEffectOnValueChange, useUnmount } from '../../reconciler/hooks.js'

export interface PollingHookOptions {
  shouldExecute: boolean
  intervalMs: number
  immediate?: boolean
  onStart?: () => void | Promise<void>
  onTick: () => void | Promise<void>
  onError?: (error: unknown) => void
  onStop?: () => void
  deps?: unknown[]
}

export function usePollingHook(options: PollingHookOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef(false)
  const onStartRef = useRef(options.onStart)
  const onTickRef = useRef(options.onTick)
  const onErrorRef = useRef(options.onError)
  const onStopRef = useRef(options.onStop)

  onStartRef.current = options.onStart
  onTickRef.current = options.onTick
  onErrorRef.current = options.onError
  onStopRef.current = options.onStop

  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    onStopRef.current?.()
  }

  const runTick = async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      await onTickRef.current()
    } catch (err) {
      onErrorRef.current?.(err)
    } finally {
      inFlightRef.current = false
    }
  }

  useExecutionMount(options.shouldExecute, () => {
    stop()
    ;(async () => {
      try {
        await onStartRef.current?.()
      } catch (err) {
        onErrorRef.current?.(err)
        return
      }

      if (!options.shouldExecute) return

      if (options.immediate ?? true) {
        await runTick()
      }
      if (options.intervalMs > 0) {
        intervalRef.current = setInterval(runTick, options.intervalMs)
      }
    })()
  }, [options.shouldExecute, options.intervalMs, ...(options.deps ?? [])])

  useUnmount(stop)

  useEffectOnValueChange(options.shouldExecute, () => {
    if (options.shouldExecute) return
    stop()
  })

  return { stop, inFlightRef, intervalRef }
}
