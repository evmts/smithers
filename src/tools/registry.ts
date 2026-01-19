// Tools registry - built-in and custom tool support

import type { LegacyTool, MCPServer, ToolSpec } from './types.js'

// Re-export types for backwards compatibility
export type { MCPServer, ToolSpec }
export type Tool = LegacyTool
export type { JSONSchema } from '../components/agents/types/schema.js'
export type { SmithersToolContext as ToolContext } from './types.js'

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

/**
 * Check if a tool spec is a custom Tool object
 */
export function isCustomTool(spec: ToolSpec): spec is Tool {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'execute' in spec &&
    typeof spec.execute === 'function'
  )
}

/**
 * Check if a tool spec is a legacy Tool (has inputSchema as plain object, not Zod)
 */
export function isLegacyTool(spec: ToolSpec): spec is Tool {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'execute' in spec &&
    'inputSchema' in spec &&
    typeof (spec as any).inputSchema?.type === 'string'
  )
}

/**
 * Check if a tool spec is a SmithersTool (Zod-based with AI SDK compatibility)
 */
export function isSmithersTool(spec: ToolSpec): boolean {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'execute' in spec &&
    'inputSchema' in spec &&
    typeof (spec as any).inputSchema?._def === 'object'
  )
}

/**
 * Check if a tool spec is an MCP Server
 */
export function isMCPServer(spec: ToolSpec): spec is MCPServer {
  return typeof spec === 'object' && spec !== null && 'command' in spec && !('execute' in spec)
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
  customTools: Tool[]
  smithersTools: Tool[]
  legacyTools: Tool[]
  mcpServers: MCPServer[]
} {
  const builtinTools: string[] = []
  const customTools: Tool[] = []
  const smithersTools: Tool[] = []
  const legacyTools: Tool[] = []
  const mcpServers: MCPServer[] = []

  for (const spec of specs) {
    if (isToolName(spec)) {
      builtinTools.push(spec)
    } else if (isMCPServer(spec)) {
      mcpServers.push(spec)
    } else if (isSmithersTool(spec)) {
      smithersTools.push(spec as Tool)
    } else if (isLegacyTool(spec)) {
      customTools.push(spec)
      legacyTools.push(spec)
    } else if (isCustomTool(spec)) {
      customTools.push(spec)
    }
  }

  return { builtinTools, customTools, smithersTools, legacyTools, mcpServers }
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
