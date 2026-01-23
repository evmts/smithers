import { useRef } from 'react'
import { Text, Box } from '@opentui/react'
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
 * IterationTimeout component provides UI for Ralph loop throttling controls
 * Integrates with useIterationTimeout hook for complete timeout management
 */
export function IterationTimeout({
  config,
  onConfigUpdate,
  onTimeout,
  showControls = false,
  showStatus = true,
  label = "Iteration Timeout",
  autoStart = false
}: IterationTimeoutProps) {
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

  const handleToggleEnabled = () => {
    if (onConfigUpdate) {
      onConfigUpdate({ enabled: !config.enabled })
    }
  }

  const handleTimeoutChange = (newTimeout: number) => {
    if (onConfigUpdate) {
      onConfigUpdate({ timeoutMs: Math.max(0, newTimeout) })
    }
  }

  const handleManualTimeout = async () => {
    if (onTimeout) {
      try {
        lastTimeoutRef.current = new Date()
        await onTimeout()
      } catch (error) {
        console.error('Manual timeout failed:', error)
      }
    }
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getStatusColor = (): string => {
    if (!config.enabled) return 'gray'
    if (isRunningRef.current) return 'yellow'
    return 'green'
  }

  const getStatusText = (): string => {
    if (!config.enabled) return 'Disabled'
    if (isRunningRef.current) return 'Running'
    return 'Ready'
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="blue">{label}</Text>
      </Box>

      {/* Status Display */}
      {showStatus && (
        <Box marginBottom={1}>
          <Box marginRight={2}>
            <Text color={getStatusColor()}>● {getStatusText()}</Text>
          </Box>
          <Box marginRight={2}>
            <Text>Timeout: {formatDuration(config.timeoutMs)}</Text>
          </Box>
          {lastTimeoutRef.current && (
            <Text color="dim">
              Last: {lastTimeoutRef.current.toLocaleTimeString()}
            </Text>
          )}
        </Box>
      )}

      {/* Interactive Controls */}
      {showControls && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Box marginRight={2}>
              <Text>
                [{config.enabled ? 'X' : ' '}] Enabled
              </Text>
            </Box>
            <Text color="dim">(Press 'e' to toggle)</Text>
          </Box>

          <Box marginBottom={1}>
            <Box marginRight={2}>
              <Text>Timeout: {config.timeoutMs}ms</Text>
            </Box>
            <Text color="dim">(↑/↓ to adjust)</Text>
          </Box>

          <Box>
            <Text color="dim">Press 't' to trigger manual timeout</Text>
          </Box>
        </Box>
      )}

      {/* Performance Metrics */}
      {showStatus && (
        <Box flexDirection="column" borderStyle="round" borderColor="dim" padding={1}>
          <Text color="blue">Ralph Loop Throttling Metrics</Text>
          <Box marginTop={1}>
            <Text>
              Expected delay per iteration: {formatDuration(config.timeoutMs)}
            </Text>
          </Box>
          <Box>
            <Text>
              Throttling: {config.enabled ? 'Active' : 'Inactive'}
            </Text>
          </Box>
          {config.enabled && (
            <Box marginTop={1}>
              <Text color="yellow">
                ⚡ Ralph iterations will be throttled by {formatDuration(config.timeoutMs)}
              </Text>
            </Box>
          )}
          {!config.enabled && (
            <Box marginTop={1}>
              <Text color="red">
                ⚠️  No throttling - Ralph may consume excessive resources
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

/**
 * Simplified IterationTimeout component for minimal UI
 */
export function IterationTimeoutMinimal({
  config,
  onTimeout
}: Pick<IterationTimeoutProps, 'config' | 'onTimeout'>) {
  return (
    <Box>
      <Text color={config.enabled ? 'green' : 'gray'}>
        Timeout: {config.timeoutMs}ms {config.enabled ? '●' : '○'}
      </Text>
    </Box>
  )
}

/**
 * IterationTimeout component with debug information
 */
export function IterationTimeoutDebug({
  config,
  onConfigUpdate,
  onTimeout,
  ...props
}: IterationTimeoutProps) {
  const debugInfoRef = useRef({
    renderCount: 0,
    lastConfigUpdate: null as Date | null,
    timeoutCallCount: 0
  })

  debugInfoRef.current.renderCount++

  const wrappedOnConfigUpdate = onConfigUpdate ? (newConfig: Partial<IterationTimeoutConfig>) => {
    debugInfoRef.current.lastConfigUpdate = new Date()
    onConfigUpdate(newConfig)
  } : undefined

  const wrappedOnTimeout = onTimeout ? async () => {
    debugInfoRef.current.timeoutCallCount++
    return onTimeout()
  } : undefined

  return (
    <Box flexDirection="column">
      <IterationTimeout
        {...props}
        config={config}
        onConfigUpdate={wrappedOnConfigUpdate}
        onTimeout={wrappedOnTimeout}
      />

      {/* Debug Information */}
      <Box marginTop={1} borderStyle="round" borderColor="yellow" padding={1}>
        <Text color="yellow">Debug Info</Text>
        <Box marginTop={1}>
          <Text>Render count: {debugInfoRef.current.renderCount}</Text>
        </Box>
        <Box>
          <Text>Timeout calls: {debugInfoRef.current.timeoutCallCount}</Text>
        </Box>
        {debugInfoRef.current.lastConfigUpdate && (
          <Box>
            <Text>
              Last config update: {debugInfoRef.current.lastConfigUpdate.toLocaleTimeString()}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}