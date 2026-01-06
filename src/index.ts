// Core rendering and execution
export { renderPlan, createRoot, serialize } from './core/render.js'
export { executePlan, executeNode, findPendingExecutables, findStopNode, findHumanNode } from './core/execute.js'
export {
  executeWithClaude,
  createExecutionError,
  getNodePath,
  type ClaudeConfig,
  RateLimitError,
} from './core/claude-executor.js'

// Components
export {
  Claude,
  Subagent,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
  Task,
  Stop,
  Human,
} from './components/index.js'

// Types
export type {
  PluNode,
  PluRoot,
  ExecutionState,
  ExecutionError,
  Tool,
  ToolInputSchema,
  ToolRetryOptions,
  ToolExecutionResult,
  ClaudeProps,
  SubagentProps,
  PhaseProps,
  StepProps,
  PersonaProps,
  ConstraintsProps,
  OutputFormatProps,
  TaskProps,
  StopProps,
  HumanProps,
  ExecuteOptions,
  ExecutionResult,
  FrameResult,
} from './core/types.js'

// MCP (Model Context Protocol) integration
export { MCPManager, MCPPresets, createMCPConfigs } from './mcp/index.js'
export type {
  MCPServerConfig,
  MCPStdioConfig,
  MCPHttpConfig,
  MCPTransportType,
  MCPConnection,
  MCPConnectionStatus,
  MCPTool,
  MCPToolResult,
} from './mcp/index.js'

// CLI Configuration (for programmatic use)
export { loadConfig, loadConfigFromFile, mergeOptions, getConfigPath, defineConfig } from './cli/config.js'
export type { SmithersConfig } from './cli/config.js'

// File loading (for programmatic use)
export {
  loadAgentFile,
  loadTsxFile,
  loadMdxFile,
  extractElement,
  LoaderError,
  SyntaxLoadError,
  ExportError,
  InvalidElementError,
} from './cli/loader.js'
export type { LoadOptions, LoadedModule } from './cli/loader.js'
