import { describe, test, expect } from 'bun:test'
import { createLegacyToolServer } from './legacy-tool-server.js'
import type { LegacyTool } from './types.js'

describe('legacy-tool-server', () => {
  test('createLegacyToolServer returns MCP server config', () => {
    const tools: LegacyTool[] = [
      {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { 
          type: 'object', 
          properties: { value: { type: 'string' } },
          required: ['value'],
        },
        execute: async (input) => input.value.toUpperCase(),
      },
    ]

    const { server, toolDefinitions } = createLegacyToolServer(tools)

    expect(server.name).toBe('smithers-legacy-tools')
    expect(server.command).toBe('bun')
    expect(server.args).toContain('run')
    expect(server.args?.some(a => a.includes('legacy-mcp-server'))).toBe(true)
    expect(server.env).toBeDefined()
    expect(server.env?.['SMITHERS_LEGACY_TOOLS']).toBeDefined()
    expect(server.env?.['SMITHERS_IPC_DIR']).toBeDefined()

    expect(toolDefinitions).toHaveLength(1)
    expect(toolDefinitions[0].name).toBe('test-tool')
    expect(toolDefinitions[0].description).toBe('A test tool')
  })

  test('creates config for multiple tools', () => {
    const tools: LegacyTool[] = [
      {
        name: 'tool-a',
        description: 'First tool',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => 'a',
      },
      {
        name: 'tool-b',
        description: 'Second tool',
        inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
        execute: async (input) => input.x * 2,
      },
    ]

    const { server, toolDefinitions } = createLegacyToolServer(tools)

    expect(toolDefinitions).toHaveLength(2)
    
    const parsedTools = JSON.parse(server.env?.['SMITHERS_LEGACY_TOOLS'] ?? '[]')
    expect(parsedTools).toHaveLength(2)
    expect(parsedTools[0].name).toBe('tool-a')
    expect(parsedTools[1].name).toBe('tool-b')
  })

  test('handles empty tools array', () => {
    const { server, toolDefinitions } = createLegacyToolServer([])

    expect(server.name).toBe('smithers-legacy-tools')
    expect(toolDefinitions).toHaveLength(0)
    
    const parsedTools = JSON.parse(server.env?.['SMITHERS_LEGACY_TOOLS'] ?? '[]')
    expect(parsedTools).toHaveLength(0)
  })

  test('preserves complex input schemas', () => {
    const complexSchema = {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query' },
        params: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Query parameters',
        },
        options: {
          type: 'object',
          properties: {
            timeout: { type: 'number', default: 5000 },
            readonly: { type: 'boolean', default: true },
          },
        },
      },
      required: ['query'],
    }

    const tools: LegacyTool[] = [
      {
        name: 'query-db',
        description: 'Query database',
        inputSchema: complexSchema,
        execute: async () => [],
      },
    ]

    const { toolDefinitions } = createLegacyToolServer(tools)

    expect(toolDefinitions[0].inputSchema).toEqual(complexSchema)
  })
})
