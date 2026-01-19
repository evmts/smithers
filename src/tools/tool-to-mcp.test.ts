/**
 * Unit tests for tool-to-mcp.ts - MCP definition conversion
 */
import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { toolToMCPDefinition, createSmithersToolServer } from './tool-to-mcp.js'
import { createSmithersTool } from './createSmithersTool.js'

describe('toolToMCPDefinition', () => {
  test('converts simple schema', () => {
    const tool = createSmithersTool({
      name: 'greet',
      description: 'Greet a user',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello ${name}`,
    })

    const def = toolToMCPDefinition('greet', tool)

    expect(def.name).toBe('greet')
    expect(def.description).toBe('Greet a user')
    expect(def.inputSchema.type).toBe('object')
    expect(def.inputSchema.properties.name).toEqual({ type: 'string' })
    expect(def.inputSchema.required).toContain('name')
  })

  test('handles optional properties', () => {
    const tool = createSmithersTool({
      name: 'search',
      description: 'Search items',
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      execute: async () => [],
    })

    const def = toolToMCPDefinition('search', tool)

    expect(def.inputSchema.required).toContain('query')
    expect(def.inputSchema.required).not.toContain('limit')
  })

  test('handles nested objects', () => {
    const tool = createSmithersTool({
      name: 'config',
      description: 'Configure settings',
      inputSchema: z.object({
        settings: z.object({
          enabled: z.boolean(),
          level: z.number(),
        }),
      }),
      execute: async () => ({}),
    })

    const def = toolToMCPDefinition('config', tool)

    expect(def.inputSchema.properties.settings.type).toBe('object')
    expect(def.inputSchema.properties.settings.properties.enabled).toEqual({ type: 'boolean' })
  })

  test('handles arrays', () => {
    const tool = createSmithersTool({
      name: 'batch',
      description: 'Batch process',
      inputSchema: z.object({
        items: z.array(z.string()),
      }),
      execute: async () => [],
    })

    const def = toolToMCPDefinition('batch', tool)

    expect(def.inputSchema.properties.items.type).toBe('array')
    expect(def.inputSchema.properties.items.items).toEqual({ type: 'string' })
  })

  test('handles enums', () => {
    const tool = createSmithersTool({
      name: 'status',
      description: 'Set status',
      inputSchema: z.object({
        status: z.enum(['active', 'inactive', 'pending']),
      }),
      execute: async () => ({}),
    })

    const def = toolToMCPDefinition('status', tool)

    expect(def.inputSchema.properties.status.enum).toEqual(['active', 'inactive', 'pending'])
  })
})

describe('createSmithersToolServer', () => {
  test('creates MCP server config', () => {
    const tools = {
      greet: createSmithersTool({
        name: 'greet',
        description: 'Greet user',
        inputSchema: z.object({ name: z.string() }),
        execute: async ({ name }) => `Hello ${name}`,
      }),
    }

    const server = createSmithersToolServer(tools, '/path/to/server.ts')

    expect(server.name).toBe('smithers-tools')
    expect(server.command).toBe('bun')
    expect(server.args).toEqual(['run', '/path/to/server.ts'])
    expect(server.env).toBeDefined()
    expect(server.env!['SMITHERS_TOOLS']).toBeDefined()
  })

  test('serializes multiple tools', () => {
    const tools = {
      tool1: createSmithersTool({
        name: 'tool1',
        description: 'Tool 1',
        inputSchema: z.object({ a: z.string() }),
        execute: async () => ({}),
      }),
      tool2: createSmithersTool({
        name: 'tool2',
        description: 'Tool 2',
        inputSchema: z.object({ b: z.number() }),
        execute: async () => ({}),
      }),
    }

    const server = createSmithersToolServer(tools, '/server.ts')
    const serialized = JSON.parse(server.env!['SMITHERS_TOOLS'])

    expect(serialized).toHaveLength(2)
    expect(serialized[0].name).toBe('tool1')
    expect(serialized[1].name).toBe('tool2')
  })

  test('handles empty tools', () => {
    const server = createSmithersToolServer({}, '/server.ts')
    const serialized = JSON.parse(server.env!['SMITHERS_TOOLS'])

    expect(serialized).toEqual([])
  })

  test('preserves tool descriptions in serialization', () => {
    const tools = {
      report: createSmithersTool({
        name: 'report',
        description: 'Report progress to orchestrator',
        inputSchema: z.object({ message: z.string() }),
        execute: async () => ({}),
      }),
    }

    const server = createSmithersToolServer(tools, '/server.ts')
    const serialized = JSON.parse(server.env!['SMITHERS_TOOLS'])

    expect(serialized[0].description).toBe('Report progress to orchestrator')
  })
})
