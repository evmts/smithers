import { useRef } from 'react'
import { useMount, useUnmount } from '../reconciler/hooks.js'
import { IterationTimeoutConfig } from '../orchestrator/timeout.js'
import { sleep } from '../utils/sleep.js'

export interface IterationTimeoutProps {
  /** Current timeout configuration */
  config: IterationTimeoutConfig
  /** Callback to update timeout configuration */
  onConfigUpdate?: (config: Partial<IterationTimeoutConfig>) => void
  /** Callback to manually trigger timeout */
  onTimeout?: () => Promise<void>
  /** Whether to show interactive controls (default: false) */
  showControls?: boolean
  /** Whether to show real-time status (default: true) */
  showStatus?: boolean
  /** Custom label for the component */
  label?: string
  /** Whether to auto-start timeout monitoring (default: false) */
  autoStart?: boolean
}

/**
 * IterationTimeout component provides logic for Ralph loop throttling controls
 * Integrates with useIterationTimeout hook for complete timeout management
 *
 * This is a headless component that manages timeout state and lifecycle.
 * UI rendering can be implemented separately using the provided status methods.
 */
export function IterationTimeout({
  config,
  onTimeout,
  autoStart = false
}: Pick<IterationTimeoutProps, 'config' | 'onTimeout' | 'autoStart'>) {
  const isRunningRef = useRef(false)
  const cancelRef = useRef(false)
  const lastTimeoutRef = useRef<Date | null>(null)

  useMount(() => {
    if (autoStart && config.enabled && onTimeout) {
      startTimeoutLoop()
    }
  })

  useUnmount(() => {
    cancelRef.current = true
  })

  const startTimeoutLoop = async () => {
    if (isRunningRef.current) return

    isRunningRef.current = true

    while (!cancelRef.current && config.enabled) {
      if (onTimeout) {
        try {
          lastTimeoutRef.current = new Date()
          await onTimeout()
        } catch (error) {
          // Handle timeout errors gracefully
          console.warn('Iteration timeout error:', error)
        }
      } else {
        // Fallback to direct sleep if no callback provided
        await sleep(config.timeoutMs)
      }

      // Small delay to prevent tight loop
      await sleep(10)
    }

    isRunningRef.current = false
  }

  // Return null since this is a headless component that manages logic only
  // UI can be built using the provided helper methods and state
  return null
}

/**
 * Headless hook version of IterationTimeout for pure logic management
 * Returns state and control functions for building custom UIs
 */
export function useIterationTimeoutComponent(props: IterationTimeoutProps) {
  const isRunningRef = useRef(false)
  const cancelRef = useRef(false)
  const lastTimeoutRef = useRef<Date | null>(null)

  useMount(() => {
    if (props.autoStart && props.config.enabled && props.onTimeout) {
      startTimeoutLoop()
    }
  })

  useUnmount(() => {
    cancelRef.current = true
  })

  const startTimeoutLoop = async () => {
    if (isRunningRef.current) return

    isRunningRef.current = true

    while (!cancelRef.current && props.config.enabled) {
      if (props.onTimeout) {
        try {
          lastTimeoutRef.current = new Date()
          await props.onTimeout()
        } catch (error) {
          console.warn('Iteration timeout error:', error)
        }
      } else {
        await sleep(props.config.timeoutMs)
      }

      await sleep(10)
    }

    isRunningRef.current = false
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getStatus = () => ({
    isRunning: isRunningRef.current,
    isEnabled: props.config.enabled,
    color: !props.config.enabled ? 'gray' : isRunningRef.current ? 'yellow' : 'green',
    text: !props.config.enabled ? 'Disabled' : isRunningRef.current ? 'Running' : 'Ready',
    formattedTimeout: formatDuration(props.config.timeoutMs),
    lastTimeout: lastTimeoutRef.current
  })

  return {
    status: getStatus(),
    config: props.config,
    startTimeoutLoop,
    formatDuration
  }
}