import { test, expect, describe } from 'bun:test'
import { extractMCPConfigs, generateMCPServerConfig, writeMCPConfigFile } from './mcp-config.js'
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

// ============================================================================
// extractMCPConfigs - Edge Cases
// ============================================================================

describe('extractMCPConfigs - edge cases', () => {
  test('handles empty string input', () => {
    const result = extractMCPConfigs('')
    
    expect(result.configs).toHaveLength(0)
    expect(result.cleanPrompt).toBe('')
    expect(result.toolInstructions).toBe('')
  })

  test('handles whitespace-only input', () => {
    const result = extractMCPConfigs('   \n\t  ')
    
    expect(result.configs).toHaveLength(0)
    expect(result.cleanPrompt).toBe('')
  })

  test('handles malformed config JSON gracefully', () => {
    const input = `<mcp-tool type="sqlite" config="not valid json">
    Instructions here.
  </mcp-tool>
  
  Query text.`

    const result = extractMCPConfigs(input)
    
    // Should skip the malformed config but not crash
    expect(result.configs).toHaveLength(0)
    expect(result.cleanPrompt).toContain('Query text')
  })

  test('handles missing type attribute', () => {
    const input = `<mcp-tool config="{&quot;path&quot;:&quot;./data.db&quot;}">
    Instructions.
  </mcp-tool>`

    const result = extractMCPConfigs(input)
    
    // Regex won't match without type
    expect(result.configs).toHaveLength(0)
  })

  test('handles missing config attribute', () => {
    const input = `<mcp-tool type="sqlite">
    Instructions.
  </mcp-tool>`

    const result = extractMCPConfigs(input)
    
    // Regex won't match without config
    expect(result.configs).toHaveLength(0)
  })

  test('handles config with special characters in path', () => {
    const input = `<mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;/path/with spaces/data.db&quot;}">
    Database with spaces in path.
  </mcp-tool>`

    const result = extractMCPConfigs(input)
    
    expect(result.configs).toHaveLength(1)
    expect(result.configs[0].config.path).toBe('/path/with spaces/data.db')
  })

  test('handles instructions with special characters', () => {
    const input = `<mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;./data.db&quot;}">
    Database has "quoted" text and 'apostrophes' & <angles>.
  </mcp-tool>`

    const result = extractMCPConfigs(input)
    
    expect(result.configs).toHaveLength(1)
    expect(result.configs[0].instructions).toContain('quoted')
    expect(result.configs[0].instructions).toContain('apostrophes')
  })

  test('handles multiline instructions', () => {
    const input = `<mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;./data.db&quot;}">
    Line 1 of instructions.
    Line 2 of instructions.
    Line 3 of instructions.
  </mcp-tool>`

    const result = extractMCPConfigs(input)
    
    expect(result.configs).toHaveLength(1)
    expect(result.configs[0].instructions).toContain('Line 1')
    expect(result.configs[0].instructions).toContain('Line 2')
    expect(result.configs[0].instructions).toContain('Line 3')
  })

  test('preserves prompt text before and after mcp-tool', () => {
    const input = `Before the tool.
    
<mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;./data.db&quot;}">
    Instructions.
  </mcp-tool>

After the tool.`

    const result = extractMCPConfigs(input)
    
    expect(result.cleanPrompt).toContain('Before the tool')
    expect(result.cleanPrompt).toContain('After the tool')
    expect(result.cleanPrompt).not.toContain('mcp-tool')
  })

  test('handles unicode in config and instructions', () => {
    const input = `<mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;./日本語.db&quot;}">
    データベースの説明 🎉
  </mcp-tool>`

    const result = extractMCPConfigs(input)
    
    expect(result.configs).toHaveLength(1)
    expect(result.configs[0].config.path).toBe('./日本語.db')
    expect(result.configs[0].instructions).toContain('データベースの説明')
  })

  test('handles nested config objects', () => {
    const input = `<mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;./data.db&quot;,&quot;options&quot;:{&quot;timeout&quot;:5000}}">
    Database with options.
  </mcp-tool>`

    const result = extractMCPConfigs(input)
    
    expect(result.configs).toHaveLength(1)
    expect(result.configs[0].config.options).toEqual({ timeout: 5000 })
  })

  test('handles array values in config', () => {
    const input = `<mcp-tool type="filesystem" config="{&quot;paths&quot;:[&quot;/path1&quot;,&quot;/path2&quot;]}">
    Filesystem tool.
  </mcp-tool>`

    const result = extractMCPConfigs(input)
    
    expect(result.configs).toHaveLength(1)
    expect(result.configs[0].config.paths).toEqual(['/path1', '/path2'])
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
    expect(result.mcpServers.sqlite.command).toBe('bunx')
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
          command: 'bunx',
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

// ============================================================================
// generateMCPServerConfig - Edge Cases
// ============================================================================

describe('generateMCPServerConfig - edge cases', () => {
  test('handles path with spaces', () => {
    const configs = [{
      type: 'sqlite' as const,
      config: { path: '/path/with spaces/database.db', readOnly: false },
      instructions: ''
    }]

    const result = generateMCPServerConfig(configs)

    expect(result.mcpServers.sqlite.args).toContain('/path/with spaces/database.db')
  })

  test('handles path with special characters', () => {
    const configs = [{
      type: 'sqlite' as const,
      config: { path: './data-2024_v1.db', readOnly: false },
      instructions: ''
    }]

    const result = generateMCPServerConfig(configs)

    expect(result.mcpServers.sqlite.args).toContain('./data-2024_v1.db')
  })

  test('handles unicode path', () => {
    const configs = [{
      type: 'sqlite' as const,
      config: { path: './日本語/データ.db', readOnly: false },
      instructions: ''
    }]

    const result = generateMCPServerConfig(configs)

    expect(result.mcpServers.sqlite.args).toContain('./日本語/データ.db')
  })

  test('last sqlite config wins when multiple provided', () => {
    const configs = [
      { type: 'sqlite' as const, config: { path: './first.db', readOnly: false }, instructions: '' },
      { type: 'sqlite' as const, config: { path: './second.db', readOnly: true }, instructions: '' },
    ]

    const result = generateMCPServerConfig(configs)

    // Last one should overwrite
    expect(result.mcpServers.sqlite.args).toContain('./second.db')
    expect(result.mcpServers.sqlite.args).toContain('--read-only')
  })

  test('handles custom type (placeholder)', () => {
    const configs = [{
      type: 'custom' as const,
      config: { any: 'value' },
      instructions: ''
    }]

    const result = generateMCPServerConfig(configs)

    // Custom type is not implemented, so mcpServers should be empty
    expect(result.mcpServers).toEqual({})
  })

  test('returns object with mcpServers key even when empty', () => {
    const result = generateMCPServerConfig([])
    
    expect(result).toHaveProperty('mcpServers')
    expect(typeof result.mcpServers).toBe('object')
  })

  test('handles missing readOnly (defaults to no --read-only flag)', () => {
    const configs = [{
      type: 'sqlite' as const,
      config: { path: './test.db' },  // No readOnly specified
      instructions: ''
    }]

    const result = generateMCPServerConfig(configs)

    expect(result.mcpServers.sqlite.args).not.toContain('--read-only')
  })
})

// ============================================================================
// writeMCPConfigFile - Edge Cases
// ============================================================================

describe('writeMCPConfigFile - edge cases', () => {
  test('writes empty config', async () => {
    const config = {}

    const configPath = await writeMCPConfigFile(config)

    const contents = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(contents)).toEqual({})

    await fs.unlink(configPath)
  })

  test('writes nested config with proper formatting', async () => {
    const config = {
      level1: {
        level2: {
          level3: 'value'
        }
      }
    }

    const configPath = await writeMCPConfigFile(config)

    const contents = await fs.readFile(configPath, 'utf-8')
    // Should be formatted with 2-space indentation
    expect(contents).toContain('  ')
    expect(JSON.parse(contents)).toEqual(config)

    await fs.unlink(configPath)
  })

  test('writes config with arrays', async () => {
    const config = {
      items: [1, 2, 3],
      nested: { arr: ['a', 'b'] }
    }

    const configPath = await writeMCPConfigFile(config)

    const contents = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(contents)).toEqual(config)

    await fs.unlink(configPath)
  })

  test('writes config with unicode values', async () => {
    const config = {
      message: 'Hello 日本語 🎉',
      path: './データ.db'
    }

    const configPath = await writeMCPConfigFile(config)

    const contents = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(contents)).toEqual(config)

    await fs.unlink(configPath)
  })

  test('returns path in temp directory', async () => {
    const config = { test: true }
    const os = await import('os')

    const configPath = await writeMCPConfigFile(config)

    expect(configPath.startsWith(os.tmpdir())).toBe(true)

    await fs.unlink(configPath)
  })

  test('creates files with timestamp in name', async () => {
    const config = { test: true }

    const configPath = await writeMCPConfigFile(config)

    // Filename should contain timestamp pattern
    expect(configPath).toMatch(/smithers-mcp-\d+\.json$/)

    await fs.unlink(configPath)
  })
})

// ============================================================================
// Type Tests
// ============================================================================

describe('MCP Config Types', () => {
  test('MCPToolConfig type is correct', () => {
    const config = {
      type: 'sqlite' as const,
      config: { path: './test.db' },
      instructions: 'Test'
    }
    
    expect(config.type).toBe('sqlite')
    expect(config.config.path).toBe('./test.db')
    expect(config.instructions).toBe('Test')
  })

  test('ExtractedMCPConfig has required properties', () => {
    const result = extractMCPConfigs('')
    
    expect(result).toHaveProperty('configs')
    expect(result).toHaveProperty('cleanPrompt')
    expect(result).toHaveProperty('toolInstructions')
    expect(Array.isArray(result.configs)).toBe(true)
    expect(typeof result.cleanPrompt).toBe('string')
    expect(typeof result.toolInstructions).toBe('string')
  })
})
