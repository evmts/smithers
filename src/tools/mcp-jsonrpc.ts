/**
 * Shared JSON-RPC handling for MCP servers.
 * 
 * Provides common infrastructure:
 * - JSON-RPC types and response helpers
 * - MCP protocol constants
 * - Stdin stream processing
 * - Request routing
 */

export interface JSONRPCRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface MCPToolInfo {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface MCPServerConfig {
  name: string
  version: string
  logPrefix: string
  getTools: () => MCPToolInfo[]
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

export const PROTOCOL_VERSION = '2024-11-05'

export function createLogger(prefix: string): (message: string) => void {
  return (message: string) => console.error(`[${prefix}] ${message}`)
}

export function sendResponse(response: JSONRPCResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n')
}

export function sendError(id: string | number | null, code: number, message: string, data?: unknown): void {
  sendResponse({
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  })
}

export function sendResult(id: string | number | null, result: unknown): void {
  sendResponse({ jsonrpc: '2.0', id, result })
}

export function formatToolResult(result: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  return {
    content: [{
      type: 'text',
      text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
    }],
  }
}

export function formatToolError(err: unknown): { content: Array<{ type: string; text: string }>; isError: boolean } {
  const message = err instanceof Error ? err.message : String(err)
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  }
}

export async function runMCPServer(config: MCPServerConfig): Promise<void> {
  const log = createLogger(config.logPrefix)
  let initialized = false

  async function handleRequest(request: JSONRPCRequest): Promise<void> {
    const { id, method, params = {} } = request

    switch (method) {
      case 'initialize':
        initialized = true
        sendResult(id ?? null, {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: config.name, version: config.version },
          capabilities: { tools: {} },
        })
        break

      case 'initialized':
        break

      case 'tools/list':
        if (!initialized) {
          sendError(id ?? null, -32002, 'Server not initialized')
          return
        }
        sendResult(id ?? null, {
          tools: config.getTools().map(t => ({
            name: t.name,
            description: t.description ?? '',
            inputSchema: t.inputSchema,
          })),
        })
        break

      case 'tools/call': {
        if (!initialized) {
          sendError(id ?? null, -32002, 'Server not initialized')
          return
        }
        const toolName = params['name'] as string
        const toolArgs = (params['arguments'] ?? {}) as Record<string, unknown>
        if (!toolName) {
          sendError(id ?? null, -32602, 'Missing tool name')
          return
        }
        try {
          const result = await config.executeTool(toolName, toolArgs)
          sendResult(id ?? null, formatToolResult(result))
        } catch (err) {
          sendResult(id ?? null, formatToolError(err))
        }
        break
      }

      case 'notifications/cancelled':
        break

      default:
        if (id !== undefined) {
          sendError(id ?? null, -32601, `Method not found: ${method}`)
        }
    }
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
