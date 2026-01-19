// Tools module - exports all tool-related functionality

// Types - single source of truth from types.ts
export type {
  SmithersTool,
  SmithersToolContext,
  CreateSmithersToolOptions,
  LegacyTool,
  MCPServer,
  ToolSpec,
} from './types.js'

// Backwards compatibility aliases
export type { LegacyTool as Tool, SmithersToolContext as ToolContext } from './types.js'
export type { JSONSchema } from '../components/agents/types/schema.js'

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
