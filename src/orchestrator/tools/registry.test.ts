/**
 * Unit tests for registry.ts - Tool registry and specifications.
 */
import { describe, test, expect } from 'bun:test'
import {
  BUILTIN_TOOLS,
  isBuiltinTool,
  getToolInfo,
  isCustomTool,
  isMCPServer,
  isToolName,
  parseToolSpecs,
  buildToolFlags,
  type Tool,
  type MCPServer,
} from './registry'

describe('BUILTIN_TOOLS', () => {
  test('contains Read tool', () => {
    expect(BUILTIN_TOOLS.Read).toBeDefined()
    expect(BUILTIN_TOOLS.Read.cli).toBe('claude')
  })

  test('contains Edit tool', () => {
    expect(BUILTIN_TOOLS.Edit).toBeDefined()
  })

  test('contains Bash tool', () => {
    expect(BUILTIN_TOOLS.Bash).toBeDefined()
  })

  test('contains smithers-specific tools', () => {
    expect(BUILTIN_TOOLS.Report).toBeDefined()
    expect(BUILTIN_TOOLS.Report.cli).toBe('smithers')
  })
})

describe('isBuiltinTool', () => {
  test('returns true for built-in tool names', () => {
    expect(isBuiltinTool('Read')).toBe(true)
    expect(isBuiltinTool('Edit')).toBe(true)
    expect(isBuiltinTool('Bash')).toBe(true)
  })

  test('returns false for unknown tools', () => {
    expect(isBuiltinTool('CustomTool')).toBe(false)
    expect(isBuiltinTool('random')).toBe(false)
  })

  test('is case-sensitive', () => {
    expect(isBuiltinTool('read')).toBe(false)
    expect(isBuiltinTool('READ')).toBe(false)
  })
})

describe('getToolInfo', () => {
  test('returns tool info for built-in tools', () => {
    const info = getToolInfo('Read')

    expect(info).not.toBeNull()
    expect(info?.cli).toBe('claude')
    expect(info?.builtin).toBe(true)
    expect(info?.description).toBeDefined()
  })

  test('returns null for unknown tools', () => {
    const info = getToolInfo('UnknownTool')

    expect(info).toBeNull()
  })
})

describe('isCustomTool', () => {
  test('returns true for tool objects with execute', () => {
    const tool: Tool = {
      name: 'custom',
      description: 'A custom tool',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }

    expect(isCustomTool(tool)).toBe(true)
  })

  test('returns false for strings', () => {
    expect(isCustomTool('Read')).toBe(false)
  })

  test('returns false for MCP servers', () => {
    const server: MCPServer = {
      name: 'test',
      command: 'node',
      args: ['server.js'],
    }

    expect(isCustomTool(server)).toBe(false)
  })
})

describe('isMCPServer', () => {
  test('returns true for MCP server objects', () => {
    const server: MCPServer = {
      name: 'sqlite',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-sqlite'],
    }

    expect(isMCPServer(server)).toBe(true)
  })

  test('returns false for strings', () => {
    expect(isMCPServer('Read')).toBe(false)
  })

  test('returns false for custom tools', () => {
    const tool: Tool = {
      name: 'custom',
      description: 'test',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }

    expect(isMCPServer(tool)).toBe(false)
  })
})

describe('isToolName', () => {
  test('returns true for strings', () => {
    expect(isToolName('Read')).toBe(true)
    expect(isToolName('custom-tool')).toBe(true)
  })

  test('returns false for objects', () => {
    expect(isToolName({ name: 'test' } as any)).toBe(false)
  })
})

describe('parseToolSpecs', () => {
  test('separates built-in tools', () => {
    const specs = ['Read', 'Edit', 'Bash']
    const result = parseToolSpecs(specs)

    expect(result.builtinTools).toEqual(['Read', 'Edit', 'Bash'])
    expect(result.customTools).toHaveLength(0)
    expect(result.mcpServers).toHaveLength(0)
  })

  test('separates custom tools', () => {
    const customTool: Tool = {
      name: 'custom',
      description: 'test',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }
    const specs = [customTool]
    const result = parseToolSpecs(specs)

    expect(result.customTools).toHaveLength(1)
    expect(result.customTools[0]).toBe(customTool)
  })

  test('separates MCP servers', () => {
    const mcpServer: MCPServer = {
      name: 'sqlite',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-sqlite'],
    }
    const specs = [mcpServer]
    const result = parseToolSpecs(specs)

    expect(result.mcpServers).toHaveLength(1)
    expect(result.mcpServers[0]).toBe(mcpServer)
  })

  test('handles mixed specs', () => {
    const customTool: Tool = {
      name: 'custom',
      description: 'test',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }
    const mcpServer: MCPServer = {
      name: 'sqlite',
      command: 'npx',
    }
    const specs = ['Read', customTool, mcpServer, 'Edit']
    const result = parseToolSpecs(specs)

    expect(result.builtinTools).toEqual(['Read', 'Edit'])
    expect(result.customTools).toHaveLength(1)
    expect(result.mcpServers).toHaveLength(1)
  })

  test('handles empty array', () => {
    const result = parseToolSpecs([])

    expect(result.builtinTools).toHaveLength(0)
    expect(result.customTools).toHaveLength(0)
    expect(result.mcpServers).toHaveLength(0)
  })
})

describe('buildToolFlags', () => {
  test('builds --allowedTools flag for built-in tools', () => {
    const specs = ['Read', 'Edit', 'Bash']
    const flags = buildToolFlags(specs)

    expect(flags).toContain('--allowedTools')
    expect(flags).toContain('Read,Edit,Bash')
  })

  test('returns empty array for empty specs', () => {
    const flags = buildToolFlags([])

    expect(flags).toHaveLength(0)
  })

  test('ignores custom tools and MCP servers', () => {
    const customTool: Tool = {
      name: 'custom',
      description: 'test',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }
    const mcpServer: MCPServer = {
      name: 'sqlite',
      command: 'npx',
    }
    const specs = [customTool, mcpServer]
    const flags = buildToolFlags(specs)

    expect(flags).toHaveLength(0)
  })
})
