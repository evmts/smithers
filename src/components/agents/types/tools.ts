// Tool and MCP Server type definitions for Smithers orchestrator

import type {
  LegacyTool,
  MCPServer,
  SmithersTool,
  SmithersToolContext,
  ToolSpec,
} from '../../../tools/types.js'

export type ToolContext = SmithersToolContext
export type Tool = LegacyTool

export type {
  LegacyTool,
  MCPServer,
  SmithersTool,
  ToolSpec,
}
