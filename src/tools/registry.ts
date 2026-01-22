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

export type ToolClassification =
  | { kind: 'builtin'; name: BuiltinToolName }
  | { kind: 'tool-name'; name: string }
  | { kind: 'mcp-server'; server: MCPServer }
  | { kind: 'smithers'; tool: SmithersTool }
  | { kind: 'legacy'; tool: LegacyTool }
  | { kind: 'custom'; tool: LegacyTool }
  | { kind: 'unknown'; spec: ToolSpec }

function isToolObject(spec: ToolSpec): spec is Exclude<ToolSpec, string> {
  return typeof spec === 'object' && spec !== null
}

function isSmithersToolSpec(spec: ToolSpec): spec is SmithersTool {
  return (
    isToolObject(spec) &&
    'execute' in spec &&
    'inputSchema' in spec &&
    typeof (spec as any).inputSchema?.safeParse === 'function'
  )
}

function isLegacyToolSpec(spec: ToolSpec): spec is LegacyTool {
  return (
    isToolObject(spec) &&
    'execute' in spec &&
    'inputSchema' in spec &&
    typeof (spec as any).inputSchema?.type === 'string'
  )
}

function isCustomToolSpec(spec: ToolSpec): spec is LegacyTool {
  return (
    isToolObject(spec) &&
    'execute' in spec &&
    typeof (spec as any).execute === 'function'
  )
}

function isMCPServerSpec(spec: ToolSpec): spec is MCPServer {
  return isToolObject(spec) && 'command' in spec && !('execute' in spec)
}

export function classifyTool(spec: ToolSpec): ToolClassification {
  if (typeof spec === 'string') {
    if (isBuiltinTool(spec)) {
      return { kind: 'builtin', name: spec }
    }
    return { kind: 'tool-name', name: spec }
  }

  if (isSmithersToolSpec(spec)) {
    return { kind: 'smithers', tool: spec }
  }

  if (isLegacyToolSpec(spec)) {
    return { kind: 'legacy', tool: spec }
  }

  if (isCustomToolSpec(spec)) {
    return { kind: 'custom', tool: spec }
  }

  if (isMCPServerSpec(spec)) {
    return { kind: 'mcp-server', server: spec }
  }

  return { kind: 'unknown', spec }
}

export function isCustomTool(spec: ToolSpec): spec is LegacyTool {
  const kind = classifyTool(spec).kind
  return kind === 'custom' || kind === 'legacy' || kind === 'smithers'
}

export function isLegacyTool(spec: ToolSpec): spec is LegacyTool {
  return classifyTool(spec).kind === 'legacy'
}

export function isSmithersTool(spec: ToolSpec): spec is SmithersTool {
  return classifyTool(spec).kind === 'smithers'
}

export function isMCPServer(spec: ToolSpec): spec is MCPServer {
  return classifyTool(spec).kind === 'mcp-server'
}

export function isToolName(spec: ToolSpec): spec is string {
  const kind = classifyTool(spec).kind
  return kind === 'tool-name' || kind === 'builtin'
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
    const classified = classifyTool(spec)
    if (classified.kind === 'builtin' || classified.kind === 'tool-name') {
      builtinTools.push(classified.name)
    } else if (classified.kind === 'mcp-server') {
      mcpServers.push(classified.server)
    } else if (classified.kind === 'smithers') {
      smithersTools.push(classified.tool)
    } else if (classified.kind === 'legacy') {
      customTools.push(classified.tool)
      legacyTools.push(classified.tool)
    } else if (classified.kind === 'custom') {
      customTools.push(classified.tool)
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
