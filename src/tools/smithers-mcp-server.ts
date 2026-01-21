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

interface JSONRPCRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

const SERVER_INFO = {
  name: 'smithers-tools',
  version: '1.0.0',
}

const PROTOCOL_VERSION = '2024-11-05'

let toolDefinitions: MCPToolDefinition[] = []
let toolHandlers: Map<string, SmithersTool['execute']> = new Map()
let initialized = false

function log(message: string): void {
  console.error(`[smithers-mcp] ${message}`)
}

function sendResponse(response: JSONRPCResponse): void {
  const json = JSON.stringify(response)
  process.stdout.write(json + '\n')
}

function sendError(id: string | number | null, code: number, message: string, data?: unknown): void {
  sendResponse({
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  })
}

function sendResult(id: string | number | null, result: unknown): void {
  sendResponse({
    jsonrpc: '2.0',
    id,
    result,
  })
}

async function handleInitialize(id: string | number | null, _params: Record<string, unknown>): Promise<void> {
  initialized = true
  sendResult(id, {
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: SERVER_INFO,
    capabilities: {
      tools: {},
    },
  })
}

async function handleToolsList(id: string | number | null): Promise<void> {
  if (!initialized) {
    sendError(id, -32002, 'Server not initialized')
    return
  }
  
  sendResult(id, {
    tools: toolDefinitions.map(def => ({
      name: def.name,
      description: def.description ?? '',
      inputSchema: def.inputSchema,
    })),
  })
}

async function handleToolsCall(id: string | number | null, params: Record<string, unknown>): Promise<void> {
  if (!initialized) {
    sendError(id, -32002, 'Server not initialized')
    return
  }

  const toolName = params['name'] as string
  const toolArgs = (params['arguments'] ?? {}) as Record<string, unknown>

  if (!toolName) {
    sendError(id, -32602, 'Missing tool name')
    return
  }

  const handler = toolHandlers.get(toolName)
  if (!handler) {
    sendError(id, -32601, `Tool not found: ${toolName}`)
    return
  }

  try {
    const result = await handler(toolArgs)
    sendResult(id, {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendResult(id, {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    })
  }
}

async function handleRequest(request: JSONRPCRequest): Promise<void> {
  const { id, method, params = {} } = request

  switch (method) {
    case 'initialize':
      await handleInitialize(id ?? null, params)
      break
    case 'initialized':
      break
    case 'tools/list':
      await handleToolsList(id ?? null)
      break
    case 'tools/call':
      await handleToolsCall(id ?? null, params)
      break
    case 'notifications/cancelled':
      break
    default:
      if (id !== undefined) {
        sendError(id, -32601, `Method not found: ${method}`)
      }
  }
}

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

  if (toolDefinitions.length === 0) {
    log('No tools defined - server will respond to tools/list with empty array')
  } else {
    log(`Loaded ${toolDefinitions.length} tool definition(s)`)
  }

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
  const loaded = await loadTools()
  if (!loaded) {
    process.exit(1)
  }

  log('MCP server starting on stdio...')

  const decoder = new TextDecoder()
  let buffer = ''

  const stream = Bun.stdin.stream()
  const reader = stream.getReader()
  
  while (true) {
    const { value: chunk, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(chunk, { stream: true })
    
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      
      if (!line) continue
      
      try {
        const request = JSON.parse(line) as JSONRPCRequest
        if (request.jsonrpc !== '2.0') {
          log(`Invalid JSON-RPC version: ${request.jsonrpc}`)
          continue
        }
        await handleRequest(request)
      } catch (error) {
        log(`Failed to parse request: ${error}`)
        sendError(null, -32700, 'Parse error')
      }
    }
  }
}

main().catch(err => {
  log(`Fatal error: ${err}`)
  process.exit(1)
})
