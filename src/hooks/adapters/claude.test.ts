/**
 * Unit tests for claude adapter - tools prop processing
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { z } from 'zod'
import { ClaudeAdapter } from './claude.js'
import { createSmithersTool } from '../../tools/createSmithersTool.js'
import type { ClaudeProps } from '../../components/agents/types.js'
import type { MCPServer } from '../../tools/types.js'

describe('ClaudeAdapter.extractPrompt', () => {
  test('returns builtin tools from tools prop', async () => {
    const props: ClaudeProps = {
      children: 'test prompt',
      tools: ['Read', 'Bash', 'Glob'],
    }

    const result = await ClaudeAdapter.extractPrompt('test prompt', props)

    expect(result.builtinTools).toEqual(['Read', 'Bash', 'Glob'])
  })

  test('returns undefined builtinTools when no builtin tools', async () => {
    const props: ClaudeProps = {
      children: 'test prompt',
      tools: [],
    }

    const result = await ClaudeAdapter.extractPrompt('test prompt', props)

    expect(result.builtinTools).toBeUndefined()
  })

  test('creates MCP config for MCPServer in tools', async () => {
    const mcpServer: MCPServer = {
      name: 'test-server',
      command: 'npx',
      args: ['@some/mcp-server'],
    }
    const props: ClaudeProps = {
      children: 'test prompt',
      tools: [mcpServer],
    }

    const result = await ClaudeAdapter.extractPrompt('test prompt', props)

    expect(result.mcpConfigPath).toBeDefined()
    expect(result.mcpConfigPath).toContain('smithers-mcp-')
  })

  test('separates builtin tools from MCP servers', async () => {
    const mcpServer: MCPServer = {
      name: 'my-mcp',
      command: 'node',
      args: ['server.js'],
      env: { DEBUG: '1' },
    }
    const props: ClaudeProps = {
      children: 'test prompt',
      tools: ['Read', 'Bash', mcpServer],
    }

    const result = await ClaudeAdapter.extractPrompt('test prompt', props)

    expect(result.builtinTools).toEqual(['Read', 'Bash'])
    expect(result.mcpConfigPath).toBeDefined()
  })
})

describe('ClaudeAdapter.buildOptions', () => {
  test('merges builtinTools from context with allowedTools from props', () => {
    const props: ClaudeProps = {
      children: 'test',
      allowedTools: ['Edit', 'Write'],
    }
    const ctx = {
      prompt: 'test prompt',
      cwd: undefined,
      mcpConfigPath: undefined,
      builtinTools: ['Read', 'Bash'],
    }

    const options = ClaudeAdapter.buildOptions(props, ctx)

    expect(options.allowedTools).toContain('Read')
    expect(options.allowedTools).toContain('Bash')
    expect(options.allowedTools).toContain('Edit')
    expect(options.allowedTools).toContain('Write')
  })

  test('deduplicates allowedTools', () => {
    const props: ClaudeProps = {
      children: 'test',
      allowedTools: ['Read', 'Bash'],
    }
    const ctx = {
      prompt: 'test prompt',
      cwd: undefined,
      mcpConfigPath: undefined,
      builtinTools: ['Read', 'Glob'],
    }

    const options = ClaudeAdapter.buildOptions(props, ctx)

    const readCount = options.allowedTools?.filter((t: string) => t === 'Read').length
    expect(readCount).toBe(1)
  })

  test('uses only props.allowedTools when no builtinTools', () => {
    const props: ClaudeProps = {
      children: 'test',
      allowedTools: ['Read'],
    }
    const ctx = {
      prompt: 'test prompt',
      cwd: undefined,
      mcpConfigPath: undefined,
    }

    const options = ClaudeAdapter.buildOptions(props, ctx)

    expect(options.allowedTools).toEqual(['Read'])
  })

  test('uses only builtinTools when no allowedTools in props', () => {
    const props: ClaudeProps = {
      children: 'test',
    }
    const ctx = {
      prompt: 'test prompt',
      cwd: undefined,
      mcpConfigPath: undefined,
      builtinTools: ['Bash', 'Glob'],
    }

    const options = ClaudeAdapter.buildOptions(props, ctx)

    expect(options.allowedTools).toEqual(['Bash', 'Glob'])
  })

  test('passes maxTokens to options', () => {
    const props: ClaudeProps = {
      children: 'test',
      maxTokens: 4096,
    }
    const ctx = {
      prompt: 'test prompt',
      cwd: undefined,
      mcpConfigPath: undefined,
    }

    const options = ClaudeAdapter.buildOptions(props, ctx)

    expect(options.maxTokens).toBe(4096)
  })

  test('maxTokens is undefined when not specified', () => {
    const props: ClaudeProps = {
      children: 'test',
    }
    const ctx = {
      prompt: 'test prompt',
      cwd: undefined,
      mcpConfigPath: undefined,
    }

    const options = ClaudeAdapter.buildOptions(props, ctx)

    expect(options.maxTokens).toBeUndefined()
  })
})

describe('ClaudeAdapter SmithersTools integration', () => {
  const originalMcpEnabled = process.env['SMITHERS_MCP_ENABLED']

  beforeEach(() => {
    process.env['SMITHERS_MCP_ENABLED'] = '1'
  })

  afterEach(() => {
    if (originalMcpEnabled === undefined) {
      delete process.env['SMITHERS_MCP_ENABLED']
    } else {
      process.env['SMITHERS_MCP_ENABLED'] = originalMcpEnabled
    }
  })

  test('creates MCP config for SmithersTool in tools', async () => {
    const myTool = createSmithersTool({
      name: 'myTool',
      description: 'Test tool',
      inputSchema: z.object({ msg: z.string() }),
      execute: async ({ msg }) => ({ echo: msg }),
    })
    const props: ClaudeProps = {
      children: 'test prompt',
      tools: [myTool],
    }

    const result = await ClaudeAdapter.extractPrompt('test prompt', props)

    expect(result.mcpConfigPath).toBeDefined()
  })

  test('combines builtin, MCP servers, and SmithersTools', async () => {
    const myTool = createSmithersTool({
      name: 'myTool',
      description: 'Custom tool',
      inputSchema: z.object({ x: z.number() }),
      execute: async () => ({}),
    })
    const mcpServer: MCPServer = {
      name: 'external-mcp',
      command: 'npx',
      args: ['@ext/mcp'],
    }
    const props: ClaudeProps = {
      children: 'do something',
      tools: ['Read', 'Bash', myTool, mcpServer],
    }

    const result = await ClaudeAdapter.extractPrompt('do something', props)

    expect(result.builtinTools).toEqual(['Read', 'Bash'])
    expect(result.mcpConfigPath).toBeDefined()
  })
})
