import { Command } from 'commander'
import pc from 'picocolors'
import ora from 'ora'
import * as fs from 'fs'
import * as path from 'path'

import { renderPlan } from '../../core/render.js'
import { executePlan } from '../../core/execute.js'
import { displayPlan, displayResult, displayError, info, success, warn } from '../display.js'
import { promptApproval } from '../prompt.js'

export const runCommand = new Command('run')
  .description('Run an agent from an MDX/TSX file')
  .argument('<file>', 'Path to the agent file (.mdx or .tsx)')
  .option('-y, --yes', 'Skip plan approval (auto-approve)')
  .option('-v, --verbose', 'Show detailed execution logs')
  .option('--dry-run', 'Show plan and exit without executing')
  .option('--max-frames <n>', 'Maximum execution frames', '100')
  .option('--timeout <secs>', 'Timeout per frame in seconds', '300')
  .option('-o, --output <file>', 'Write final result to file')
  .option('--json', 'Output results as JSON')
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
  maxFrames: string
  timeout: string
  output?: string
  json?: boolean
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

  // Validate numeric options
  const maxFrames = parseInt(options.maxFrames, 10)
  const timeout = parseInt(options.timeout, 10)

  if (isNaN(maxFrames) || maxFrames <= 0) {
    throw new Error(`Invalid --max-frames value: ${options.maxFrames}. Must be a positive integer.`)
  }

  if (isNaN(timeout) || timeout <= 0) {
    throw new Error(`Invalid --timeout value: ${options.timeout}. Must be a positive integer.`)
  }

  // Check file extension
  const ext = path.extname(filePath)
  if (!['.mdx', '.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    warn(`Unexpected file extension: ${ext}`)
  }

  info(`Loading agent from ${pc.cyan(file)}`)

  // STUB: Load and compile the agent file
  // In real implementation, this would:
  // 1. Compile MDX/TSX using esbuild or Vite
  // 2. Import the compiled module
  // 3. Get the default export (React element)
  const spinner = ora('Compiling agent...').start()

  // Simulate compilation
  await new Promise((resolve) => setTimeout(resolve, 500))
  spinner.succeed('Agent compiled')

  // STUB: Create a placeholder element
  // In real implementation: const element = await import(compiledPath).default
  const element = null as any // Placeholder

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
  if (!options.yes) {
    const choice = await promptApproval()

    if (choice !== 'yes') {
      info('Execution cancelled')
      return
    }
  }

  // Execute the plan
  console.log()
  const execSpinner = ora('Executing plan...').start()

  const result = await executePlan(element, {
    maxFrames,
    timeout: timeout * 1000,
    verbose: options.verbose,
    onFrame: (frame) => {
      if (options.verbose) {
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
