// Core execution (renderer-agnostic)
export {
  executePlan,
  executeNode,
  findPendingExecutables,
  findStopNode,
  findHumanNode,
  findPendingFileNodes,
  executeFileNode,
  findPendingWorktreeNodes,
  executeWorktreeNode,
  cleanupWorktreeNode,
  getWorktreePath,
  type ExecuteNodeResult,
} from './core/execute.js'

export {
  executeWithClaude,
  createExecutionError,
  getNodePath,
  type ClaudeConfig,
  RateLimitError,
} from './core/claude-executor.js'

// Claude Agent SDK executor
export { executeWithAgentSdk, executeAgentMock } from './core/claude-agent-executor.js'

// Claude CLI executor (deprecated)
export { executeWithClaudeCli } from './core/claude-cli-executor.js'

// Nested execution utilities
export {
  separatePromptAndPlan,
  serializePlanWithPaths,
  getExecutableNodePaths,
} from './core/nested-execution.js'

// Types
export type {
  SmithersNode,
  ExecuteOptions,
  ExecutionResult,
  ExecutionState,
  ExecutionError,
  FrameResult,
  HumanPromptInfo,
  HumanPromptResponse,
  PlanInfo,
  Tool,
} from './core/types.js'

// MCP integration
export { MCPManager } from './mcp/manager.js'
export type { MCPServerConfig, MCPToolConfig } from './mcp/types.js'

// Debug/observability
export { DebugCollector } from './debug/collector.js'
export type { DebugEvent, DebugOptions } from './debug/types.js'
