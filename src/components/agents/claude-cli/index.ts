// Claude CLI Module
// Main exports - re-exports everything from submodules

// Argument builder
export {
  buildClaudeArgs,
  modelMap,
  permissionFlags,
  formatMap,
} from './arg-builder.js'

// Stop conditions
export { checkStopConditions } from './stop-conditions.js'

// Output parser
export { parseClaudeOutput } from './output-parser.js'
export type { ParsedOutput } from './output-parser.js'

// Executor functions
export {
  executeClaudeCLI,
  executeClaudeShell,
  executeClaudeCLIOnce,
} from './executor.js'
