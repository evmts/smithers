import { Command } from 'commander'
import pc from 'picocolors'
import ora from 'ora'
import * as fs from 'fs'
import * as path from 'path'

import { renderPlan } from '../../core/render.js'
import { executePlan } from '../../core/execute.js'
import { displayPlan, displayResult, displayError, info, success, warn } from '../display.js'
import { promptApproval } from '../prompt.js'
import { loadAgentFile } from '../loader.js'
import { loadConfig, mergeOptions, getConfigPath, type SmithersConfig } from '../config.js'

export const runCommand = new Command('run')
  .description('Run an agent from an MDX/TSX file')
  .argument('<file>', 'Path to the agent file (.mdx or .tsx)')
  .option('-y, --yes', 'Skip plan approval (auto-approve)')
  .option('-v, --verbose', 'Show detailed execution logs')
  .option('--dry-run', 'Show plan and exit without executing')
  .option('--max-frames <n>', 'Maximum execution frames')
  .option('--timeout <secs>', 'Timeout per frame in seconds')
  .option('-o, --output <file>', 'Write final result to file')
  .option('--json', 'Output results as JSON')
  .option('--model <model>', 'Claude model to use')
  .option('--max-tokens <n>', 'Maximum tokens for Claude responses')
  .option('--mock', 'Enable mock mode (no real API calls)')
  .option('-c, --config <file>', 'Path to config file')
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
  model?: string
  maxTokens?: string
  mock?: boolean
  config?: string
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
    // Load from specified config file
    const { loadConfigFromFile } = await import('../config.js')
    const configPath = path.resolve(process.cwd(), options.config)
    config = await loadConfigFromFile(configPath)
    info(`Using config from ${pc.cyan(options.config)}`)
  } else {
    // Auto-discover config file
    config = await loadConfig()
    const configPath = getConfigPath()
    if (configPath) {
      info(`Using config from ${pc.cyan(path.relative(process.cwd(), configPath))}`)
    }
  }

  // Merge CLI options with config (CLI takes precedence)
  // Convert CLI string options to numbers for merging
  const cliOptions: Partial<SmithersConfig> = {
    autoApprove: options.yes,
    mockMode: options.mock,
    verbose: options.verbose,
    model: options.model,
  }

  // Parse CLI numeric values if provided
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

  // Apply defaults after merging
  const maxFrames = merged.maxFrames ?? 100
  const timeout = merged.timeout ?? 300
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
  try {
    element = await loadAgentFile(filePath)
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

  // Execute the plan
  console.log()
  const execSpinner = ora('Executing plan...').start()

  // Show mock mode indicator
  if (mockMode) {
    info('Running in mock mode (no real API calls)')
  }

  const result = await executePlan(element, {
    maxFrames,
    timeout: timeout * 1000,
    verbose,
    mockMode,
    model: merged.model,
    maxTokens: merged.maxTokens,
    onFrame: (frame) => {
      if (verbose) {
        execSpinner.text = `Frame ${frame.frame}: ${frame.executedNodes.join(', ')}`
      }
    },
  })

  execSpinner.succeed(`Execution complete (${result.frames} frames)`)

  // Display or save result
  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output)
    const content = options.json
      ? JSON.stringify(result, null, 2)
      : String(result.output)
    fs.writeFileSync(outputPath, content)
    success(`Result written to ${options.output}`)
  } else if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    displayResult(result.output, result.frames, result.totalDuration)
  }
}
