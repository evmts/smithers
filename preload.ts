/**
 * Smithers preload script for Bun runtime.
 * This file is preloaded when running Smithers orchestrations.
 */

// Ensure we're in production mode by default
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production'
}
