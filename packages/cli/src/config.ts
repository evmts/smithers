import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'

/**
 * Configuration options for Smithers CLI
 */
export interface SmithersConfig {
  /**
   * Claude model to use (e.g., 'claude-sonnet-4-20250514', 'claude-opus-4-20250514')
   */
  model?: string

  /**
   * Maximum tokens for Claude responses
   */
  maxTokens?: number

  /**
   * Maximum execution frames before stopping
   */
  maxFrames?: number

  /**
   * Total execution timeout in milliseconds
   */
  timeout?: number

  /**
   * Auto-approve execution without prompting
   */
  autoApprove?: boolean

  /**
   * Enable mock mode for testing (no real API calls)
   */
  mockMode?: boolean

  /**
   * Enable verbose logging
   */
  verbose?: boolean
}

/**
 * Config file names to search for, in order of priority
 */
const CONFIG_FILES = [
  '.smithersrc',
  '.smithersrc.json',
  'smithers.config.js',
  'smithers.config.mjs',
  'smithers.config.ts',
]

/**
 * Find the config file in the given directory or its parents
 */
function findConfigFile(startDir: string): string | null {
  let currentDir = startDir

  while (true) {
    for (const configFile of CONFIG_FILES) {
      const configPath = path.join(currentDir, configFile)
      if (fs.existsSync(configPath)) {
        return configPath
      }
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      // Reached filesystem root
      break
    }
    currentDir = parentDir
  }

  return null
}

/**
 * Load a JSON config file (.smithersrc or .smithersrc.json)
 */
function loadJsonConfig(configPath: string): SmithersConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    return validateConfig(config, configPath)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in config file: ${configPath}\n` +
          `Reason: ${error.message}`
      )
    }
    throw error
  }
}

/**
 * Load a JavaScript/TypeScript config file
 */
async function loadJsConfig(configPath: string): Promise<SmithersConfig> {
  try {
    const fileUrl = pathToFileURL(configPath).href
    const module = await import(fileUrl)
    const config = module.default || module
    return validateConfig(config, configPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Provide helpful error message for TypeScript config files
    if (configPath.endsWith('.ts') && message.includes('Unknown file extension')) {
      throw new Error(
        `Failed to load TypeScript config file: ${configPath}\n` +
          `Smithers requires Bun to load .ts config files.\n` +
          `Make sure you're running with Bun, or use .js/.mjs config files instead.`
      )
    }

    throw new Error(
      `Failed to load config file: ${configPath}\n` +
        `Reason: ${message}`
    )
  }
}

/**
 * Validate config object and return typed config
 */
function validateConfig(config: unknown, configPath: string): SmithersConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error(
      `Invalid config in ${configPath}: expected an object`
    )
  }

  const obj = config as Record<string, unknown>
  const validated: SmithersConfig = {}

  // Validate model
  if (obj.model !== undefined) {
    if (typeof obj.model !== 'string') {
      throw new Error(`Invalid config: 'model' must be a string`)
    }
    validated.model = obj.model
  }

  // Validate maxTokens
  if (obj.maxTokens !== undefined) {
    if (typeof obj.maxTokens !== 'number' || !Number.isInteger(obj.maxTokens) || obj.maxTokens <= 0) {
      throw new Error(`Invalid config: 'maxTokens' must be a positive integer`)
    }
    validated.maxTokens = obj.maxTokens
  }

  // Validate maxFrames
  if (obj.maxFrames !== undefined) {
    if (typeof obj.maxFrames !== 'number' || !Number.isInteger(obj.maxFrames) || obj.maxFrames <= 0) {
      throw new Error(`Invalid config: 'maxFrames' must be a positive integer`)
    }
    validated.maxFrames = obj.maxFrames
  }

  // Validate timeout
  if (obj.timeout !== undefined) {
    if (typeof obj.timeout !== 'number' || !Number.isInteger(obj.timeout) || obj.timeout <= 0) {
      throw new Error(`Invalid config: 'timeout' must be a positive integer`)
    }
    validated.timeout = obj.timeout
  }

  // Validate autoApprove
  if (obj.autoApprove !== undefined) {
    if (typeof obj.autoApprove !== 'boolean') {
      throw new Error(`Invalid config: 'autoApprove' must be a boolean`)
    }
    validated.autoApprove = obj.autoApprove
  }

  // Validate mockMode
  if (obj.mockMode !== undefined) {
    if (typeof obj.mockMode !== 'boolean') {
      throw new Error(`Invalid config: 'mockMode' must be a boolean`)
    }
    validated.mockMode = obj.mockMode
  }

  // Validate verbose
  if (obj.verbose !== undefined) {
    if (typeof obj.verbose !== 'boolean') {
      throw new Error(`Invalid config: 'verbose' must be a boolean`)
    }
    validated.verbose = obj.verbose
  }

  return validated
}

/**
 * Load configuration from a config file
 * Searches for config files starting from the given directory
 *
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns Loaded config or empty object if no config file found
 */
export async function loadConfig(startDir?: string): Promise<SmithersConfig> {
  const searchDir = startDir || process.cwd()
  const configPath = findConfigFile(searchDir)

  if (!configPath) {
    return {}
  }

  const ext = path.extname(configPath)
  const basename = path.basename(configPath)

  // JSON files (.smithersrc, .smithersrc.json)
  if (basename === '.smithersrc' || ext === '.json') {
    return loadJsonConfig(configPath)
  }

  // JavaScript/TypeScript files
  if (['.js', '.mjs', '.ts'].includes(ext)) {
    return loadJsConfig(configPath)
  }

  // Fallback to JSON for unknown extensions
  return loadJsonConfig(configPath)
}

/**
 * Load config from a specific file path
 *
 * @param configPath - Path to the config file
 * @returns Loaded config
 */
export async function loadConfigFromFile(configPath: string): Promise<SmithersConfig> {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }

  const ext = path.extname(configPath)
  const basename = path.basename(configPath)

  if (basename === '.smithersrc' || ext === '.json') {
    return loadJsonConfig(configPath)
  }

  if (['.js', '.mjs', '.ts'].includes(ext)) {
    return loadJsConfig(configPath)
  }

  return loadJsonConfig(configPath)
}

/**
 * Merge CLI options with config file settings
 * CLI options take precedence over config file settings
 *
 * @param cliOptions - Options from CLI flags
 * @param config - Config loaded from file
 * @returns Merged options
 */
export function mergeOptions<T extends Record<string, unknown>>(
  cliOptions: T,
  config: SmithersConfig
): T & SmithersConfig {
  const merged: Record<string, unknown> = { ...config }

  // CLI options override config file settings
  for (const [key, value] of Object.entries(cliOptions)) {
    // Only override if CLI option was explicitly provided
    // (undefined means not provided, null or other values mean provided)
    if (value !== undefined) {
      merged[key] = value
    }
  }

  return merged as T & SmithersConfig
}

/**
 * Get the path to the loaded config file, if any
 */
export function getConfigPath(startDir?: string): string | null {
  return findConfigFile(startDir || process.cwd())
}

/**
 * Define configuration with type safety (for JS/TS config files)
 *
 * Note: TypeScript config files (.ts) require Bun runtime. Use .js or .mjs
 * config files if running in Node.js.
 *
 * @example
 * // smithers.config.ts
 * import { defineConfig } from '@evmts/smithers'
 *
 * export default defineConfig({
 *   model: 'claude-sonnet-4-20250514',
 *   maxTokens: 4096,
 *   autoApprove: false,
 * })
 */
export function defineConfig(config: SmithersConfig): SmithersConfig {
  return config
}
