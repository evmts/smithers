// Tools module - exports all tool-related functionality

export {
  // Types
  type JSONSchema,
  type ToolContext,
  type Tool,
  type ToolSpec,
  type BuiltinToolName,

  // Registry
  BUILTIN_TOOLS,
  isBuiltinTool,
  getToolInfo,

  // Helpers
  isCustomTool,
  isLegacyTool,
  isSmithersTool,
  isMCPServer,
  isToolName,
  parseToolSpecs,
  buildToolFlags,
} from './registry.js'

export type {
  SmithersTool,
  SmithersToolContext,
  CreateSmithersToolOptions,
  LegacyTool,
  MCPServer,
} from './types.js'

export { createSmithersTool } from './createSmithersTool.js'
export { toolToMCPDefinition, createSmithersToolServer } from './tool-to-mcp.js'
export { createReportTool, getReportToolDescription } from './ReportTool.js'
