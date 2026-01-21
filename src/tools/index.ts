// Tools module - exports all tool-related functionality

// Types - single source of truth from types.ts
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

// Note: Tool, ToolContext, JSONSchema exported from components/index.js

// Registry - constants and functions only
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
export { toolToMCPDefinition, createSmithersToolServer } from './tool-to-mcp.js'
export { createReportTool, getReportToolDescription } from './ReportTool.js'
