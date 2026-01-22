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
