import { useRef } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { createIterationTimeout, type IterationTimeoutConfig } from '../orchestrator/timeout.js'

export interface IterationTimeoutHookConfig extends IterationTimeoutConfig {
  /** Whether to automatically apply timeout on Ralph iterations (default: true) */
  autoApplyOnRalph?: boolean
  /** Custom key for storing timeout config in state (optional) */
  stateKey?: string
}

export interface IterationTimeoutHookResult {
  /** Current timeout configuration */
  config: IterationTimeoutConfig
  /** Manually trigger iteration timeout */
  waitForTimeout: () => Promise<void>
  /** Update timeout configuration in SQLite state */
  updateConfig: (newConfig: Partial<IterationTimeoutConfig>) => void
  /** Check if timeout is currently enabled */
  isEnabled: boolean
}

/**
 * Hook for managing iteration timeouts in Ralph loops
 * Integrates with SmithersProvider and SQLite state management
 */
export function useIterationTimeout(
  initialConfig?: IterationTimeoutHookConfig
): IterationTimeoutHookResult {
  const { db, reactiveDb } = useSmithers()

  // Default configuration
  const defaultConfig: IterationTimeoutHookConfig = {
    timeoutMs: 1000,
    enabled: false,
    autoApplyOnRalph: true,
    stateKey: 'iteration_timeout_config',
    ...initialConfig
  }

  const configRef = useRef(defaultConfig)
  const stateKey = defaultConfig.stateKey!

  // Get timeout config from SQLite state (reactive)
  const { data: storedConfig } = useQueryValue<IterationTimeoutConfig>(
    reactiveDb,
    "SELECT json_extract(value, '$') as config FROM state WHERE key = ?",
    [stateKey]
  )

  // Merge stored config with defaults
  const currentConfig: IterationTimeoutConfig = storedConfig
    ? { ...defaultConfig, ...storedConfig }
    : defaultConfig

  // Update ref for non-reactive access
  configRef.current = currentConfig

  const waitForTimeout = async (): Promise<void> => {
    return createIterationTimeout(configRef.current)
  }

  const updateConfig = (newConfig: Partial<IterationTimeoutConfig>): void => {
    const updatedConfig = {
      ...configRef.current,
      ...newConfig
    }

    // Validate the configuration
    if (updatedConfig.timeoutMs < 0) {
      throw new Error('Timeout must be non-negative')
    }

    // Store in SQLite state
    db.state.set(stateKey, updatedConfig, 'iteration_timeout_update')

    // Update ref
    configRef.current = updatedConfig
  }

  // Initialize state if not exists
  if (!storedConfig && initialConfig) {
    db.state.set(stateKey, defaultConfig, 'iteration_timeout_init')
  }

  return {
    config: currentConfig,
    waitForTimeout,
    updateConfig,
    isEnabled: currentConfig.enabled
  }
}