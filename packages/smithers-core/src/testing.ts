/**
 * Testing utilities and internal APIs
 *
 * IMPORTANT: This module exports internal implementation details that are NOT stable.
 * These exports are intended for testing and debugging purposes only.
 * APIs in this module may change without notice in any release.
 *
 * Do not depend on these exports in production code.
 */

// Re-export commonly needed testing types
export type {
  SmithersNode,
  ExecutionState,
  ExecutionController,
  ExecutionResult,
} from './core/types.js'
