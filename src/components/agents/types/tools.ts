// Tool and MCP Server type definitions for Smithers orchestrator

import type { JSONSchema } from './schema.js'

// ============================================================================
// Tool Context
// ============================================================================

export interface ToolContext {
  /**
   * Current execution ID
   */
  executionId: string

  /**
   * Current agent ID
   */
  agentId: string

  /**
   * Working directory
   */
  cwd: string

  /**
   * Environment variables
   */
  env: Record<string, string>

  /**
   * Log a message
   */
  log: (message: string) => void
}

// ============================================================================
// Tool Definition
// ============================================================================

export interface Tool {
  /**
   * Tool name (must be unique)
   */
  name: string

  /**
   * Human-readable description
   */
  description: string

  /**
   * JSON Schema for input validation
   */
  inputSchema: JSONSchema

  /**
   * Execute the tool with given input
   */
  execute: (input: any, context: ToolContext) => Promise<any>
}

// ============================================================================
// MCP Server Definition
// ============================================================================

export interface MCPServer {
  /**
   * Server name (for identification)
   */
  name: string

  /**
   * Command to run the MCP server
   */
  command: string

  /**
   * Command arguments
   */
  args?: string[]

  /**
   * Environment variables
   */
  env?: Record<string, string>
}
