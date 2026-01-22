import type { LegacyTool, MCPServer, SmithersTool, ToolSpec } from './types.js'

export const BUILTIN_TOOLS = {
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
  Report: { cli: 'smithers', builtin: true, description: 'Report progress to orchestration' },
} as const

export type BuiltinToolName = keyof typeof BUILTIN_TOOLS

export function isBuiltinTool(name: string): name is BuiltinToolName {
  return Object.prototype.hasOwnProperty.call(BUILTIN_TOOLS, name)
}

export function getToolInfo(name: string): (typeof BUILTIN_TOOLS)[BuiltinToolName] | null {
  if (isBuiltinTool(name)) {
    return BUILTIN_TOOLS[name]
  }
  return null
}

export function isCustomTool(spec: ToolSpec): spec is LegacyTool {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'execute' in spec &&
    typeof spec.execute === 'function'
  )
}

export function isLegacyTool(spec: ToolSpec): spec is LegacyTool {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'execute' in spec &&
    'inputSchema' in spec &&
    typeof (spec as any).inputSchema?.type === 'string'
  )
}

export function isSmithersTool(spec: ToolSpec): spec is SmithersTool {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'execute' in spec &&
    'inputSchema' in spec &&
    typeof (spec as any).inputSchema?.safeParse === 'function'
  )
}

export function isMCPServer(spec: ToolSpec): spec is MCPServer {
  return typeof spec === 'object' && spec !== null && 'command' in spec && !('execute' in spec)
}

export function isToolName(spec: ToolSpec): spec is string {
  return typeof spec === 'string'
}

export function parseToolSpecs(specs: ToolSpec[]): {
  builtinTools: string[]
  customTools: LegacyTool[]
  smithersTools: SmithersTool[]
  legacyTools: LegacyTool[]
  mcpServers: MCPServer[]
} {
  const builtinTools: string[] = []
  const customTools: LegacyTool[] = []
  const smithersTools: SmithersTool[] = []
  const legacyTools: LegacyTool[] = []
  const mcpServers: MCPServer[] = []

  for (const spec of specs) {
    if (isToolName(spec)) {
      builtinTools.push(spec)
    } else if (isMCPServer(spec)) {
      mcpServers.push(spec)
    } else if (isSmithersTool(spec)) {
      smithersTools.push(spec)
    } else if (isLegacyTool(spec)) {
      customTools.push(spec)
      legacyTools.push(spec)
    } else if (isCustomTool(spec)) {
      customTools.push(spec)
    }
  }

  return { builtinTools, customTools, smithersTools, legacyTools, mcpServers }
}

export function buildToolFlags(specs: ToolSpec[]): string[] {
  const { builtinTools } = parseToolSpecs(specs)
  const flags: string[] = []

  if (builtinTools.length > 0) {
    flags.push('--allowedTools', builtinTools.join(','))
  }

  return flags
}
