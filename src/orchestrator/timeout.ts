/**
 * Iteration timeout functionality for Ralph loop throttling
 * Prevents runaway costs by adding configurable delays between iterations
 */

export interface IterationTimeoutConfig {
  /** Timeout in milliseconds between iterations */
  timeoutMs: number
  /** Whether timeout is enabled */
  enabled: boolean
}

// Global state for timeout management
let activeTimeoutId: ReturnType<typeof setTimeout> | null = null
let activeResolve: (() => void) | null = null

/**
 * Creates a timeout delay between iterations
 * Only one timeout can be active at a time - new calls cancel previous ones
 */
export async function createIterationTimeout(config: IterationTimeoutConfig): Promise<void> {
  // Clear any existing timeout first
  clearIterationTimeout()

  // If disabled or timeout is 0, return immediately
  if (!config.enabled || config.timeoutMs <= 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    activeResolve = resolve

    activeTimeoutId = setTimeout(() => {
      activeTimeoutId = null
      activeResolve = null
      resolve()
    }, config.timeoutMs)
  })
}

/**
 * Clears any active iteration timeout
 * Safe to call even when no timeout is active
 */
export function clearIterationTimeout(): void {
  if (activeTimeoutId !== null) {
    clearTimeout(activeTimeoutId)
    activeTimeoutId = null
  }

  if (activeResolve !== null) {
    // Resolve immediately to unblock waiting code
    activeResolve()
    activeResolve = null
  }
}

/**
 * Gets the default timeout configuration
 */
export function getDefaultTimeoutConfig(): IterationTimeoutConfig {
  return {
    timeoutMs: 1000, // 1 second default delay
    enabled: false   // Disabled by default for backward compatibility
  }
}

/**
 * Validates a timeout configuration
 */
export function validateTimeoutConfig(config: IterationTimeoutConfig): void {
  if (config.timeoutMs < 0) {
    throw new Error('Timeout must be non-negative')
  }

  if (typeof config.enabled !== 'boolean') {
    throw new Error('Enabled must be a boolean')
  }
}