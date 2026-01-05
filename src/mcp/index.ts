// MCP (Model Context Protocol) integration for Smithers
//
// This module provides tools for connecting to MCP servers,
// discovering their capabilities, and executing tool calls.

export { MCPManager } from './manager.js'
export { MCPPresets, createMCPConfigs } from './presets.js'
export type {
  MCPServerConfig,
  MCPStdioConfig,
  MCPHttpConfig,
  MCPTransportType,
  MCPConnection,
  MCPConnectionStatus,
  MCPTool,
  MCPToolResult,
} from './types.js'
