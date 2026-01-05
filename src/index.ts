// Core rendering and execution
export { renderPlan, createRoot, serialize } from './core/render.js'
export { executePlan, executeNode, findPendingExecutables } from './core/execute.js'
export { executeWithClaude, type ClaudeConfig } from './core/claude-executor.js'

// Components
export {
  Claude,
  Subagent,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
} from './components/index.js'

// Types
export type {
  PluNode,
  PluRoot,
  ExecutionState,
  Tool,
  ToolInputSchema,
  ClaudeProps,
  SubagentProps,
  PhaseProps,
  StepProps,
  PersonaProps,
  ConstraintsProps,
  OutputFormatProps,
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
