/**
 * MCP server for legacy tools.
 * 
 * Spawned as subprocess by createLegacyToolServer() to expose
 * LegacyTools via MCP protocol over stdio transport.
 * 
 * Tool execution happens via file-based IPC:
 * 1. Write request to {IPC_DIR}/{requestId}.request.json
 * 2. Wait for {requestId}.response.json from parent process
 * 3. Return result to Claude via MCP
 * 
 * Environment variables:
 * - SMITHERS_LEGACY_TOOLS: JSON array of tool definitions
 * - SMITHERS_IPC_DIR: Directory for IPC files
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { LegacyToolDefinition } from './legacy-tool-server.js'
import type { IPCRequest, IPCResponse } from './legacy-tool-ipc.js'

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
  name: 'smithers-legacy-tools',
  version: '1.0.0',
}

const PROTOCOL_VERSION = '2024-11-05'

let toolDefinitions: LegacyToolDefinition[] = []
let ipcDir = ''
let initialized = false

function log(message: string): void {
  console.error(`[legacy-mcp] ${message}`)
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

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function executeViaIPC(toolName: string, input: unknown): Promise<unknown> {
  const requestId = generateRequestId()
  const reqPath = path.join(ipcDir, `${requestId}.request.json`)
  const respPath = path.join(ipcDir, `${requestId}.response.json`)

  const request: IPCRequest = {
    requestId,
    toolName,
    input,
  }

  // Ensure IPC directory exists
  await fs.promises.mkdir(ipcDir, { recursive: true })

  // Write request
  await fs.promises.writeFile(reqPath, JSON.stringify(request), 'utf-8')

  // Poll for response with timeout
  const timeout = 60000 // 60 second timeout
  const pollInterval = 20 // 20ms polling
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const content = await fs.promises.readFile(respPath, 'utf-8')
      const response: IPCResponse = JSON.parse(content)
      
      // Clean up response file
      await fs.promises.unlink(respPath).catch(() => {})
      
      if (!response.success) {
        throw new Error(response.error ?? 'Unknown error')
      }
      
      return response.result
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // File exists but couldn't be parsed, or other error
        if (!String(err).includes('ENOENT')) {
          throw err
        }
      }
      // Response not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }

  // Timeout - clean up request file
  await fs.promises.unlink(reqPath).catch(() => {})
  throw new Error(`IPC timeout waiting for response from tool: ${toolName}`)
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

  const toolDef = toolDefinitions.find(t => t.name === toolName)
  if (!toolDef) {
    sendError(id, -32601, `Tool not found: ${toolName}`)
    return
  }

  try {
    const result = await executeViaIPC(toolName, toolArgs)
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
  const rawTools = process.env['SMITHERS_LEGACY_TOOLS'] ?? '[]'
  ipcDir = process.env['SMITHERS_IPC_DIR'] ?? ''

  if (!ipcDir) {
    log('SMITHERS_IPC_DIR not set')
    return false
  }

  try {
    const parsed = JSON.parse(rawTools)
    if (!Array.isArray(parsed)) {
      log('SMITHERS_LEGACY_TOOLS must be a JSON array')
      return false
    }
    toolDefinitions = parsed as LegacyToolDefinition[]
  } catch (error) {
    log(`Failed to parse SMITHERS_LEGACY_TOOLS: ${error}`)
    return false
  }

  if (toolDefinitions.length === 0) {
    log('No tools defined - server will respond to tools/list with empty array')
  } else {
    log(`Loaded ${toolDefinitions.length} tool definition(s)`)
  }

  return true
}

async function main(): Promise<void> {
  const loaded = await loadTools()
  if (!loaded) {
    process.exit(1)
  }

  log('Legacy MCP server starting on stdio...')

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
