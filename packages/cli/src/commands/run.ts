import { Command } from 'commander'
import pc from 'picocolors'
import ora from 'ora'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'

import { renderPlan, executePlan, DebugCollector } from '@evmts/smithers'
import type { SmithersDebugEvent } from '@evmts/smithers'
import { displayPlan, displayResult, displayError, info, success, warn } from '../display.js'
import { promptApproval } from '../prompt.js'
import { loadAgentFile } from '../loader.js'
import { loadConfig, mergeOptions, getConfigPath, type SmithersConfig } from '../config.js'
import { parseProps } from '../props.js'
import { TauriBridge } from '../tauri-bridge.js'

export const runCommand = new Command('run')
  .description('Run an agent from an MDX/TSX file')
  .argument('<file>', 'Path to the agent file (.mdx or .tsx)')
  .option('-y, --yes', 'Skip plan approval (auto-approve)')
  .option('--auto-approve', 'Alias for --yes')
  .option('-v, --verbose', 'Show detailed execution logs')
  .option('--dry-run', 'Show plan and exit without executing')
  .option('--max-frames <n>', 'Maximum execution frames')
  .option('--timeout <ms>', 'Total execution timeout in milliseconds')
  .option('-o, --output <file>', 'Write final result to file')
  .option('--json', 'Output results as JSON')
  .option('-p, --props <json>', 'JSON string of props to pass to the agent')
  .option('--model <model>', 'Claude model to use')
  .option('--max-tokens <n>', 'Maximum tokens for Claude responses')
  .option('--mock', 'Enable mock mode (no real API calls)')
  .option('-c, --config <file>', 'Path to config file')
  .option('--no-desktop', 'Disable desktop app integration')
  .action(async (file: string, options) => {
    try {
      await run(file, options)
    } catch (error) {
      displayError(error as Error)
      process.exit(1)
    }
  })

interface RunOptions {
  yes?: boolean
  verbose?: boolean
  dryRun?: boolean
  maxFrames?: string
  timeout?: string
  output?: string
  json?: boolean
  props?: string
  model?: string
  maxTokens?: string
  mock?: boolean
  autoApprove?: boolean
  config?: string
  desktop?: boolean
}

async function run(file: string, options: RunOptions): Promise<void> {
  // Resolve file path
  const filePath = path.resolve(process.cwd(), file)

  // Check file exists and is a file (not directory)
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`)
  }

  // Load config file
  let config: SmithersConfig = {}
  if (options.config) {
    const { loadConfigFromFile } = await import('../config.js')
    const configPath = path.resolve(process.cwd(), options.config)
    config = await loadConfigFromFile(configPath)
    info(`Using config from ${pc.cyan(options.config)}`)
  } else {
    config = await loadConfig()
    const configPath = getConfigPath()
    if (configPath) {
      info(`Using config from ${pc.cyan(path.relative(process.cwd(), configPath))}`)
    }
  }

  // Merge CLI options with config (CLI takes precedence)
  const cliOptions: Partial<SmithersConfig> = {
    autoApprove: options.yes || options.autoApprove,
    mockMode: options.mock,
    verbose: options.verbose,
    model: options.model,
  }

  if (options.maxFrames !== undefined) {
    const parsed = Number(options.maxFrames)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid --max-frames value: ${options.maxFrames}. Must be a positive integer.`)
    }
    cliOptions.maxFrames = parsed
  }

  if (options.timeout !== undefined) {
    const parsed = Number(options.timeout)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid --timeout value: ${options.timeout}. Must be a positive integer.`)
    }
    cliOptions.timeout = parsed
  }

  if (options.maxTokens !== undefined) {
    const parsed = Number(options.maxTokens)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid --max-tokens value: ${options.maxTokens}. Must be a positive integer.`)
    }
    cliOptions.maxTokens = parsed
  }

  const merged = mergeOptions<Partial<SmithersConfig>>(cliOptions, config)

  const maxFrames = merged.maxFrames ?? 100
  const timeout = merged.timeout ?? 300000
  const verbose = merged.verbose ?? false
  const autoApprove = merged.autoApprove ?? false
  const mockMode = merged.mockMode ?? false

  // Check file extension
  const ext = path.extname(filePath)
  if (!['.mdx', '.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    warn(`Unexpected file extension: ${ext}`)
  }

  info(`Loading agent from ${pc.cyan(file)}`)

  // Load and compile the agent file
  const spinner = ora('Compiling agent...').start()

  let element
  const props = parseProps(options.props)
  try {
    element = await loadAgentFile(filePath, { props })
    spinner.succeed('Agent compiled')
  } catch (error) {
    spinner.fail('Failed to compile agent')
    throw error
  }

  // Render the plan
  const planSpinner = ora('Rendering plan...').start()
  const plan = await renderPlan(element)
  planSpinner.succeed('Plan rendered')

  // Display the plan
  displayPlan(plan)

  // Dry run - exit here
  if (options.dryRun) {
    info('Dry run - exiting without execution')
    return
  }

  // Get approval (unless auto-approved)
  if (!autoApprove) {
    const choice = await promptApproval()
    if (choice !== 'yes') {
      info('Execution cancelled')
      return
    }
  }

  console.log()

  // Initialize Tauri bridge if desktop integration is enabled
  let tauriBridge: TauriBridge | null = null
  const desktopEnabled = options.desktop !== false

  if (desktopEnabled) {
    tauriBridge = new TauriBridge()
    const connected = await tauriBridge.connect()

    if (connected) {
      info(`Connected to Smithers Desktop. Press ${pc.cyan("'o'")} to open the app.`)
      setupKeyboardShortcuts()
    } else {
      info(pc.dim('Smithers Desktop not running. Start it for rich visualization.'))
    }
  }

  // Create session ID
  const sessionId = `session-${Date.now()}`

  // Show mock mode indicator
  if (mockMode) {
    info('Running in mock mode (no real API calls)')
  }

  // Send session start to Tauri
  if (tauriBridge?.isConnected) {
    tauriBridge.sendSessionStart(sessionId, file, {
      maxFrames,
      timeout,
      mockMode,
      model: merged.model,
    })
  }

  // Create debug collector for events
  const debugCollector = new DebugCollector({
    enabled: true,
    includeTreeSnapshots: true,
    onEvent: (event: SmithersDebugEvent) => {
      // Print minimal log to CLI
      if (verbose) {
        printEventToConsole(event)
      }

      // Forward to Tauri
      if (tauriBridge?.isConnected) {
        tauriBridge.sendExecutionEvent(sessionId, event)
      }
    },
  })

  // Execute the plan
  const execSpinner = ora('Executing...').start()
  const startTime = Date.now()

  try {
    const result = await executePlan(element, {
      maxFrames,
      timeout,
      verbose,
      mockMode,
      model: merged.model,
      maxTokens: merged.maxTokens,
      debug: {
        enabled: true,
        includeTreeSnapshots: true,
        onEvent: debugCollector.onEvent,
      },
      onFrameUpdate: async (tree, frame) => {
        execSpinner.text = `Frame ${frame}...`

        // Send tree update to Tauri
        if (tauriBridge?.isConnected) {
          const snapshot = debugCollector.createTreeSnapshot(tree)
          tauriBridge.sendTreeUpdate(sessionId, snapshot, frame)
        }
      },
    })

    execSpinner.succeed(`Execution complete (${result.frames} frames, ${formatDuration(result.totalDuration)})`)

    // Send session end to Tauri
    if (tauriBridge?.isConnected) {
      tauriBridge.sendSessionEnd(sessionId, 'success', result.output, result.frames, result.totalDuration)
    }

    // Display or save result
    if (options.output) {
      const outputPath = path.resolve(process.cwd(), options.output)
      const content = options.json ? JSON.stringify(result, null, 2) : String(result.output)
      fs.writeFileSync(outputPath, content)
      success(`Result written to ${options.output}`)
    } else if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      displayResult(result.output, result.frames, result.totalDuration)
    }
  } catch (error) {
    execSpinner.fail('Execution failed')

    if (tauriBridge?.isConnected) {
      tauriBridge.sendSessionEnd(sessionId, 'error', undefined, 0, Date.now() - startTime, (error as Error).message)
    }

    throw error
  } finally {
    // Cleanup
    if (tauriBridge) {
      tauriBridge.disconnect()
    }
    cleanupKeyboardShortcuts()
  }
}

/**
 * Print debug event to console (minimal output)
 */
function printEventToConsole(event: SmithersDebugEvent): void {
  switch (event.type) {
    case 'node:execute:start':
      console.log(pc.dim(`  Starting ${event.nodeType}...`))
      break
    case 'node:execute:end':
      if (event.status === 'error') {
        console.log(pc.red(`  Error: ${event.error}`))
      }
      break
    case 'loop:terminated':
      console.log(pc.dim(`  Terminated: ${event.reason}`))
      break
  }
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Set up keyboard shortcuts for desktop integration
 */
let keyboardHandler: ((data: Buffer) => void) | null = null

function setupKeyboardShortcuts(): void {
  if (!process.stdin.isTTY) return

  process.stdin.setRawMode(true)
  process.stdin.resume()

  keyboardHandler = (key: Buffer) => {
    const char = key.toString()

    if (char === 'o' || char === 'O') {
      openTauriApp()
    } else if (char === '\u0003') {
      // Ctrl+C
      cleanupKeyboardShortcuts()
      process.exit()
    }
  }

  process.stdin.on('data', keyboardHandler)
}

function cleanupKeyboardShortcuts(): void {
  if (keyboardHandler) {
    process.stdin.removeListener('data', keyboardHandler)
    keyboardHandler = null
  }
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

/**
 * Open the Tauri desktop app
 */
function openTauriApp(): void {
  const appPath = getTauriAppPath()

  if (appPath) {
    info('Opening Smithers Desktop...')
    if (process.platform === 'darwin') {
      spawn('open', ['-a', appPath], { detached: true, stdio: 'ignore' })
    } else if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', appPath], { detached: true, stdio: 'ignore' })
    } else {
      spawn(appPath, [], { detached: true, stdio: 'ignore' })
    }
  } else {
    warn('Smithers Desktop app not found.')
  }
}

/**
 * Get the path to the Tauri app
 */
function getTauriAppPath(): string | null {
  if (process.platform === 'darwin') {
    const paths = [
      '/Applications/Smithers.app',
      path.join(process.env.HOME || '', 'Applications/Smithers.app'),
    ]
    for (const p of paths) {
      if (fs.existsSync(p)) return p
    }
  } else if (process.platform === 'win32') {
    const paths = [
      path.join(process.env.LOCALAPPDATA || '', 'Smithers', 'Smithers.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Smithers', 'Smithers.exe'),
    ]
    for (const p of paths) {
      if (fs.existsSync(p)) return p
    }
  } else {
    // Linux
    const paths = [
      '/usr/bin/smithers',
      '/usr/local/bin/smithers',
      path.join(process.env.HOME || '', '.local/bin/smithers'),
    ]
    for (const p of paths) {
      if (fs.existsSync(p)) return p
    }
  }

  return null
}
