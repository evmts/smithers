import { describe, test, expect, mock } from 'bun:test'
import { z } from 'zod'
import { createSmithersTool } from './createSmithersTool.js'
import { toolToMCPDefinition } from './tool-to-mcp.js'

describe('createSmithersTool', () => {
  test('creates tool with name and description', () => {
    const tool = createSmithersTool({
      name: 'test',
      description: 'Test tool',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => ({ result: value }),
    })

    expect(tool.name).toBe('test')
    expect(tool.description).toBe('Test tool')
  })

  test('passes Smithers context and abort signal', async () => {
    const execute = mock(async (_input, context) => ({
      agentId: context.agentId,
      hasAbort: context.abortSignal instanceof AbortSignal,
    }))

    const tool = createSmithersTool({
      name: 'context',
      description: 'Context tool',
      inputSchema: z.object({ value: z.string() }),
      execute,
    })

    const abortController = new AbortController()
    const result = await tool.execute(
      { value: 'ok' },
      {
        toolCallId: 'call-1',
        messages: [],
        abortSignal: abortController.signal,
        experimental_context: {
          db: {} as any,
          agentId: 'agent-1',
          executionId: 'exec-1',
          cwd: '/tmp',
          env: {},
          log: () => {},
        },
      }
    )

    expect(execute).toHaveBeenCalled()
    expect(result.agentId).toBe('agent-1')
    expect(result.hasAbort).toBe(true)
  })
})

describe('toolToMCPDefinition', () => {
  test('converts zod schema to MCP definition', () => {
    const tool = createSmithersTool({
      name: 'schema',
      description: 'Schema tool',
      inputSchema: z.object({
        name: z.string(),
        count: z.number().optional(),
      }),
      execute: async () => ({ ok: true }),
    })

    const mcpDef = toolToMCPDefinition('schema', tool)

    expect(mcpDef.name).toBe('schema')
    expect(mcpDef.description).toBe('Schema tool')
    expect(mcpDef.inputSchema.properties.name).toEqual({ type: 'string' })
    expect(mcpDef.inputSchema.required).toContain('name')
  })
})
