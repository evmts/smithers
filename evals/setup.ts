/**
 * E2E Eval setup - runs before all evaluation tests.
 *
 * Re-exports test utilities and sets up mock mode.
 */

// Set mock mode for all evals by default
process.env.SMITHERS_MOCK_MODE = 'true'
process.env.NODE_ENV = 'test'

// Re-export test utilities for convenience
export { renderPlan, runPlan, createNode, createTextNode, waitFor, delay } from '../test/utils'
export { createClaudeMock, createStaticMock, createSequenceMock } from '../test/mocks/claude-mock'
