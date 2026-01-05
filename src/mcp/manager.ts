import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type {
  MCPServerConfig,
  MCPConnection,
  MCPTool,
  MCPToolResult,
  MCPConnectionStatus,
} from './types.js'

/**
 * Manages connections to MCP (Model Context Protocol) servers.
 *
 * The MCPManager handles:
 * - Connecting to MCP servers via stdio or HTTP transport
 * - Discovering available tools from connected servers
 * - Executing tool calls and returning results
 * - Cleaning up connections when done
 *
 * @example
 * ```typescript
 * const manager = new MCPManager()
 *
 * // Connect to a filesystem server
 * await manager.connect({
 *   name: 'filesystem',
 *   transport: {
 *     type: 'stdio',
 *     command: 'npx',
 *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir']
 *   }
 * })
 *
 * // Get all available tools
 * const tools = manager.getAllTools()
 *
 * // Call a tool
 * const result = await manager.callTool('read_file', { path: '/path/to/file.txt' })
 *
 * // Disconnect when done
 * await manager.disconnect('filesystem')
 * ```
 */
export class MCPManager {
  private connections: Map<string, MCPConnection> = new Map()

  /**
   * Connect to an MCP server
   *
   * @param config - Server configuration including name and transport details
   * @throws Error if connection fails or times out
   */
  async connect(config: MCPServerConfig): Promise<void> {
    // Check if already connected
    const existing = this.connections.get(config.name)
    if (existing && existing.status === 'connected') {
      return
    }

    // Create client
    const client = new Client(
      {
        name: 'smithers-mcp-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    // Initialize connection state
    const connection: MCPConnection = {
      client,
      status: 'connecting' as MCPConnectionStatus,
      tools: [],
      config,
    }
    this.connections.set(config.name, connection)

    try {
      // Create transport based on config
      const transport = this.createTransport(config)

      // Connect with optional timeout
      const connectPromise = client.connect(transport)

      if (config.timeout) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Connection timeout after ${config.timeout}ms`)),
            config.timeout
          )
        })
        await Promise.race([connectPromise, timeoutPromise])
      } else {
        await connectPromise
      }

      // Discover tools
      const toolsResponse = await client.listTools()
      connection.tools = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        serverName: config.name,
      }))

      connection.status = 'connected'
    } catch (error) {
      connection.status = 'error'
      connection.error = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  /**
   * Create the appropriate transport based on configuration
   */
  private createTransport(
    config: MCPServerConfig
  ): StdioClientTransport | StreamableHTTPClientTransport {
    const transportConfig = config.transport

    if (transportConfig.type === 'stdio') {
      return new StdioClientTransport({
        command: transportConfig.command,
        args: transportConfig.args,
        env: transportConfig.env,
        cwd: transportConfig.cwd,
      })
    } else if (transportConfig.type === 'http') {
      const url = new URL(transportConfig.url)
      return new StreamableHTTPClientTransport(url, {
        requestInit: transportConfig.headers
          ? { headers: transportConfig.headers }
          : undefined,
      })
    }

    throw new Error(`Unsupported transport type: ${(transportConfig as { type: string }).type}`)
  }

  /**
   * Disconnect from an MCP server and clean up resources
   *
   * @param name - The name of the server to disconnect from
   */
  async disconnect(name: string): Promise<void> {
    const connection = this.connections.get(name)
    if (!connection) {
      return
    }

    try {
      await connection.client.close()
    } catch {
      // Ignore close errors
    }

    connection.status = 'disconnected'
    this.connections.delete(name)
  }

  /**
   * Disconnect from all connected MCP servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map((name) =>
      this.disconnect(name)
    )
    await Promise.all(disconnectPromises)
  }

  /**
   * Get all tools from all connected servers
   *
   * @returns Array of all discovered tools with their server names
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = []
    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        allTools.push(...connection.tools)
      }
    }
    return allTools
  }

  /**
   * Get tools from a specific server
   *
   * @param serverName - The name of the server
   * @returns Array of tools from that server, or empty array if not found
   */
  getToolsForServer(serverName: string): MCPTool[] {
    const connection = this.connections.get(serverName)
    if (!connection || connection.status !== 'connected') {
      return []
    }
    return connection.tools
  }

  /**
   * Call a tool on an MCP server
   *
   * @param toolName - The name of the tool to call
   * @param args - Arguments to pass to the tool
   * @returns The tool execution result
   */
  async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<MCPToolResult> {
    // Find the server that has this tool
    let targetConnection: MCPConnection | undefined
    let targetTool: MCPTool | undefined

    for (const connection of this.connections.values()) {
      if (connection.status !== 'connected') continue
      const tool = connection.tools.find((t) => t.name === toolName)
      if (tool) {
        targetConnection = connection
        targetTool = tool
        break
      }
    }

    if (!targetConnection || !targetTool) {
      return {
        success: false,
        error: `Tool "${toolName}" not found in any connected server`,
      }
    }

    try {
      const result = await targetConnection.client.callTool({
        name: toolName,
        arguments: args,
      })

      // Handle the result format
      if ('content' in result && Array.isArray(result.content)) {
        return {
          success: !result.isError,
          content: result.content.map((item) => ({
            type: item.type as 'text' | 'image' | 'resource',
            text: 'text' in item ? item.text : undefined,
            data: 'data' in item ? item.data : undefined,
            mimeType: 'mimeType' in item ? item.mimeType : undefined,
          })),
          isError: result.isError,
        }
      }

      // Handle legacy toolResult format
      if ('toolResult' in result) {
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.toolResult),
            },
          ],
        }
      }

      return {
        success: true,
        content: [],
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Get connection status for a server
   *
   * @param name - The server name
   * @returns The connection status, or 'disconnected' if not found
   */
  getStatus(name: string): MCPConnectionStatus {
    const connection = this.connections.get(name)
    return connection?.status ?? 'disconnected'
  }

  /**
   * Get all connection statuses
   *
   * @returns Map of server names to their connection statuses
   */
  getAllStatuses(): Map<string, MCPConnectionStatus> {
    const statuses = new Map<string, MCPConnectionStatus>()
    for (const [name, connection] of this.connections) {
      statuses.set(name, connection.status)
    }
    return statuses
  }

  /**
   * Check if a specific server is connected
   *
   * @param name - The server name
   * @returns True if the server is connected
   */
  isConnected(name: string): boolean {
    return this.getStatus(name) === 'connected'
  }

  /**
   * Get error message for a server connection
   *
   * @param name - The server name
   * @returns Error message if there was an error, undefined otherwise
   */
  getError(name: string): string | undefined {
    const connection = this.connections.get(name)
    return connection?.error
  }
}
