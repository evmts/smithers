import type { MCPServerConfig, MCPStdioConfig } from './types.js'

/**
 * Helper function to create a stdio transport configuration
 */
function createStdioConfig(
  name: string,
  command: string,
  args: string[],
  options?: Partial<Omit<MCPStdioConfig, 'type' | 'command' | 'args'>>
): MCPServerConfig {
  return {
    name,
    transport: {
      type: 'stdio',
      command,
      args,
      ...options,
    },
  }
}

/**
 * Preset configurations for common MCP servers
 */
export const MCPPresets = {
  /**
   * Filesystem server - provides read/write access to files and directories
   *
   * @param allowedPaths - Array of paths the server is allowed to access
   * @returns MCPServerConfig for the filesystem server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.filesystem(['/home/user/projects', '/tmp'])
   * await manager.connect(config)
   * ```
   */
  filesystem(allowedPaths: string[]): MCPServerConfig {
    return createStdioConfig(
      'filesystem',
      'npx',
      ['-y', '@modelcontextprotocol/server-filesystem', ...allowedPaths]
    )
  },

  /**
   * Git server - provides git operations for repositories
   *
   * @param repoPath - Optional path to the git repository (defaults to cwd)
   * @returns MCPServerConfig for the git server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.git('/path/to/repo')
   * await manager.connect(config)
   * ```
   */
  git(repoPath?: string): MCPServerConfig {
    const args = ['-y', '@modelcontextprotocol/server-git']
    if (repoPath) {
      args.push('--repository', repoPath)
    }
    return createStdioConfig('git', 'npx', args)
  },

  /**
   * GitHub server - provides GitHub API access
   *
   * Requires GITHUB_PERSONAL_ACCESS_TOKEN environment variable to be set.
   *
   * @param options - Optional configuration
   * @param options.owner - GitHub repository owner
   * @param options.repo - GitHub repository name
   * @returns MCPServerConfig for the GitHub server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.github({ owner: 'anthropics', repo: 'claude' })
   * await manager.connect(config)
   * ```
   */
  github(options?: { owner?: string; repo?: string }): MCPServerConfig {
    const args = ['-y', '@modelcontextprotocol/server-github']
    if (options?.owner) {
      args.push('--owner', options.owner)
    }
    if (options?.repo) {
      args.push('--repo', options.repo)
    }
    return createStdioConfig('github', 'npx', args, {
      env: {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? '',
      } as Record<string, string>,
    })
  },

  /**
   * SQLite server - provides SQL query access to SQLite databases
   *
   * @param dbPath - Path to the SQLite database file
   * @returns MCPServerConfig for the SQLite server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.sqlite('/path/to/database.db')
   * await manager.connect(config)
   * ```
   */
  sqlite(dbPath: string): MCPServerConfig {
    return createStdioConfig('sqlite', 'npx', [
      '-y',
      '@modelcontextprotocol/server-sqlite',
      dbPath,
    ])
  },

  /**
   * Memory server - provides a simple key-value memory store
   *
   * @returns MCPServerConfig for the memory server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.memory()
   * await manager.connect(config)
   * ```
   */
  memory(): MCPServerConfig {
    return createStdioConfig('memory', 'npx', ['-y', '@modelcontextprotocol/server-memory'])
  },

  /**
   * Fetch server - provides HTTP fetch capabilities
   *
   * @returns MCPServerConfig for the fetch server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.fetch()
   * await manager.connect(config)
   * ```
   */
  fetch(): MCPServerConfig {
    return createStdioConfig('fetch', 'npx', ['-y', '@modelcontextprotocol/server-fetch'])
  },

  /**
   * Brave Search server - provides web search using Brave Search API
   *
   * Requires BRAVE_API_KEY environment variable to be set.
   *
   * @returns MCPServerConfig for the Brave Search server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.braveSearch()
   * await manager.connect(config)
   * ```
   */
  braveSearch(): MCPServerConfig {
    return createStdioConfig('brave-search', 'npx', [
      '-y',
      '@modelcontextprotocol/server-brave-search',
    ], {
      env: {
        ...process.env,
        BRAVE_API_KEY: process.env.BRAVE_API_KEY ?? '',
      } as Record<string, string>,
    })
  },

  /**
   * Puppeteer server - provides browser automation capabilities
   *
   * @returns MCPServerConfig for the Puppeteer server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.puppeteer()
   * await manager.connect(config)
   * ```
   */
  puppeteer(): MCPServerConfig {
    return createStdioConfig('puppeteer', 'npx', [
      '-y',
      '@modelcontextprotocol/server-puppeteer',
    ])
  },

  /**
   * Custom stdio server - create a config for any stdio-based MCP server
   *
   * @param name - Unique name for the server
   * @param command - The command to execute
   * @param args - Command arguments
   * @param options - Additional options
   * @returns MCPServerConfig for the custom server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.custom('my-server', 'node', ['./my-mcp-server.js'])
   * await manager.connect(config)
   * ```
   */
  custom(
    name: string,
    command: string,
    args: string[] = [],
    options?: Partial<Omit<MCPStdioConfig, 'type' | 'command' | 'args'>>
  ): MCPServerConfig {
    return createStdioConfig(name, command, args, options)
  },

  /**
   * Custom HTTP server - create a config for any HTTP-based MCP server
   *
   * @param name - Unique name for the server
   * @param url - The URL of the MCP server
   * @param headers - Optional HTTP headers
   * @returns MCPServerConfig for the custom HTTP server
   *
   * @example
   * ```typescript
   * const config = MCPPresets.http('remote-server', 'https://mcp.example.com')
   * await manager.connect(config)
   * ```
   */
  http(name: string, url: string, headers?: Record<string, string>): MCPServerConfig {
    return {
      name,
      transport: {
        type: 'http',
        url,
        headers,
      },
    }
  },
}

/**
 * Create multiple MCP server configurations at once
 *
 * @example
 * ```typescript
 * const configs = createMCPConfigs([
 *   MCPPresets.filesystem(['/home/user']),
 *   MCPPresets.git(),
 *   MCPPresets.github({ owner: 'anthropics' }),
 * ])
 * ```
 */
export function createMCPConfigs(configs: MCPServerConfig[]): MCPServerConfig[] {
  return configs
}
