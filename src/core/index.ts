/**
 * Core execution engine - framework-agnostic
 */

// TODO: execute.ts was removed/moved - this export needs to be updated
// export { executePlan } from './execute.js'

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
