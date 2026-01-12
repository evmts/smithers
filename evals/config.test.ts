import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  loadConfig,
  loadConfigFromFile,
  mergeOptions,
  defineConfig,
  type SmithersConfig,
} from '@evmts/smithers-cli/config'

describe('config', () => {
  let tempDir: string

  beforeEach(() => {
    // Create a temporary directory for test config files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithers-config-test-'))
  })

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('loadConfig', () => {
    it('returns empty config when no config file exists', async () => {
      const config = await loadConfig(tempDir)
      expect(config).toEqual({})
    })

    it('loads .smithersrc JSON config', async () => {
      const configPath = path.join(tempDir, '.smithersrc')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          maxTokens: 4096,
          autoApprove: true,
        })
      )

      const config = await loadConfig(tempDir)
      expect(config.model).toBe('claude-sonnet-4-20250514')
      expect(config.maxTokens).toBe(4096)
      expect(config.autoApprove).toBe(true)
    })

    it('loads .smithersrc.json config', async () => {
      const configPath = path.join(tempDir, '.smithersrc.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          maxFrames: 50,
          timeout: 600,
        })
      )

      const config = await loadConfig(tempDir)
      expect(config.maxFrames).toBe(50)
      expect(config.timeout).toBe(600)
    })

    it('loads smithers.config.js config', async () => {
      const configPath = path.join(tempDir, 'smithers.config.js')
      fs.writeFileSync(
        configPath,
        `export default {
          model: 'claude-opus-4-20250514',
          mockMode: true,
        }`
      )

      const config = await loadConfig(tempDir)
      expect(config.model).toBe('claude-opus-4-20250514')
      expect(config.mockMode).toBe(true)
    })

    it('prioritizes .smithersrc over other config files', async () => {
      // Create both files
      fs.writeFileSync(
        path.join(tempDir, '.smithersrc'),
        JSON.stringify({ model: 'from-smithersrc' })
      )
      fs.writeFileSync(
        path.join(tempDir, 'smithers.config.js'),
        `export default { model: 'from-config-js' }`
      )

      const config = await loadConfig(tempDir)
      expect(config.model).toBe('from-smithersrc')
    })
  })

  describe('loadConfigFromFile', () => {
    it('loads config from a specific JSON file', async () => {
      const configPath = path.join(tempDir, 'custom-config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          model: 'custom-model',
          verbose: true,
        })
      )

      const config = await loadConfigFromFile(configPath)
      expect(config.model).toBe('custom-model')
      expect(config.verbose).toBe(true)
    })

    it('throws error for non-existent file', async () => {
      const configPath = path.join(tempDir, 'does-not-exist.json')
      await expect(loadConfigFromFile(configPath)).rejects.toThrow(
        'Config file not found'
      )
    })

    it('throws error for invalid JSON', async () => {
      const configPath = path.join(tempDir, 'invalid.json')
      fs.writeFileSync(configPath, '{ invalid json }')

      await expect(loadConfigFromFile(configPath)).rejects.toThrow(
        'Invalid JSON'
      )
    })
  })

  describe('validation', () => {
    it('rejects invalid model type', async () => {
      const configPath = path.join(tempDir, '.smithersrc')
      fs.writeFileSync(configPath, JSON.stringify({ model: 123 }))

      await expect(loadConfig(tempDir)).rejects.toThrow(
        "'model' must be a string"
      )
    })

    it('rejects invalid maxTokens type', async () => {
      const configPath = path.join(tempDir, '.smithersrc')
      fs.writeFileSync(configPath, JSON.stringify({ maxTokens: 'not-a-number' }))

      await expect(loadConfig(tempDir)).rejects.toThrow(
        "'maxTokens' must be a positive integer"
      )
    })

    it('rejects negative maxFrames', async () => {
      const configPath = path.join(tempDir, '.smithersrc')
      fs.writeFileSync(configPath, JSON.stringify({ maxFrames: -5 }))

      await expect(loadConfig(tempDir)).rejects.toThrow(
        "'maxFrames' must be a positive integer"
      )
    })

    it('rejects non-boolean autoApprove', async () => {
      const configPath = path.join(tempDir, '.smithersrc')
      fs.writeFileSync(configPath, JSON.stringify({ autoApprove: 'yes' }))

      await expect(loadConfig(tempDir)).rejects.toThrow(
        "'autoApprove' must be a boolean"
      )
    })
  })

  describe('mergeOptions', () => {
    it('CLI options override config file settings', () => {
      const cliOptions = {
        model: 'cli-model',
        verbose: true,
      }
      const config: SmithersConfig = {
        model: 'config-model',
        maxTokens: 4096,
        verbose: false,
      }

      const merged = mergeOptions(cliOptions, config)

      expect(merged.model).toBe('cli-model')
      expect(merged.verbose).toBe(true)
      expect(merged.maxTokens).toBe(4096) // From config
    })

    it('uses config values when CLI options are undefined', () => {
      const cliOptions = {
        model: undefined,
        verbose: undefined,
      }
      const config: SmithersConfig = {
        model: 'config-model',
        verbose: true,
      }

      const merged = mergeOptions(cliOptions, config)

      expect(merged.model).toBe('config-model')
      expect(merged.verbose).toBe(true)
    })

    it('handles empty config', () => {
      const cliOptions = {
        model: 'cli-model',
      }
      const config: SmithersConfig = {}

      const merged = mergeOptions(cliOptions, config)

      expect(merged.model).toBe('cli-model')
    })
  })

  describe('defineConfig', () => {
    it('returns the config object unchanged', () => {
      const config: SmithersConfig = {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 8192,
        autoApprove: false,
      }

      const result = defineConfig(config)

      expect(result).toEqual(config)
    })

    it('provides type safety for config objects', () => {
      // This is mainly a compile-time check
      const config = defineConfig({
        model: 'claude-opus-4-20250514',
        maxFrames: 100,
        timeout: 300,
        mockMode: true,
      })

      expect(config.model).toBe('claude-opus-4-20250514')
      expect(config.mockMode).toBe(true)
    })
  })
})
