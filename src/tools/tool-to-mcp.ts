import { zodToJsonSchema } from '../utils/structured-output/zod-converter.js'
import type { MCPServer, SmithersTool } from './types.js'

export interface MCPToolDefinition {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

/**
 * Convert a SmithersTool to MCP tool definition format.
 *
 * @throws {Error} If input schema is not an object type (MCP requires object schemas)
 */
export function toolToMCPDefinition(name: string, tool: SmithersTool): MCPToolDefinition {
  const jsonSchema = zodToJsonSchema(tool.inputSchema)
  const isObjectSchema =
    jsonSchema['type'] === 'object' ||
    (typeof jsonSchema['properties'] === 'object' && jsonSchema['properties'] !== null)

  if (!isObjectSchema) {
    throw new Error(`Tool ${name} input schema must be an object for MCP.`)
  }

  return {
    name,
    description: tool.description,
    inputSchema: jsonSchema,
  }
}

export interface CreateSmithersToolServerOptions {
  toolModulePath?: string
}

export function createSmithersToolServer(
  tools: Record<string, SmithersTool>,
  serverPath: string,
  options: CreateSmithersToolServerOptions = {}
): MCPServer {
  const { toolModulePath } = options
  
  const env: Record<string, string> = {
    SMITHERS_TOOLS: JSON.stringify(
      Object.entries(tools).map(([name, tool]) => toolToMCPDefinition(name, tool))
    ),
  }
  
  if (toolModulePath) {
    env['SMITHERS_TOOL_MODULE'] = toolModulePath
  }
  
  return {
    name: 'smithers-tools',
    command: 'bun',
    args: ['run', serverPath],
    env,
  }
}
