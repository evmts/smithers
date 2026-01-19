import { zodToJsonSchema } from '../utils/structured-output/zod-converter.js'
import type { MCPServer, SmithersTool } from './types.js'

export interface MCPToolDefinition {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

export function toolToMCPDefinition(name: string, tool: SmithersTool): MCPToolDefinition {
  const jsonSchema = zodToJsonSchema(tool.inputSchema)

  return {
    name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: jsonSchema['properties'] ?? {},
      ...(jsonSchema['required'] ? { required: jsonSchema['required'] } : {}),
    },
  }
}

export function createSmithersToolServer(
  tools: Record<string, SmithersTool>,
  serverPath: string
): MCPServer {
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
