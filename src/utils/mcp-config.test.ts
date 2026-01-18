import { test, expect, describe } from 'bun:test'
import { extractMCPConfigs, generateMCPServerConfig, writeMCPConfigFile } from './mcp-config'
import * as fs from 'fs/promises'

describe('extractMCPConfigs', () => {
  test('parses sqlite tool from children string', () => {
    const input = `<mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;./data.db&quot;,&quot;readOnly&quot;:false}">
    Database has users table.
  </mcp-tool>

  Query all users.`

    const result = extractMCPConfigs(input)

    expect(result.configs).toHaveLength(1)
    expect(result.configs[0].type).toBe('sqlite')
    expect(result.configs[0].config.path).toBe('./data.db')
    expect(result.configs[0].config.readOnly).toBe(false)
    expect(result.cleanPrompt).toContain('Query all users')
    expect(result.cleanPrompt).not.toContain('mcp-tool')
    expect(result.toolInstructions).toContain('Database has users table')
    expect(result.toolInstructions).toContain('[SQLITE DATABASE: ./data.db]')
  })

  test('parses multiple mcp tools', () => {
    const input = `<mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;./users.db&quot;}">
    Users database.
  </mcp-tool>
  <mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;./orders.db&quot;,&quot;readOnly&quot;:true}">
    Orders database (read-only).
  </mcp-tool>

  Join user data with orders.`

    const result = extractMCPConfigs(input)

    expect(result.configs).toHaveLength(2)
    expect(result.configs[0].config.path).toBe('./users.db')
    expect(result.configs[1].config.path).toBe('./orders.db')
    expect(result.configs[1].config.readOnly).toBe(true)
    expect(result.cleanPrompt).toContain('Join user data with orders')
    expect(result.toolInstructions).toContain('Users database')
    expect(result.toolInstructions).toContain('Orders database (read-only)')
  })

  test('handles string without mcp tools', () => {
    const input = 'Just a regular prompt without any MCP tools.'

    const result = extractMCPConfigs(input)

    expect(result.configs).toHaveLength(0)
    expect(result.cleanPrompt).toBe('Just a regular prompt without any MCP tools.')
    expect(result.toolInstructions).toBe('')
  })

  test('handles empty instructions', () => {
    const input = `<mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;./data.db&quot;}"></mcp-tool>

  Query the database.`

    const result = extractMCPConfigs(input)

    expect(result.configs).toHaveLength(1)
    expect(result.configs[0].instructions).toBe('')
    expect(result.toolInstructions).toBe('')
    expect(result.cleanPrompt).toContain('Query the database')
  })
})

describe('generateMCPServerConfig', () => {
  test('creates sqlite config', () => {
    const configs = [{
      type: 'sqlite' as const,
      config: { path: './test.db', readOnly: false },
      instructions: 'Test db'
    }]

    const result = generateMCPServerConfig(configs)

    expect(result.mcpServers.sqlite).toBeDefined()
    expect(result.mcpServers.sqlite.command).toBe('npx')
    expect(result.mcpServers.sqlite.args).toContain('-y')
    expect(result.mcpServers.sqlite.args).toContain('@anthropic/mcp-server-sqlite')
    expect(result.mcpServers.sqlite.args).toContain('--db-path')
    expect(result.mcpServers.sqlite.args).toContain('./test.db')
    expect(result.mcpServers.sqlite.args).not.toContain('--read-only')
  })

  test('creates sqlite config with read-only flag', () => {
    const configs = [{
      type: 'sqlite' as const,
      config: { path: './test.db', readOnly: true },
      instructions: 'Test db'
    }]

    const result = generateMCPServerConfig(configs)

    expect(result.mcpServers.sqlite.args).toContain('--read-only')
  })

  test('handles empty configs array', () => {
    const result = generateMCPServerConfig([])

    expect(result.mcpServers).toEqual({})
  })

  test('ignores unimplemented types', () => {
    const configs = [
      { type: 'filesystem' as const, config: { paths: ['/tmp'] }, instructions: '' },
      { type: 'github' as const, config: { repo: 'test/repo' }, instructions: '' },
    ]

    const result = generateMCPServerConfig(configs)

    expect(result.mcpServers).toEqual({})
  })
})

describe('writeMCPConfigFile', () => {
  test('writes config to temp file', async () => {
    const config = {
      mcpServers: {
        sqlite: {
          command: 'npx',
          args: ['-y', '@anthropic/mcp-server-sqlite', '--db-path', './test.db']
        }
      }
    }

    const configPath = await writeMCPConfigFile(config)

    expect(configPath).toContain('smithers-mcp-')
    expect(configPath.endsWith('.json')).toBe(true)

    // Verify file contents
    const contents = await fs.readFile(configPath, 'utf-8')
    const parsed = JSON.parse(contents)
    expect(parsed.mcpServers.sqlite).toBeDefined()

    // Clean up
    await fs.unlink(configPath)
  })
})
