/**
 * MCP server for Smithers tools.
 * 
 * Spawned as subprocess by createSmithersToolServer() to expose
 * SmithersTools via MCP protocol over stdio transport.
 * 
 * Environment variables:
 * - SMITHERS_TOOLS: JSON array of MCPToolDefinition (name, description, inputSchema)
 * - SMITHERS_TOOL_MODULE: Path to module exporting tools (for execute functions)
 * 
 * MCP Protocol (JSON-RPC 2.0 over stdio):
 * - Receives: initialize, tools/list, tools/call
 * - Sends: JSON-RPC responses with newline delimiter
 */

import type { SmithersTool } from './types.js'
import type { MCPToolDefinition } from './tool-to-mcp.js'
import { runMCPServer, createLogger } from './mcp-jsonrpc.js'

const log = createLogger('smithers-mcp')

let toolDefinitions: MCPToolDefinition[] = []
let toolHandlers: Map<string, SmithersTool['execute']> = new Map()

async function loadTools(): Promise<boolean> {
  const rawTools = process.env['SMITHERS_TOOLS'] ?? '[]'
  const toolModulePath = process.env['SMITHERS_TOOL_MODULE']

  try {
    const parsed = JSON.parse(rawTools)
    if (!Array.isArray(parsed)) {
      log('SMITHERS_TOOLS must be a JSON array')
      return false
    }
    toolDefinitions = parsed as MCPToolDefinition[]
  } catch (error) {
    log(`Failed to parse SMITHERS_TOOLS: ${error}`)
    return false
  }

  log(toolDefinitions.length === 0
    ? 'No tools defined - server will respond to tools/list with empty array'
    : `Loaded ${toolDefinitions.length} tool definition(s)`)

  if (toolModulePath) {
    try {
      const toolModule = await import(toolModulePath)
      const tools: Record<string, SmithersTool> = toolModule.default ?? toolModule.tools ?? toolModule

      for (const [name, tool] of Object.entries(tools)) {
        if (tool && typeof tool === 'object' && 'execute' in tool && typeof tool.execute === 'function') {
          toolHandlers.set(tool.name ?? name, tool.execute as SmithersTool['execute'])
        }
      }
      log(`Loaded ${toolHandlers.size} tool handler(s) from ${toolModulePath}`)
    } catch (error) {
      log(`Failed to load tool module: ${error}`)
      return false
    }
  } else {
    log('No SMITHERS_TOOL_MODULE specified - tools/call will fail for all tools')
  }

  return true
}

async function main(): Promise<void> {
  if (!(await loadTools())) process.exit(1)

  await runMCPServer({
    name: 'smithers-tools',
    version: '1.0.0',
    logPrefix: 'smithers-mcp',
    getTools: () => toolDefinitions,
    executeTool: async (name, args) => {
      const handler = toolHandlers.get(name)
      if (!handler) throw new Error(`Tool not found: ${name}`)
      return handler(args)
    },
  })
}

main().catch(err => {
  log(`Fatal error: ${err}`)
  process.exit(1)
})
