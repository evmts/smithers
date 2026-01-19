import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { toolToMCPDefinition, createSmithersToolServer } from './tool-to-mcp.js'
import { createSmithersTool } from './createSmithersTool.js'
import type { SmithersTool } from './types.js'

describe('toolToMCPDefinition', () => {
  test('converts tool with string property', () => {
    const tool = createSmithersTool({
      name: 'echo',
      description: 'Echo tool',
      inputSchema: z.object({ message: z.string() }),
      execute: async ({ message }) => ({ message }),
    })

    const def = toolToMCPDefinition('echo', tool)

    expect(def.name).toBe('echo')
    expect(def.description).toBe('Echo tool')
    expect(def.inputSchema.type).toBe('object')
    expect(def.inputSchema.properties.message).toEqual({ type: 'string' })
    expect(def.inputSchema.required).toContain('message')
  })

  test('converts tool with optional properties', () => {
    const tool = createSmithersTool({
      name: 'search',
      description: 'Search tool',
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      execute: async () => ({ results: [] }),
    })

    const def = toolToMCPDefinition('search', tool)

    expect(def.inputSchema.required).toContain('query')
    expect(def.inputSchema.required).not.toContain('limit')
  })

  test('converts tool with no required properties', () => {
    const tool = createSmithersTool({
      name: 'status',
      description: 'Status check',
      inputSchema: z.object({
        verbose: z.boolean().optional(),
      }),
      execute: async () => ({ ok: true }),
    })

    const def = toolToMCPDefinition('status', tool)

    expect(def.inputSchema.required).toBeUndefined()
  })

  test('converts tool with complex nested schema', () => {
    const tool = createSmithersTool({
      name: 'create',
      description: 'Create resource',
      inputSchema: z.object({
        name: z.string(),
        config: z.object({
          enabled: z.boolean(),
          tags: z.array(z.string()).optional(),
        }),
      }),
      execute: async () => ({ id: '123' }),
    })

    const def = toolToMCPDefinition('create', tool)

    expect(def.inputSchema.properties.config).toBeDefined()
    expect(def.inputSchema.properties.config.type).toBe('object')
  })

  test('handles tool without description', () => {
    const tool: SmithersTool = {
      name: 'nodesc',
      description: '',
      inputSchema: z.object({ x: z.number() }),
      execute: async () => ({}),
    }

    const def = toolToMCPDefinition('nodesc', tool)

    expect(def.description).toBe('')
  })
})

describe('createSmithersToolServer', () => {
  test('creates MCPServer with correct structure', () => {
    const tools = {
      echo: createSmithersTool({
        name: 'echo',
        description: 'Echo',
        inputSchema: z.object({ msg: z.string() }),
        execute: async ({ msg }) => ({ msg }),
      }),
    }

    const server = createSmithersToolServer(tools, '/path/to/server.ts')

    expect(server.name).toBe('smithers-tools')
    expect(server.command).toBe('bun')
    expect(server.args).toEqual(['run', '/path/to/server.ts'])
    expect(server.env).toBeDefined()
    expect(server.env!.SMITHERS_TOOLS).toBeDefined()
  })

  test('serializes multiple tools to env', () => {
    const tools = {
      tool1: createSmithersTool({
        name: 'tool1',
        description: 'First',
        inputSchema: z.object({ a: z.string() }),
        execute: async () => ({}),
      }),
      tool2: createSmithersTool({
        name: 'tool2',
        description: 'Second',
        inputSchema: z.object({ b: z.number() }),
        execute: async () => ({}),
      }),
    }

    const server = createSmithersToolServer(tools, './server.ts')
    const parsed = JSON.parse(server.env!.SMITHERS_TOOLS!)

    expect(parsed).toHaveLength(2)
    expect(parsed[0].name).toBe('tool1')
    expect(parsed[1].name).toBe('tool2')
  })

  test('handles empty tools object', () => {
    const server = createSmithersToolServer({}, './server.ts')
    const parsed = JSON.parse(server.env!.SMITHERS_TOOLS!)

    expect(parsed).toEqual([])
  })

  test('preserves tool definitions in JSON', () => {
    const tools = {
      test: createSmithersTool({
        name: 'test',
        description: 'Test description',
        inputSchema: z.object({
          required: z.string(),
          optional: z.number().optional(),
        }),
        execute: async () => ({}),
      }),
    }

    const server = createSmithersToolServer(tools, './server.ts')
    const parsed = JSON.parse(server.env!.SMITHERS_TOOLS!)

    expect(parsed[0].name).toBe('test')
    expect(parsed[0].description).toBe('Test description')
    expect(parsed[0].inputSchema.properties.required).toEqual({ type: 'string' })
    expect(parsed[0].inputSchema.required).toContain('required')
  })
})
