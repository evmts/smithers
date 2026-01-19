let orchestrationResolve: (() => void) | null = null
let orchestrationReject: ((err: Error) => void) | null = null

/**
 * Create a promise that resolves when orchestration completes.
 * Called by createSmithersRoot before mounting.
 */
export function createOrchestrationPromise(): Promise<void> {
  return new Promise((resolve, reject) => {
    orchestrationResolve = resolve
    orchestrationReject = reject
  })
}

/**
 * Signal that orchestration is complete (called internally).
 */
export function signalOrchestrationComplete(): void {
  if (orchestrationResolve) {
    orchestrationResolve()
    orchestrationResolve = null
    orchestrationReject = null
  }
}

/**
 * Signal that orchestration failed (called internally).
 */
export function signalOrchestrationError(err: Error): void {
  if (orchestrationReject) {
    orchestrationReject(err)
    orchestrationResolve = null
    orchestrationReject = null
  }
}
