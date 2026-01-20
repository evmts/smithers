// Claude CLI Module
// Main exports - re-exports everything from submodules

// Argument builder
export {
  buildClaudeArgs,
  modelMap,
  formatMap,
} from './arg-builder.js'

// Stop conditions
export { checkStopConditions } from './stop-conditions.js'

// Output parser
export { parseClaudeOutput } from './output-parser.js'
export type { ParsedOutput } from './output-parser.js'

// Executor functions and constants
export {
  executeClaudeCLI,
  executeClaudeShell,
  executeClaudeCLIOnce,
  DEFAULT_CLI_TIMEOUT_MS,
  DEFAULT_SCHEMA_RETRIES,
} from './executor.js'
