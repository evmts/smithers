import { describe, it, expect } from 'bun:test'
import { MCPPresets, createMCPConfigs } from '@evmts/smithers'

/**
 * MCP Presets Unit Tests
 *
 * Tests the preset configurations for common MCP servers:
 * - filesystem: File and directory access
 * - git: Git operations
 * - github: GitHub API access
 * - sqlite: SQLite database access
 * - memory: Key-value memory store
 * - fetch: HTTP fetch capabilities
 * - braveSearch: Web search via Brave API
 * - puppeteer: Browser automation
 * - custom: Custom stdio servers
 * - http: Custom HTTP servers
 */
describe('MCPPresets', () => {
  describe('filesystem', () => {
    it('creates correct config with single path', () => {
      const config = MCPPresets.filesystem(['/home/user'])

      expect(config.name).toBe('filesystem')
      expect(config.transport.type).toBe('stdio')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('npx')
        expect(config.transport.args).toContain('-y')
        expect(config.transport.args).toContain('@modelcontextprotocol/server-filesystem')
        expect(config.transport.args).toContain('/home/user')
      }
    })

    it('creates correct config with multiple paths', () => {
      const config = MCPPresets.filesystem(['/home/user', '/tmp', '/var/log'])

      expect(config.name).toBe('filesystem')
      if (config.transport.type === 'stdio') {
        expect(config.transport.args).toContain('/home/user')
        expect(config.transport.args).toContain('/tmp')
        expect(config.transport.args).toContain('/var/log')
      }
    })

    it('creates correct config with empty paths', () => {
      const config = MCPPresets.filesystem([])

      expect(config.name).toBe('filesystem')
      if (config.transport.type === 'stdio') {
        expect(config.transport.args).toEqual([
          '-y',
          '@modelcontextprotocol/server-filesystem',
        ])
      }
    })
  })

  describe('git', () => {
    it('creates correct config without repo path', () => {
      const config = MCPPresets.git()

      expect(config.name).toBe('git')
      expect(config.transport.type).toBe('stdio')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('npx')
        expect(config.transport.args).toContain('-y')
        expect(config.transport.args).toContain('@modelcontextprotocol/server-git')
        expect(config.transport.args).not.toContain('--repository')
      }
    })

    it('creates correct config with repo path', () => {
      const config = MCPPresets.git('/path/to/repo')

      expect(config.name).toBe('git')
      if (config.transport.type === 'stdio') {
        expect(config.transport.args).toContain('--repository')
        expect(config.transport.args).toContain('/path/to/repo')
      }
    })
  })

  describe('github', () => {
    it('creates correct config without options', () => {
      const config = MCPPresets.github()

      expect(config.name).toBe('github')
      expect(config.transport.type).toBe('stdio')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('npx')
        expect(config.transport.args).toContain('-y')
        expect(config.transport.args).toContain('@modelcontextprotocol/server-github')
        expect(config.transport.env).toBeDefined()
      }
    })

    it('creates correct config with owner', () => {
      const config = MCPPresets.github({ owner: 'anthropics' })

      if (config.transport.type === 'stdio') {
        expect(config.transport.args).toContain('--owner')
        expect(config.transport.args).toContain('anthropics')
      }
    })

    it('creates correct config with owner and repo', () => {
      const config = MCPPresets.github({ owner: 'anthropics', repo: 'claude' })

      if (config.transport.type === 'stdio') {
        expect(config.transport.args).toContain('--owner')
        expect(config.transport.args).toContain('anthropics')
        expect(config.transport.args).toContain('--repo')
        expect(config.transport.args).toContain('claude')
      }
    })

    it('includes GITHUB_PERSONAL_ACCESS_TOKEN from environment', () => {
      // Save original env
      const originalToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN

      // Set test token
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'test-token-123'

      const config = MCPPresets.github()

      if (config.transport.type === 'stdio') {
        expect(config.transport.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('test-token-123')
      }

      // Restore original env
      if (originalToken !== undefined) {
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN = originalToken
      } else {
        delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN
      }
    })
  })

  describe('sqlite', () => {
    it('creates correct config with db path', () => {
      const config = MCPPresets.sqlite('/path/to/database.db')

      expect(config.name).toBe('sqlite')
      expect(config.transport.type).toBe('stdio')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('npx')
        expect(config.transport.args).toContain('-y')
        expect(config.transport.args).toContain('@modelcontextprotocol/server-sqlite')
        expect(config.transport.args).toContain('/path/to/database.db')
      }
    })
  })

  describe('memory', () => {
    it('creates correct config', () => {
      const config = MCPPresets.memory()

      expect(config.name).toBe('memory')
      expect(config.transport.type).toBe('stdio')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('npx')
        expect(config.transport.args).toContain('-y')
        expect(config.transport.args).toContain('@modelcontextprotocol/server-memory')
      }
    })
  })

  describe('fetch', () => {
    it('creates correct config', () => {
      const config = MCPPresets.fetch()

      expect(config.name).toBe('fetch')
      expect(config.transport.type).toBe('stdio')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('npx')
        expect(config.transport.args).toContain('-y')
        expect(config.transport.args).toContain('@modelcontextprotocol/server-fetch')
      }
    })
  })

  describe('braveSearch', () => {
    it('creates correct config', () => {
      const config = MCPPresets.braveSearch()

      expect(config.name).toBe('brave-search')
      expect(config.transport.type).toBe('stdio')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('npx')
        expect(config.transport.args).toContain('-y')
        expect(config.transport.args).toContain('@modelcontextprotocol/server-brave-search')
        expect(config.transport.env).toBeDefined()
      }
    })

    it('includes BRAVE_API_KEY from environment', () => {
      // Save original env
      const originalKey = process.env.BRAVE_API_KEY

      // Set test key
      process.env.BRAVE_API_KEY = 'brave-key-123'

      const config = MCPPresets.braveSearch()

      if (config.transport.type === 'stdio') {
        expect(config.transport.env?.BRAVE_API_KEY).toBe('brave-key-123')
      }

      // Restore original env
      if (originalKey !== undefined) {
        process.env.BRAVE_API_KEY = originalKey
      } else {
        delete process.env.BRAVE_API_KEY
      }
    })
  })

  describe('puppeteer', () => {
    it('creates correct config', () => {
      const config = MCPPresets.puppeteer()

      expect(config.name).toBe('puppeteer')
      expect(config.transport.type).toBe('stdio')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('npx')
        expect(config.transport.args).toContain('-y')
        expect(config.transport.args).toContain('@modelcontextprotocol/server-puppeteer')
      }
    })
  })

  describe('custom', () => {
    it('creates correct config with minimal options', () => {
      const config = MCPPresets.custom('my-server', 'node', ['./server.js'])

      expect(config.name).toBe('my-server')
      expect(config.transport.type).toBe('stdio')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('node')
        expect(config.transport.args).toEqual(['./server.js'])
      }
    })

    it('creates correct config with all options', () => {
      const config = MCPPresets.custom('my-server', 'python', ['-m', 'mcp_server'], {
        env: { CUSTOM_VAR: 'value' },
        cwd: '/custom/dir',
      })

      expect(config.name).toBe('my-server')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('python')
        expect(config.transport.args).toEqual(['-m', 'mcp_server'])
        expect(config.transport.env).toEqual({ CUSTOM_VAR: 'value' })
        expect(config.transport.cwd).toBe('/custom/dir')
      }
    })

    it('creates correct config with empty args', () => {
      const config = MCPPresets.custom('simple-server', './my-binary')

      expect(config.name).toBe('simple-server')
      if (config.transport.type === 'stdio') {
        expect(config.transport.command).toBe('./my-binary')
        expect(config.transport.args).toEqual([])
      }
    })
  })

  describe('http', () => {
    it('creates correct config with URL only', () => {
      const config = MCPPresets.http('remote-server', 'https://mcp.example.com')

      expect(config.name).toBe('remote-server')
      expect(config.transport.type).toBe('http')
      if (config.transport.type === 'http') {
        expect(config.transport.url).toBe('https://mcp.example.com')
        expect(config.transport.headers).toBeUndefined()
      }
    })

    it('creates correct config with headers', () => {
      const config = MCPPresets.http('auth-server', 'https://mcp.example.com/api', {
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      })

      expect(config.name).toBe('auth-server')
      if (config.transport.type === 'http') {
        expect(config.transport.url).toBe('https://mcp.example.com/api')
        expect(config.transport.headers).toEqual({
          Authorization: 'Bearer token123',
          'X-Custom-Header': 'custom-value',
        })
      }
    })
  })
})

describe('createMCPConfigs', () => {
  it('returns the same configs array', () => {
    const configs = [
      MCPPresets.filesystem(['/home']),
      MCPPresets.git(),
      MCPPresets.github(),
    ]

    const result = createMCPConfigs(configs)

    expect(result).toEqual(configs)
    expect(result.length).toBe(3)
  })

  it('works with empty array', () => {
    const result = createMCPConfigs([])
    expect(result).toEqual([])
  })

  it('works with single config', () => {
    const config = MCPPresets.memory()
    const result = createMCPConfigs([config])

    expect(result).toEqual([config])
    expect(result[0].name).toBe('memory')
  })
})
