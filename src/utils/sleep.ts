/**
 * Sleep utility for creating delays in async operations
 * Used by iteration timeout mechanism for Ralph loop throttling
 */

/**
 * Creates a promise that resolves after the specified number of milliseconds
 * @param ms - The number of milliseconds to wait (0 or negative values resolve immediately)
 * @returns Promise that resolves after the specified delay
 */
export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Sleep with cancellation support via AbortSignal
 * @param ms - The number of milliseconds to wait
 * @param signal - Optional AbortSignal to cancel the sleep
 * @returns Promise that resolves after delay or rejects if aborted
 */
export async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException('Sleep aborted', 'AbortError')
  }

  if (ms <= 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout>

    const abortHandler = () => {
      clearTimeout(timeoutId)
      reject(new DOMException('Sleep aborted', 'AbortError'))
    }

    // Set up abort listener if signal provided
    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true })
    }

    timeoutId = setTimeout(() => {
      // Clean up abort listener
      if (signal) {
        signal.removeEventListener('abort', abortHandler)
      }
      resolve()
    }, ms)
  })
}

/**
 * Creates a sleep function that can be cancelled via a ref
 * Useful for React components that need to cancel pending sleeps on unmount
 * @param cancelRef - Ref object that can be set to true to cancel pending sleeps
 * @returns Sleep function that respects the cancel ref
 */
export function createCancellableSleep(cancelRef: { current: boolean }) {
  return async (ms: number): Promise<void> => {
    if (cancelRef.current || ms <= 0) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (!cancelRef.current) {
          resolve()
        }
      }, ms)

      // Poll cancel ref periodically for responsive cancellation
      const pollInterval = setInterval(() => {
        if (cancelRef.current) {
          clearTimeout(timeoutId)
          clearInterval(pollInterval)
          resolve()
        }
      }, Math.min(ms / 10, 100))

      // Clean up polling when timeout completes
      setTimeout(() => {
        clearInterval(pollInterval)
      }, ms + 10)
    })
  }
}

/**
 * Sleep with exponential backoff - useful for retry mechanisms
 * @param attempt - The attempt number (0-based)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay in milliseconds
 * @param backoffFactor - Multiplication factor for each attempt (default: 2)
 * @returns Promise that resolves after calculated delay
 */
export async function sleepWithBackoff(
  attempt: number,
  baseDelayMs: number = 100,
  maxDelayMs: number = 30000,
  backoffFactor: number = 2
): Promise<void> {
  const delay = Math.min(
    baseDelayMs * Math.pow(backoffFactor, attempt),
    maxDelayMs
  )

  return sleep(delay)
}

/**
 * Sleep with jitter to avoid thundering herd problems
 * @param baseMs - Base delay in milliseconds
 * @param jitterPercent - Percentage of jitter (0-100, default: 25)
 * @returns Promise that resolves after randomized delay
 */
export async function sleepWithJitter(
  baseMs: number,
  jitterPercent: number = 25
): Promise<void> {
  if (baseMs <= 0) {
    return Promise.resolve()
  }

  const jitterRange = (baseMs * jitterPercent) / 100
  const jitter = (Math.random() - 0.5) * 2 * jitterRange
  const actualDelay = Math.max(0, baseMs + jitter)

  return sleep(actualDelay)
}