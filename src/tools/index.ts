export type {
  SmithersTool,
  SmithersToolContext,
  SmithersExecOptions,
  ToolExecuteOptions,
  CreateSmithersToolOptions,
  LegacyTool,
  MCPServer,
  ToolSpec,
} from './types.js'

export {
  type BuiltinToolName,
  BUILTIN_TOOLS,
  isBuiltinTool,
  getToolInfo,
  isCustomTool,
  isLegacyTool,
  isSmithersTool,
  classifyTool,
  isMCPServer,
  isToolName,
  parseToolSpecs,
  buildToolFlags,
} from './registry.js'

export { createSmithersTool } from './createSmithersTool.js'
export { 
  toolToMCPDefinition, 
  createSmithersToolServer,
  type MCPToolDefinition,
  type CreateSmithersToolServerOptions,
} from './tool-to-mcp.js'
export { createReportTool, getReportToolDescription } from './ReportTool.js'
export {
  createLegacyToolServer,
  type LegacyToolServerResult,
  type LegacyToolDefinition,
} from './legacy-tool-server.js'
export {
  registerHandlers,
  startWatcher,
  stopWatcher,
  cleanupIpcDir,
  getIpcDir,
  type IPCRequest,
  type IPCResponse,
} from './legacy-tool-ipc.js'

// Agent tool system exports
export {
  createAgentTool,
  createAgentTools,
  AgentToolRegistry,
  defaultAgentRegistry,
  registerDefaultAgents,
} from '../orchestrator/agents/agent-tool.js'

export {
  ClaudeAgentExecutor,
} from '../orchestrator/agents/claude-agent.js'

export {
  CodexAgentExecutor,
} from '../orchestrator/agents/codex-agent.js'

export {
  GeminiAgentExecutor,
} from '../orchestrator/agents/gemini-agent.js'

export type {
  AgentProvider,
  AgentToolConfig,
  AgentInvocation,
  AgentToolResult,
  AgentExecutor,
  AgentRegistry,
  CreateAgentToolOptions,
  AgentExecutionContext,
  AgentUsage,
} from '../orchestrator/agents/types.js'
