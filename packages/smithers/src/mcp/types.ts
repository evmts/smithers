import type { Client } from '@modelcontextprotocol/sdk/client'

/**
 * Transport type for MCP server connection
 */
export type MCPTransportType = 'stdio' | 'http'

/**
 * Configuration for stdio transport
 */
export interface MCPStdioConfig {
  type: 'stdio'
  /** The executable command to run */
  command: string
  /** Command line arguments */
  args?: string[]
  /** Environment variables for the process */
  env?: Record<string, string>
  /** Working directory */
  cwd?: string
}

/**
 * Configuration for HTTP transport
 */
export interface MCPHttpConfig {
  type: 'http'
  /** The URL of the MCP server */
  url: string
  /** Optional request headers */
  headers?: Record<string, string>
}

/**
 * Configuration for an MCP server connection
 */
export interface MCPServerConfig {
  /** Unique name identifier for this server */
  name: string
  /** Transport configuration */
  transport: MCPStdioConfig | MCPHttpConfig
  /** Whether to auto-connect on startup (default: true) */
  autoConnect?: boolean
  /** Connection timeout in milliseconds */
  timeout?: number
}

/**
 * Tool discovered from an MCP server
 */
export interface MCPTool {
  /** Tool name */
  name: string
  /** Tool description */
  description?: string
  /** JSON Schema for input parameters */
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }
  /** The server this tool belongs to */
  serverName: string
}

/**
 * Connection status for an MCP server
 */
export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * Active connection to an MCP server
 */
export interface MCPConnection {
  /** The MCP client instance */
  client: Client
  /** Current connection status */
  status: MCPConnectionStatus
  /** Discovered tools from this server */
  tools: MCPTool[]
  /** Server configuration */
  config: MCPServerConfig
  /** Error message if status is 'error' */
  error?: string
}

/**
 * Result from calling an MCP tool
 */
export interface MCPToolResult {
  /** Whether the tool call was successful */
  success: boolean
  /** The result content */
  content?: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  /** Error message if the call failed */
  error?: string
  /** Whether this is an error response from the tool itself */
  isError?: boolean
}
