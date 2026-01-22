import * as path from 'node:path'
import * as os from 'node:os'

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

export function extractMCPConfigs(childrenString: string): ExtractedMCPConfig {
  const configs: MCPToolConfig[] = []
  const toolInstructions: string[] = []

  const mcpToolRegex = /<mcp-tool\s+type="([^"]+)"\s+config="([^"]+)"[^>]*>([\s\S]*?)<\/mcp-tool>/g

  let cleanPrompt = childrenString
  let match: RegExpExecArray | null

  while ((match = mcpToolRegex.exec(childrenString)) !== null) {
    const [fullMatch, type, configJson, instructions] = match

    try {
      if (!type || !configJson) throw new Error('Missing type or config');
      const config = JSON.parse(configJson.replace(/&quot;/g, '"'))
      const safeInstructions = instructions ? instructions.trim() : '';

      configs.push({
        type: type as MCPToolConfig['type'],
        config,
        instructions: safeInstructions,
      })

      if (safeInstructions) {
        const header = (() => {
          switch (type) {
            case 'sqlite': {
              const dbPath = typeof config['path'] === 'string' ? config['path'] : undefined
              return dbPath ? `[SQLITE DATABASE: ${dbPath}]` : '[SQLITE DATABASE]'
            }
            case 'filesystem': {
              const root = typeof config['path'] === 'string'
                ? config['path']
                : typeof config['root'] === 'string'
                  ? config['root']
                  : undefined
              return root ? `[FILESYSTEM: ${root}]` : '[FILESYSTEM]'
            }
            case 'github': {
              const repo = typeof config['repo'] === 'string' ? config['repo'] : undefined
              return repo ? `[GITHUB: ${repo}]` : '[GITHUB]'
            }
            default:
              return `[${type.toUpperCase()} TOOL]`
          }
        })()
        toolInstructions.push(`${header}\n${safeInstructions}`)
      }
    } catch (e) {
      console.warn(`Failed to parse MCP tool config: type=${type}, configJson=${configJson}, error=${e}`)
    }

    cleanPrompt = cleanPrompt.replace(fullMatch, '')
  }

  cleanPrompt = cleanPrompt.trim()

  return {
    configs,
    cleanPrompt,
    toolInstructions: toolInstructions.join('\n\n'),
  }
}

export function generateMCPServerConfig(configs: MCPToolConfig[]): Record<string, any> {
  const mcpConfig: Record<string, any> = {
    mcpServers: {},
  }
  const usedNames = new Set<string>()
  let sqliteCount = 0

  const reserveName = (baseName: string): string => {
    let name = baseName
    if (usedNames.has(name)) {
      let counter = 2
      while (usedNames.has(`${baseName}-${counter}`)) {
        counter += 1
      }
      name = `${baseName}-${counter}`
    }
    usedNames.add(name)
    return name
  }

  for (const tool of configs) {
    switch (tool.type) {
      case 'sqlite': {
        sqliteCount += 1
        const rawPath = typeof tool.config['path'] === 'string' ? tool.config['path'] : `db-${sqliteCount}`
        const base = path.basename(rawPath) || `db-${sqliteCount}`
        const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, '-')
        const serverName = reserveName(`sqlite-${safeBase}`)

        mcpConfig['mcpServers'][serverName] = {
          command: 'bunx',
          args: [
            '-y',
            '@anthropic/mcp-server-sqlite',
            '--db-path',
            rawPath,
            ...(tool.config['readOnly'] ? ['--read-only'] : []),
          ],
        }
        break
      }

      case 'filesystem':
      case 'github':
      case 'custom':
        break
    }
  }

  return mcpConfig
}

export async function writeMCPConfigFile(config: Record<string, any>): Promise<string> {
  const tmpDir = os.tmpdir()
  const configPath = path.join(tmpDir, `smithers-mcp-${Date.now()}.json`)
  await Bun.write(configPath, JSON.stringify(config, null, 2))
  return configPath
}
