import { Command } from 'commander'
import pc from 'picocolors'
import ora from 'ora'
import * as fs from 'fs'
import * as path from 'path'
import { executePlan, renderPlan } from '@evmts/smithers'
import type { SmithersDebugEvent } from '@evmts/smithers'
import { displaySuccess, displayError, displayFrame, displayRalph } from '../utils/display.js'

export const runCommand = new Command('run')
  .description('Execute an agent using the Ralph loop')
  .argument('<file>', 'Path to the agent file (.mdx or .tsx)')
  .option('-y, --yes', 'Skip plan approval (auto-approve)')
  .option('-v, --verbose', 'Show detailed execution logs (default: true)')
  .option('--dry-run', 'Show plan and exit without executing')
  .option('--max-frames <n>', 'Maximum execution frames', '100')
  .option('--timeout <ms>', 'Total execution timeout in milliseconds', '300000')
  .option('-o, --output <file>', 'Write final result to file')
  .option('--props <json>', 'JSON string of props to pass to the agent')
  .option('--mock', 'Enable mock mode (no real API calls)')
  .action(async (file: string, options) => {
    try {
      await run(file, options)
    } catch (error) {
      displayError((error as Error).message)
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
  props?: string
  mock?: boolean
}

async function run(file: string, options: RunOptions): Promise<void> {
  // Resolve file path
  const filePath = path.resolve(process.cwd(), file)

  // Check file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`)
  }

  // Parse props if provided
  let props = {}
  if (options.props) {
    try {
      props = JSON.parse(options.props)
    } catch (error) {
      throw new Error(`Invalid JSON in --props: ${error}`)
    }
  }

  // Load agent file
  const spinner = ora('Loading agent file...').start()
  let element

  try {
    // Dynamic import the agent file
    const fileUrl = `file://${filePath}`
    const module = await import(fileUrl)
    const defaultExport = module.default

    if (!defaultExport) {
      throw new Error('Agent file must have a default export')
    }

    // Handle both component and element exports
    if (typeof defaultExport === 'function') {
      const { createElement } = await import('react')
      element = createElement(defaultExport, props)
    } else {
      const { isValidElement, cloneElement } = await import('react')
      if (!isValidElement(defaultExport)) {
        throw new Error('Default export must be a React element or component')
      }
      element = Object.keys(props).length > 0 ? cloneElement(defaultExport, props) : defaultExport
    }

    spinner.succeed('Agent file loaded')
  } catch (error) {
    spinner.fail('Failed to load agent file')
    throw error
  }

  // Render plan
  displayRalph('Rendering execution plan...')
  const plan = await renderPlan(element)

  if (options.verbose !== false) {
    console.log('\n' + pc.dim('='.repeat(60)))
    console.log(pc.bold(pc.cyan('Execution Plan:')))
    console.log(pc.dim('='.repeat(60)))
    console.log(plan)
    console.log(pc.dim('='.repeat(60)) + '\n')
  }

  // Dry run mode
  if (options.dryRun) {
    displaySuccess('Dry run complete')
    return
  }

  // Prompt for approval
  if (!options.yes) {
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const answer = await new Promise<string>((resolve) => {
      rl.question(pc.cyan('Proceed with execution? (y/n): '), resolve)
    })

    rl.close()

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log(pc.yellow('Execution cancelled'))
      return
    }
  }

  // Execute
  const verbose = options.verbose !== false // Ralph is verbose by default

  displayRalph('Starting Ralph loop execution...')

  const result = await executePlan(element, {
    verbose,
    maxFrames: Number.parseInt(options.maxFrames || '100'),
    timeout: Number.parseInt(options.timeout || '300000'),
    mockMode: options.mock,
    debug: verbose
      ? {
          enabled: true,
          onEvent: (event: SmithersDebugEvent) => {
            if (event.type === 'frame:start') {
              displayFrame((event as any).frame || 0)
            }
          },
        }
      : undefined,
    onFrameUpdate: (tree, frame) => {
      if (verbose) {
        displayFrame(frame)
      }
    },
  })

  // Display result
  console.log()
  displaySuccess(`Ralph finished in ${result.frames} frames`)

  if (result.output !== undefined) {
    console.log('\n' + pc.bold('Output:'))
    console.log(JSON.stringify(result.output, null, 2))
  }

  // Save to file if requested
  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output)
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
    displaySuccess(`Result saved to ${outputPath}`)
  }
}
