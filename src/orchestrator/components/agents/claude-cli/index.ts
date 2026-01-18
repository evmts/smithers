// Claude CLI Module
// Main exports - re-exports everything from submodules

// Argument builder
export {
  buildClaudeArgs,
  modelMap,
  permissionFlags,
  formatMap,
} from './arg-builder'

// Stop conditions
export { checkStopConditions } from './stop-conditions'

// Output parser
export { parseClaudeOutput } from './output-parser'
export type { ParsedOutput } from './output-parser'

// Executor functions
export {
  executeClaudeCLI,
  executeClaudeShell,
  executeClaudeCLIOnce,
} from './executor'
