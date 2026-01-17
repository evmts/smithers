import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

export interface MCPToolConfig {
  type: 'sqlite' | 'filesystem' | 'github' | 'custom'
  config: Record<string, any>
  instructions?: string
}

export interface ExtractedMCPConfig {
  configs: MCPToolConfig[]
  cleanPrompt: string
  toolInstructions: string
}

/**
 * Extract MCP tool configurations from serialized children string.
 * Parses <mcp-tool> elements and returns configs + clean prompt.
 */
export function extractMCPConfigs(childrenString: string): ExtractedMCPConfig {
  const configs: MCPToolConfig[] = []
  const toolInstructions: string[] = []

  // Regex to match <mcp-tool type="..." config="...">...</mcp-tool>
  const mcpToolRegex = /<mcp-tool\s+type="([^"]+)"\s+config="([^"]+)"[^>]*>([\s\S]*?)<\/mcp-tool>/g

  let cleanPrompt = childrenString
  let match: RegExpExecArray | null

  while ((match = mcpToolRegex.exec(childrenString)) !== null) {
    const [fullMatch, type, configJson, instructions] = match

    try {
      const config = JSON.parse(configJson.replace(/&quot;/g, '"'))
      configs.push({
        type: type as MCPToolConfig['type'],
        config,
        instructions: instructions.trim(),
      })

      if (instructions.trim()) {
        toolInstructions.push(`[${type.toUpperCase()} DATABASE: ${config.path}]\n${instructions.trim()}`)
      }
    } catch (e) {
      console.warn(`Failed to parse MCP tool config: ${e}`)
    }

    // Remove the mcp-tool element from the prompt
    cleanPrompt = cleanPrompt.replace(fullMatch, '')
  }

  // Clean up extra whitespace
  cleanPrompt = cleanPrompt.trim()

  return {
    configs,
    cleanPrompt,
    toolInstructions: toolInstructions.join('\n\n'),
  }
}

/**
 * Generate MCP server configuration for extracted tools.
 */
export function generateMCPServerConfig(configs: MCPToolConfig[]): Record<string, any> {
  const mcpConfig: Record<string, any> = {
    mcpServers: {},
  }

  for (const tool of configs) {
    switch (tool.type) {
      case 'sqlite':
        mcpConfig.mcpServers['sqlite'] = {
          command: 'npx',
          args: [
            '-y',
            '@anthropic/mcp-server-sqlite',
            '--db-path',
            tool.config.path,
            ...(tool.config.readOnly ? ['--read-only'] : []),
          ],
        }
        break

      // Future: Add more MCP server types
      case 'filesystem':
      case 'github':
      case 'custom':
        // Placeholder for future implementations
        break
    }
  }

  return mcpConfig
}

/**
 * Write MCP config to a temporary file and return the path.
 */
export async function writeMCPConfigFile(config: Record<string, any>): Promise<string> {
  const tmpDir = os.tmpdir()
  const configPath = path.join(tmpDir, `smithers-mcp-${Date.now()}.json`)
  await fs.writeFile(configPath, JSON.stringify(config, null, 2))
  return configPath
}
