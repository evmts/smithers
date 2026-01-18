// Tools registry - built-in and custom tool support

import type { SmithersDB } from '../db/index.js'
import type { JSONSchema } from '../components/agents/types/schema.js'
import type { LegacyTool, MCPServer, SmithersTool, ToolSpec } from './types.js'

// ============================================================================
// TYPES
// ============================================================================

export interface ToolContext {
  db: SmithersDB
  agentId: string
  executionId: string
  cwd: string
  env: Record<string, string>
  log: (message: string) => void
}

export type Tool = LegacyTool
export type { JSONSchema }

// ============================================================================
// BUILT-IN TOOLS REGISTRY
// ============================================================================

/**
 * Registry of built-in tools available in different CLIs
 */
export const BUILTIN_TOOLS = {
  // Claude Code built-in tools
  Read: { cli: 'claude', builtin: true, description: 'Read file contents' },
  Edit: { cli: 'claude', builtin: true, description: 'Edit file contents' },
  Write: { cli: 'claude', builtin: true, description: 'Write new files' },
  Bash: { cli: 'claude', builtin: true, description: 'Execute shell commands' },
  Glob: { cli: 'claude', builtin: true, description: 'Find files by pattern' },
  Grep: { cli: 'claude', builtin: true, description: 'Search file contents' },
  Task: { cli: 'claude', builtin: true, description: 'Launch subagent tasks' },
  WebFetch: { cli: 'claude', builtin: true, description: 'Fetch web content' },
  WebSearch: { cli: 'claude', builtin: true, description: 'Search the web' },
  TodoWrite: { cli: 'claude', builtin: true, description: 'Manage todo lists' },

  // Smithers-specific tools
  Report: { cli: 'smithers', builtin: true, description: 'Report progress to orchestration' },
} as const

export type BuiltinToolName = keyof typeof BUILTIN_TOOLS

/**
 * Check if a tool name is a built-in tool
 */
export function isBuiltinTool(name: string): name is BuiltinToolName {
  return name in BUILTIN_TOOLS
}

/**
 * Get tool information
 */
export function getToolInfo(name: string): (typeof BUILTIN_TOOLS)[BuiltinToolName] | null {
  if (isBuiltinTool(name)) {
    return BUILTIN_TOOLS[name]
  }
  return null
}

// ============================================================================
// TOOL SPECIFICATION HELPERS
// ============================================================================

export type { ToolSpec }

/**
 * Check if a tool spec is a custom Tool object
 */
export function isLegacyTool(spec: ToolSpec): spec is LegacyTool {
  return typeof spec === 'object' && 'execute' in spec && !isMCPServer(spec) && !isSmithersTool(spec)
}

export function isCustomTool(spec: ToolSpec): spec is LegacyTool {
  return isLegacyTool(spec)
}

export function isSmithersTool(spec: ToolSpec): spec is SmithersTool {
  if (typeof spec !== 'object' || spec === null) return false
  if (!('execute' in spec) || !('inputSchema' in spec)) return false
  if (isMCPServer(spec)) return false
  const schema = (spec as { inputSchema?: unknown }).inputSchema
  return typeof schema === 'object' && schema !== null && 'safeParse' in (schema as Record<string, unknown>)
}

/**
 * Check if a tool spec is an MCP Server
 */
export function isMCPServer(spec: ToolSpec): spec is MCPServer {
  return typeof spec === 'object' && 'command' in spec && !('execute' in spec)
}

/**
 * Check if a tool spec is a built-in tool name
 */
export function isToolName(spec: ToolSpec): spec is string {
  return typeof spec === 'string'
}

/**
 * Parse tool specifications into categorized lists
 */
export function parseToolSpecs(specs: ToolSpec[]): {
  builtinTools: string[]
  smithersTools: SmithersTool[]
  legacyTools: LegacyTool[]
  customTools: LegacyTool[]
  mcpServers: MCPServer[]
} {
  const builtinTools: string[] = []
  const smithersTools: SmithersTool[] = []
  const legacyTools: LegacyTool[] = []
  const mcpServers: MCPServer[] = []

  for (const spec of specs) {
    if (isToolName(spec)) {
      builtinTools.push(spec)
    } else if (isSmithersTool(spec)) {
      smithersTools.push(spec)
    } else if (isLegacyTool(spec)) {
      legacyTools.push(spec)
    } else if (isMCPServer(spec)) {
      mcpServers.push(spec)
    }
  }

  return { builtinTools, smithersTools, legacyTools, customTools: legacyTools, mcpServers }
}

/**
 * Build CLI tool flags from tool specs
 */
export function buildToolFlags(specs: ToolSpec[]): string[] {
  const { builtinTools } = parseToolSpecs(specs)
  const flags: string[] = []

  // Add --allowedTools flag for built-in tools
  if (builtinTools.length > 0) {
    flags.push('--allowedTools', builtinTools.join(','))
  }

  return flags
}
