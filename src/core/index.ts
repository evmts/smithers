/**
 * Core module - thin re-export layer for backwards compatibility.
 * Policy: Only exports serialize function to maintain minimal surface area.
 */
export { serialize } from '../reconciler/serialize.js'

// Re-export types for type-only imports
export type {
  SmithersNode,
  ExecutionState,
  ExecuteOptions,
  ExecutionResult,
  DebugOptions,
  DebugEvent,
} from '../reconciler/types.js'
