/**
 * MCP server factory for legacy tools.
 * 
 * Creates an MCP server configuration that exposes legacy tools (with JSON Schema)
 * via the MCP protocol. Tool execution happens via file-based IPC back to the
 * parent Smithers process.
 */

import type { LegacyTool, MCPServer } from './types.js'
import { getIpcDir } from './legacy-tool-ipc.js'
import * as path from 'node:path'

export interface LegacyToolServerResult {
  server: MCPServer
  toolDefinitions: LegacyToolDefinition[]
}

export interface LegacyToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * Create an MCP server configuration for legacy tools.
 * 
 * The server runs as a subprocess and communicates with the parent process
 * via file-based IPC to execute tool handlers.
 */
export function createLegacyToolServer(tools: LegacyTool[]): LegacyToolServerResult {
  const toolDefinitions: LegacyToolDefinition[] = tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Record<string, unknown>,
  }))

  const serverPath = path.resolve(import.meta.dirname, 'legacy-mcp-server.ts')

  const server: MCPServer = {
    name: 'smithers-legacy-tools',
    command: 'bun',
    args: ['run', serverPath],
    env: {
      SMITHERS_LEGACY_TOOLS: JSON.stringify(toolDefinitions),
      SMITHERS_IPC_DIR: getIpcDir(),
    },
  }

  return { server, toolDefinitions }
}
