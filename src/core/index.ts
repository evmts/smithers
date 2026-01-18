/**
 * Core execution engine - framework-agnostic
 */

export { executePlan } from './execute.js'

// Re-export from reconciler for backwards compatibility
export { serialize } from '../reconciler/serialize.js'

export type {
  SmithersNode,
  ExecutionState,
  ExecuteOptions,
  ExecutionResult,
  DebugOptions,
  DebugEvent,
} from '../reconciler/types.js'
