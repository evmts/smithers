// Tools module - exports all tool-related functionality

export {
  // Types
  type JSONSchema,
  type ToolContext,
  type Tool,
  type MCPServer,
  type ToolSpec,
  type BuiltinToolName,

  // Registry
  BUILTIN_TOOLS,
  isBuiltinTool,
  getToolInfo,

  // Helpers
  isCustomTool,
  isMCPServer,
  isToolName,
  parseToolSpecs,
  buildToolFlags,
} from './registry.jsx'

export { createReportTool, getReportToolDescription } from './ReportTool.jsx'
