import { Command } from 'commander'
import pc from 'picocolors'
import ora from 'ora'
import * as fs from 'fs'
import * as path from 'path'

import { renderPlan } from '../../core/render.js'
import { displayPlan, displayError, info } from '../display.js'

export const planCommand = new Command('plan')
  .description('Render and display the XML plan without executing')
  .argument('<file>', 'Path to the agent file (.mdx or .tsx)')
  .option('--json', 'Output plan as JSON instead of XML')
  .option('-o, --output <file>', 'Write plan to file')
  .action(async (file: string, options) => {
    try {
      await plan(file, options)
    } catch (error) {
      displayError(error as Error)
      process.exit(1)
    }
  })

interface PlanOptions {
  json?: boolean
  output?: string
}

async function plan(file: string, options: PlanOptions): Promise<void> {
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

  info(`Loading agent from ${pc.cyan(file)}`)

  // STUB: Load and compile the agent file
  const spinner = ora('Compiling agent...').start()
  await new Promise((resolve) => setTimeout(resolve, 500))
  spinner.succeed('Agent compiled')

  // STUB: Create a placeholder element
  const element = null as any

  // Render the plan
  const planSpinner = ora('Rendering plan...').start()
  const planXml = await renderPlan(element)
  planSpinner.succeed('Plan rendered')

  // Output the plan
  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output)

    if (options.json) {
      // Convert XML to JSON structure (simplified)
      const jsonPlan = { xml: planXml }
      fs.writeFileSync(outputPath, JSON.stringify(jsonPlan, null, 2))
    } else {
      fs.writeFileSync(outputPath, planXml)
    }

    info(`Plan written to ${pc.cyan(options.output)}`)
  } else if (options.json) {
    console.log(JSON.stringify({ xml: planXml }, null, 2))
  } else {
    displayPlan(planXml)
  }
}
