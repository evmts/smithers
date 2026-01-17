/**
 * Core execution engine - framework-agnostic
 */

export { executePlan } from './execute.js'
export { serialize } from './serialize.js'

export type {
  SmithersNode,
  ExecutionState,
  ExecuteOptions,
  ExecutionResult,
  DebugOptions,
  DebugEvent,
} from './types.js'
