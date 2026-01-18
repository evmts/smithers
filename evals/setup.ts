/**
 * E2E Eval setup - runs before all evaluation tests.
 *
 * Re-exports test utilities and sets up mock mode.
 */

import { createSmithersRoot } from '../src/reconciler/root.js'
import { createSmithersDB } from '../src/db/index.js'

// Set mock mode for all evals by default
process.env.SMITHERS_MOCK_MODE = 'true'
process.env.NODE_ENV = 'test'

// Re-export test utilities for convenience
export { createClaudeMock, createStaticMock, createSequenceMock } from '../test/mocks/claude-mock.js'

/**
 * Delay helper for async tests
 */
export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now()
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('waitFor timeout exceeded')
    }
    await delay(interval)
  }
}

/**
 * Create a fresh test environment with db and root
 */
export function createTestEnvironment(testName: string) {
  const db = createSmithersDB({ path: ':memory:' })
  const executionId = db.execution.start('eval-test', testName)
  const root = createSmithersRoot()

  return { db, executionId, root }
}

/**
 * Clean up test environment
 */
export function cleanupTestEnvironment(env: ReturnType<typeof createTestEnvironment>) {
  env.root.dispose()
  env.db.close()
}

/**
 * Output structured eval result to console
 */
export function logEvalResult(result: Record<string, any>) {
  console.log(JSON.stringify(result, null, 2))
}
