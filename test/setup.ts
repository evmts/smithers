/**
 * Test setup - runs before all tests.
 *
 * Sets up mock mode for Claude SDK and configures the test environment.
 */

// Set mock mode for all tests by default
process.env.SMITHERS_MOCK_MODE = 'true'
process.env.NODE_ENV = 'test'

// Mock console.log for Ralph's verbose output during tests (optional)
// If tests are too noisy, use spyOn from bun:test:
// import { spyOn } from 'bun:test'
// spyOn(console, 'log').mockImplementation(() => {})

// Ensure promises are properly handled in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
