import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import {
  BUILTIN_TOOLS,
  isBuiltinTool,
  getToolInfo,
  isCustomTool,
  isLegacyTool,
  isSmithersTool,
  classifyTool,
  isMCPServer,
  isToolName,
  parseToolSpecs,
  buildToolFlags,
} from './registry.js'
import type { LegacyTool, MCPServer } from './types.js'
import { createSmithersTool } from './createSmithersTool.js'

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

  test('all built-in tools return true', () => {
    const allBuiltins = Object.keys(BUILTIN_TOOLS)
    for (const name of allBuiltins) {
      expect(isBuiltinTool(name)).toBe(true)
    }
  })

  test('returns false for unknown tools', () => {
    expect(isBuiltinTool('CustomTool')).toBe(false)
    expect(isBuiltinTool('random')).toBe(false)
  })

  test('is case-sensitive', () => {
    expect(isBuiltinTool('read')).toBe(false)
    expect(isBuiltinTool('READ')).toBe(false)
  })

  test('empty string returns false', () => {
    expect(isBuiltinTool('')).toBe(false)
  })

  test('null/undefined coerced to string', () => {
    expect(isBuiltinTool(String(null))).toBe(false)
    expect(isBuiltinTool(String(undefined))).toBe(false)
  })

  test('special characters in tool name returns false', () => {
    expect(isBuiltinTool('Read!')).toBe(false)
    expect(isBuiltinTool('Read@Edit')).toBe(false)
    expect(isBuiltinTool('Read\n')).toBe(false)
    expect(isBuiltinTool('Read\0')).toBe(false)
  })

  test('whitespace-padded tool names return false', () => {
    expect(isBuiltinTool(' Read')).toBe(false)
    expect(isBuiltinTool('Read ')).toBe(false)
    expect(isBuiltinTool(' Read ')).toBe(false)
    expect(isBuiltinTool('\tRead')).toBe(false)
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

  test('returns correct info for all built-in tools', () => {
    const allBuiltins = Object.keys(BUILTIN_TOOLS) as (keyof typeof BUILTIN_TOOLS)[]
    for (const name of allBuiltins) {
      const info = getToolInfo(name)
      expect(info).not.toBeNull()
      expect(info).toEqual(BUILTIN_TOOLS[name])
    }
  })

  test('returns null for unknown tools', () => {
    const info = getToolInfo('UnknownTool')

    expect(info).toBeNull()
  })

  test('empty string returns null', () => {
    expect(getToolInfo('')).toBeNull()
  })

  test('very long tool names return null', () => {
    const longName = 'A'.repeat(10000)
    expect(getToolInfo(longName)).toBeNull()
  })

  test('returns same reference for same tool', () => {
    const info1 = getToolInfo('Read')
    const info2 = getToolInfo('Read')
    // Returns same reference from const object
    expect(info1).toBe(info2)
  })
})

describe('isCustomTool', () => {
  test('returns true for tool objects with execute', () => {
    const tool: LegacyTool = {
      name: 'custom',
      description: 'A custom tool',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }

    expect(isCustomTool(tool)).toBe(true)
    expect(isLegacyTool(tool)).toBe(true)
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
    expect(isLegacyTool(server)).toBe(false)
  })
})

describe('classifyTool', () => {
  test('classifies builtin tool names', () => {
    const result = classifyTool('Read')
    expect(result.kind).toBe('builtin')
  })

  test('classifies non-builtin tool names', () => {
    const result = classifyTool('CustomTool')
    expect(result.kind).toBe('tool-name')
  })

  test('classifies MCP servers', () => {
    const server: MCPServer = { name: 'mcp', command: 'node', args: ['server.js'] }
    const result = classifyTool(server)
    expect(result.kind).toBe('mcp-server')
  })

  test('classifies legacy tools', () => {
    const tool: LegacyTool = {
      name: 'legacy',
      description: 'legacy',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }
    const result = classifyTool(tool)
    expect(result.kind).toBe('legacy')
  })

  test('classifies smithers tools', () => {
    const tool = createSmithersTool({
      name: 'smithers',
      description: 'smithers',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => ({ result: value }),
    })
    const result = classifyTool(tool)
    expect(result.kind).toBe('smithers')
  })

  test('classifies custom tools', () => {
    const tool = { name: 'custom', description: 'custom', execute: async () => {} }
    const result = classifyTool(tool as any)
    expect(result.kind).toBe('custom')
  })
})

describe('isSmithersTool', () => {
  test('returns true for AI SDK tools', () => {
    const tool = createSmithersTool({
      name: 'smithers',
      description: 'Test tool',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => ({ result: value }),
    })

    expect(isSmithersTool(tool)).toBe(true)
  })

  test('returns false for legacy tools', () => {
    const tool: LegacyTool = {
      name: 'legacy',
      description: 'Legacy tool',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }

    expect(isSmithersTool(tool)).toBe(false)
  })

  test('returns false for null', () => {
    expect(isSmithersTool(null as any)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(isSmithersTool(undefined as any)).toBe(false)
  })

  test('returns false for non-zod inputSchema', () => {
    const legacyLike: LegacyTool = {
      name: 'legacyish',
      description: 'legacyish tool',
      inputSchema: { type: 'object' },
      execute: async () => ({ result: 'done' }),
    }
    expect(isSmithersTool(legacyLike)).toBe(false)
  })

  test('handles async execute functions', () => {
    const asyncTool = {
      name: 'async',
      description: 'async tool',
      inputSchema: z.object({ value: z.string() }),
      execute: async () => ({ result: 'done' }),
    }
    expect(isSmithersTool(asyncTool as any)).toBe(true)
  })

  test('handles sync execute functions', () => {
    const syncTool = {
      name: 'sync',
      description: 'sync tool',
      inputSchema: z.object({ value: z.string() }),
      execute: () => Promise.resolve({ result: 'done' }),
    }
    expect(isSmithersTool(syncTool as any)).toBe(true)
  })

  test('handles tool with missing name/description/inputSchema', () => {
    // Missing inputSchema should fail Smithers tool guard
    const minimalTool = { execute: async () => {} }
    expect(isSmithersTool(minimalTool as any)).toBe(false)

    const noExecute = { name: 'test', description: 'test', inputSchema: z.object({}) }
    expect(isSmithersTool(noExecute as any)).toBe(false)
  })
})

describe('isMCPServer', () => {
  test('returns true for MCP server objects', () => {
    const server: MCPServer = {
      name: 'sqlite',
      command: 'bunx',
      args: ['-y', '@anthropic/mcp-server-sqlite'],
    }

    expect(isMCPServer(server)).toBe(true)
  })

  test('returns false for strings', () => {
    expect(isMCPServer('Read')).toBe(false)
  })

  test('returns false for custom tools', () => {
    const tool: LegacyTool = {
      name: 'custom',
      description: 'test',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }

    expect(isMCPServer(tool)).toBe(false)
  })

  test('returns false for null', () => {
    expect(isMCPServer(null as any)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(isMCPServer(undefined as any)).toBe(false)
  })

  test('empty args array', () => {
    const server: MCPServer = {
      name: 'test',
      command: 'node',
      args: [],
    }
    expect(isMCPServer(server)).toBe(true)
  })

  test('empty env object', () => {
    const server: MCPServer = {
      name: 'test',
      command: 'node',
      env: {},
    }
    expect(isMCPServer(server)).toBe(true)
  })

  test('complex env variables', () => {
    const server: MCPServer = {
      name: 'complex',
      command: 'python',
      args: ['-m', 'server'],
      env: {
        PATH: '/usr/bin:/usr/local/bin',
        NODE_ENV: 'production',
        API_KEY: 'secret-key-123',
        MULTI_LINE: 'line1\nline2',
        SPECIAL_CHARS: '!@#$%^&*()',
      },
    }
    expect(isMCPServer(server)).toBe(true)
  })
})

describe('isToolName', () => {
  test('returns true for strings', () => {
    expect(isToolName('Read')).toBe(true)
    expect(isToolName('custom-tool')).toBe(true)
  })

  test('returns true for valid string', () => {
    expect(isToolName('MyTool')).toBe(true)
    expect(isToolName('tool-with-dashes')).toBe(true)
    expect(isToolName('tool_with_underscores')).toBe(true)
  })

  test('returns true for empty string', () => {
    expect(isToolName('')).toBe(true)
  })

  test('returns false for objects', () => {
    expect(isToolName({ name: 'test' } as any)).toBe(false)
  })

  test('returns false for number', () => {
    expect(isToolName(123 as any)).toBe(false)
    expect(isToolName(0 as any)).toBe(false)
    expect(isToolName(-1 as any)).toBe(false)
  })

  test('returns false for null', () => {
    expect(isToolName(null as any)).toBe(false)
  })

  test('returns false for array', () => {
    expect(isToolName(['Read'] as any)).toBe(false)
    expect(isToolName([] as any)).toBe(false)
  })
})

describe('parseToolSpecs', () => {
  test('separates built-in tools', () => {
    const specs = ['Read', 'Edit', 'Bash']
    const result = parseToolSpecs(specs)

    expect(result.builtinTools).toEqual(['Read', 'Edit', 'Bash'])
    expect(result.customTools).toHaveLength(0)
    expect(result.smithersTools).toHaveLength(0)
    expect(result.legacyTools).toHaveLength(0)
    expect(result.mcpServers).toHaveLength(0)
  })

  test('separates custom tools', () => {
    const customTool: LegacyTool = {
      name: 'custom',
      description: 'test',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }
    const specs = [customTool]
    const result = parseToolSpecs(specs)

    expect(result.customTools).toHaveLength(1)
    expect(result.customTools[0]).toBe(customTool)
    expect(result.legacyTools).toHaveLength(1)
    expect(result.smithersTools).toHaveLength(0)
  })

  test('separates MCP servers', () => {
    const mcpServer: MCPServer = {
      name: 'sqlite',
      command: 'bunx',
      args: ['-y', '@anthropic/mcp-server-sqlite'],
    }
    const specs = [mcpServer]
    const result = parseToolSpecs(specs)

    expect(result.mcpServers).toHaveLength(1)
    expect(result.mcpServers[0]).toBe(mcpServer)
  })

  test('separates Smithers tools', () => {
    const smithersTool = createSmithersTool({
      name: 'greet',
      description: 'Greet user',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => ({ greeting: `hi ${name}` }),
    })
    const result = parseToolSpecs([smithersTool])

    expect(result.smithersTools).toHaveLength(1)
    expect(result.smithersTools[0]).toBe(smithersTool)
    expect(result.customTools).toHaveLength(0)
  })

  test('handles mixed specs', () => {
    const customTool: LegacyTool = {
      name: 'custom',
      description: 'test',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }
    const smithersTool = createSmithersTool({
      name: 'smithers',
      description: 'Smithers tool',
      inputSchema: z.object({ name: z.string() }),
      execute: async () => ({ ok: true }),
    })
    const mcpServer: MCPServer = {
      name: 'sqlite',
      command: 'bunx',
    }
    const specs = ['Read', customTool, smithersTool, mcpServer, 'Edit']
    const result = parseToolSpecs(specs)

    expect(result.builtinTools).toEqual(['Read', 'Edit'])
    expect(result.customTools).toHaveLength(1)
    expect(result.smithersTools).toHaveLength(1)
    expect(result.mcpServers).toHaveLength(1)
  })

  test('handles empty array', () => {
    const result = parseToolSpecs([])

    expect(result.builtinTools).toHaveLength(0)
    expect(result.customTools).toHaveLength(0)
    expect(result.smithersTools).toHaveLength(0)
    expect(result.legacyTools).toHaveLength(0)
    expect(result.mcpServers).toHaveLength(0)
  })

  test('handles duplicate tool names', () => {
    const specs = ['Read', 'Edit', 'Read', 'Bash', 'Edit']
    const result = parseToolSpecs(specs)

    // Duplicates are preserved (not deduplicated)
    expect(result.builtinTools).toEqual(['Read', 'Edit', 'Read', 'Bash', 'Edit'])
    expect(result.builtinTools).toHaveLength(5)
  })

  test('preserves order of tools', () => {
    const customTool1: LegacyTool = {
      name: 'first',
      description: 'first',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }
    const customTool2: LegacyTool = {
      name: 'second',
      description: 'second',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }
    const specs = ['Bash', customTool1, 'Read', customTool2, 'Edit']
    const result = parseToolSpecs(specs)

    expect(result.builtinTools).toEqual(['Bash', 'Read', 'Edit'])
    expect(result.customTools[0].name).toBe('first')
    expect(result.customTools[1].name).toBe('second')
  })

  test('very large arrays', () => {
    const largeSpecs: string[] = []
    for (let i = 0; i < 10000; i++) {
      largeSpecs.push(`Tool${i}`)
    }
    const result = parseToolSpecs(largeSpecs)

    expect(result.builtinTools).toHaveLength(10000)
    expect(result.builtinTools[0]).toBe('Tool0')
    expect(result.builtinTools[9999]).toBe('Tool9999')
  })

  test('ambiguous spec with both execute and command', () => {
    // Object with both execute AND command - isCustomTool checks 'execute' first
    const ambiguous = {
      name: 'ambiguous',
      command: 'node',
      execute: async () => {},
    }
    const result = parseToolSpecs([ambiguous as any])

    // Has 'execute' so classified as custom tool, not MCP server
    expect(result.customTools).toHaveLength(1)
    expect(result.mcpServers).toHaveLength(0)
  })

  test('non-builtin string tool names', () => {
    // Strings that are not built-in tool names are still categorized as builtin tools
    const specs = ['CustomTool', 'AnotherOne', 'NotReal']
    const result = parseToolSpecs(specs)

    expect(result.builtinTools).toEqual(['CustomTool', 'AnotherOne', 'NotReal'])
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
    const customTool: LegacyTool = {
      name: 'custom',
      description: 'test',
      inputSchema: { type: 'object' },
      execute: async () => {},
    }
    const mcpServer: MCPServer = {
      name: 'sqlite',
      command: 'bunx',
    }
    const specs = [customTool, mcpServer]
    const flags = buildToolFlags(specs)

    expect(flags).toHaveLength(0)
  })

  test('single tool', () => {
    const flags = buildToolFlags(['Read'])

    expect(flags).toEqual(['--allowedTools', 'Read'])
  })

  test('special characters in names', () => {
    const flags = buildToolFlags(['Tool@1', 'Tool#2', 'Tool$3'])

    expect(flags).toContain('--allowedTools')
    expect(flags[1]).toBe('Tool@1,Tool#2,Tool$3')
  })

  test('very long tool lists', () => {
    const tools: string[] = []
    for (let i = 0; i < 1000; i++) {
      tools.push(`Tool${i}`)
    }
    const flags = buildToolFlags(tools)

    expect(flags).toHaveLength(2)
    expect(flags[0]).toBe('--allowedTools')
    expect(flags[1].split(',')).toHaveLength(1000)
  })

  test('preserves order', () => {
    const specs = ['Bash', 'Read', 'Edit', 'Grep', 'Glob']
    const flags = buildToolFlags(specs)

    expect(flags[1]).toBe('Bash,Read,Edit,Grep,Glob')
  })
})
