import { zodToJsonSchema } from '../utils/structured-output/zod-converter.js'
import type { MCPServer, SmithersTool } from './types.js'

export interface MCPToolDefinition {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export function toolToMCPDefinition(name: string, tool: SmithersTool): MCPToolDefinition {
  const jsonSchema = zodToJsonSchema(tool.inputSchema)
  const isObjectSchema =
    jsonSchema.type === 'object' ||
    (typeof jsonSchema.properties === 'object' && jsonSchema.properties !== null)

  if (!isObjectSchema) {
    throw new Error(`Tool ${name} input schema must be an object for MCP.`)
  }

  return {
    name,
    description: tool.description,
    inputSchema: jsonSchema,
  }
}

export function createSmithersToolServer(
  tools: Record<string, SmithersTool>,
  serverPath: string
): MCPServer {
  if (process.env['SMITHERS_MCP_ENABLED'] !== '1') {
    throw new Error(
      'Smithers MCP server is unimplemented. Set SMITHERS_MCP_ENABLED=1 to enable.'
    )
  }
  return {
    name: 'smithers-tools',
    command: 'bun',
    args: ['run', serverPath],
    env: {
      SMITHERS_TOOLS: JSON.stringify(
        Object.entries(tools).map(([name, tool]) => toolToMCPDefinition(name, tool))
      ),
    },
  }
}
